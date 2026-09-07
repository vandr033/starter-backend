import { CompanyUserRole } from '@prisma/client';
import { prisma } from '../prisma/client';
import {
    getCustomerBookingHistory,
    getCustomersWithBookingStats,
    type CustomerWithStats,
} from '../repositories/customer.repo';
import * as UserRepo from '../repositories/user.repo';
import { sendCustomerMassMessageEmail } from '../utils/sendEmail';
import { queueWhatsappBatch } from '../utils/whatsappSender';
import { logger } from '../config/logger';
import axios from 'axios';
import * as GroupPaymentsService from './group-payments.service';
import { canonicalizePhoneParts } from '../utils/phoneNormalization';
import {
    BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
    BETTER_AUTH_CREDENTIAL_PROVIDER_IDS,
} from '../config/auth-constants';

// Runtime import to avoid compile-time type dependency in environments without installed typings.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx');

interface ParsedImportRow {
    row: number;
    name: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    phonePrefix: string;
    notes: string | null;
}

interface ImportSummary {
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    createdUsers: number;
    linkedExistingUsers: number;
    createdCompanyUsers: number;
    createdProfiles: number;
    restoredCompanyUsers: number;
    restoredProfiles: number;
    skipped: Array<{ row: number; reason: string }>;
}

interface SendMassCustomerMessageInput {
    message: string;
    search?: string;
    segment?: CustomerSegmentKey;
    idempotencyKey?: string;
}

interface CustomerExportOptions {
    search?: string;
    segment?: CustomerSegmentKey;
    requestedByUserId?: string;
}

export type CustomerSegmentKey =
    | 'ALL'
    | 'RETURNING'
    | 'INACTIVE_90_DAYS'
    | 'UPCOMING'
    | 'HIGH_VALUE';

const DEFAULT_LANGUAGE_KEY = 'default_language';
const N8N_CUSTOMER_EXPORT_WEBHOOK_URL = (process.env.N8N_CUSTOMER_EXPORT_WEBHOOK_URL || '').trim();
const N8N_CUSTOMER_EXPORT_TIMEOUT_MS = Number(process.env.N8N_CUSTOMER_EXPORT_TIMEOUT_MS || '10000');

function normalizeEmail(email?: string | null): string | null {
    const value = (email || '').trim().toLowerCase();
    return value || null;
}

function normalizePhone(phone?: string | null): string | null {
    const value = (phone || '').replace(/\D/g, '');
    return value || null;
}

function normalizePrefix(prefix?: string | null): string {
    const value = (prefix || '591').replace(/\D/g, '');
    return value || '591';
}

function splitFullName(fullName: string): { firstName: string | null; lastName: string | null; displayName: string } {
    const cleaned = fullName.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
        return {
            firstName: null,
            lastName: null,
            displayName: '',
        };
    }

    const parts = cleaned.split(' ');
    return {
        firstName: parts[0] || null,
        lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
        displayName: cleaned,
    };
}

function buildFullPhone(prefix?: string | null, phone?: string | null): string | null {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) return null;
    const cleanPrefix = normalizePrefix(prefix || '591');
    return `${cleanPrefix}${cleanPhone}`;
}

export function normalizeCustomerSegment(value?: string | null): CustomerSegmentKey {
    if (value === 'RETURNING') return 'RETURNING';
    if (value === 'INACTIVE_90_DAYS') return 'INACTIVE_90_DAYS';
    if (value === 'UPCOMING') return 'UPCOMING';
    if (value === 'HIGH_VALUE') return 'HIGH_VALUE';
    return 'ALL';
}

function isCustomerInactiveFor90Days(customer: CustomerWithStats): boolean {
    if (customer.nextBookingAt) return false;
    if (!customer.lastBookingAt) return true;

    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    return customer.lastBookingAt.getTime() < ninetyDaysAgo;
}

function matchesCustomerSegment(
    customer: CustomerWithStats,
    segment: CustomerSegmentKey,
): boolean {
    switch (segment) {
        case 'RETURNING':
            return customer.completedBookings >= 2;
        case 'INACTIVE_90_DAYS':
            return isCustomerInactiveFor90Days(customer);
        case 'UPCOMING':
            return Boolean(customer.nextBookingAt);
        case 'HIGH_VALUE':
            return customer.totalSpentCents >= 50_000;
        case 'ALL':
        default:
            return true;
    }
}

function applyCustomerSegment(
    customers: CustomerWithStats[],
    segment: CustomerSegmentKey,
): CustomerWithStats[] {
    if (segment === 'ALL') {
        return customers;
    }

    return customers.filter((customer) => matchesCustomerSegment(customer, segment));
}

function getCellValue(row: Record<string, any>, keys: string[]): string {
    for (const key of keys) {
        const value = row[key];
        if (value !== undefined && value !== null) {
            const asString = String(value).trim();
            if (asString.length > 0) return asString;
        }
    }
    return '';
}

function parseImportRows(buffer: Buffer): ParsedImportRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];

    return rows.map((row: Record<string, any>, index: number) => {
        const rowNumber = index + 2; // Header is row 1
        const email = normalizeEmail(getCellValue(row, ['email', 'correo', 'mail']));
        const phone = normalizePhone(getCellValue(row, ['phone', 'telefono', 'teléfono', 'mobile', 'celular']));
        const phonePrefix = normalizePrefix(
            getCellValue(row, ['phone_prefix', 'prefix', 'prefijo', 'country_code']),
        );
        const firstName = getCellValue(row, ['first_name', 'nombre']).trim() || null;
        const lastName = getCellValue(row, ['last_name', 'apellido']).trim() || null;

        let name = getCellValue(row, ['name', 'full_name', 'nombre_completo']).trim();
        if (!name && firstName) {
            name = `${firstName}${lastName ? ` ${lastName}` : ''}`.trim();
        }
        if (!name && email) {
            name = email.split('@')[0];
        }
        if (!name && phone) {
            name = `Cliente ${phone.slice(-4)}`;
        }

        return {
            row: rowNumber,
            name: name || '',
            firstName,
            lastName,
            email,
            phone,
            phonePrefix,
            notes: getCellValue(row, ['notes', 'notas']).trim() || null,
        };
    });
}

function formatDateIso(date: Date | null | undefined): string {
    if (!date) return '';
    return date.toISOString();
}

function toCsvValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/"/g, '""');
    return /[",\n]/.test(text) ? `"${text}"` : text;
}

function buildCustomersCsv(customers: CustomerWithStats[]): string {
    const headers = [
        'name',
        'email',
        'phone_prefix',
        'phone',
        'total_bookings',
        'completed_bookings',
        'cancelled_bookings',
        'no_show_bookings',
        'total_spent_cents',
        'avg_ticket_cents',
        'last_booking_at',
        'next_booking_at',
        'favorite_staff',
        'preferred_service',
        'preferred_category',
        'booking_frequency_per_month',
    ];

    const rows = customers.map((customer) => [
        customer.name,
        customer.email,
        customer.phonePrefix,
        customer.phone,
        customer.totalBookings,
        customer.completedBookings,
        customer.cancelledBookings,
        customer.noShowBookings,
        customer.totalSpentCents,
        customer.avgTicketCents,
        formatDateIso(customer.lastBookingAt),
        formatDateIso(customer.nextBookingAt),
        customer.favoriteStaffName,
        customer.preferredServiceName,
        customer.preferredCategoryName,
        customer.bookingFrequencyPerMonth,
    ]);

    return [headers, ...rows]
        .map((row) => row.map((cell) => toCsvValue(cell)).join(','))
        .join('\n');
}

async function triggerCustomerExportWebhook(params: {
    companyId: number;
    companyName: string;
    requestedByUserId?: string;
    search?: string;
    segment?: CustomerSegmentKey;
    customers: CustomerWithStats[];
}) {
    if (!N8N_CUSTOMER_EXPORT_WEBHOOK_URL) {
        return { triggered: false };
    }

    const payload = {
        company: {
            id: params.companyId,
            name: params.companyName,
        },
        requestedBy: {
            userId: params.requestedByUserId || null,
        },
        filters: {
            search: params.search || null,
            segment: params.segment || null,
        },
        exportedAt: new Date().toISOString(),
        customers: params.customers.map((customer) => ({
            customerKey: customer.customerKey,
            name: customer.name,
            email: customer.email,
            phonePrefix: customer.phonePrefix,
            phone: customer.phone,
            totalBookings: customer.totalBookings,
            completedBookings: customer.completedBookings,
            cancelledBookings: customer.cancelledBookings,
            noShowBookings: customer.noShowBookings,
            totalSpentCents: customer.totalSpentCents,
            avgTicketCents: customer.avgTicketCents,
            lastBookingAt: formatDateIso(customer.lastBookingAt),
            nextBookingAt: formatDateIso(customer.nextBookingAt),
            favoriteStaffName: customer.favoriteStaffName,
            preferredServiceName: customer.preferredServiceName,
            preferredCategoryName: customer.preferredCategoryName,
            bookingFrequencyPerMonth: customer.bookingFrequencyPerMonth,
        })),
    };

    await axios.post(N8N_CUSTOMER_EXPORT_WEBHOOK_URL, payload, {
        timeout: Number.isFinite(N8N_CUSTOMER_EXPORT_TIMEOUT_MS)
            ? N8N_CUSTOMER_EXPORT_TIMEOUT_MS
            : 10_000,
        headers: {
            'Content-Type': 'application/json',
        },
    });

    return { triggered: true };
}

async function ensureUniqueTempEmail(basePhone: string): Promise<string> {
    let attempt = 0;
    while (attempt < 1000) {
        const suffix = attempt === 0 ? '' : `.${attempt}`;
        const email = `${basePhone}${suffix}@tmppriconpri.com`;
        const existing = await prisma.user.findFirst({
            where: { email, deleted_at: null },
            select: { id: true },
        });
        if (!existing) return email;
        attempt += 1;
    }
    return `${basePhone}.${Date.now()}@tmppriconpri.com`;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function listCustomers(
    companyId: number,
    search?: string,
    segment: CustomerSegmentKey = 'ALL',
) {
    const customers = await getCustomersWithBookingStats(companyId, search);
    return applyCustomerSegment(customers, segment);
}

export async function listInterestCaptureLeads(companyId: number) {
    const [
        legacyEventInterests,
        freeEventInterests,
        classInterests,
        classEnrollments,
    ] = await Promise.all([
        prisma.groupEventInterest.findMany({
            where: {
                company_id: companyId,
                group_event: { is_free: true, deleted_at: null },
            },
            include: {
                group_event: { select: { id: true, title: true, start_at: true } },
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phoneNumber: true,
                        phone_prefix: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        }),
        prisma.freeEventRegistration.findMany({
            where: {
                company_id: companyId,
                status: 'INTERESTED',
                group_event: { is_free: true, deleted_at: null },
            },
            include: {
                group_event: { select: { id: true, title: true, start_at: true } },
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phoneNumber: true,
                        phone_prefix: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        }),
        prisma.groupClassInterest.findMany({
            where: {
                company_id: companyId,
                group_class: { deleted_at: null },
            },
            include: {
                group_class: { select: { id: true, title: true, recurrence_start_date: true } },
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phoneNumber: true,
                        phone_prefix: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        }),
        prisma.groupClassEnrollment.findMany({
            where: {
                company_id: companyId,
                group_class: { deleted_at: null },
            },
            include: {
                group_class: { select: { id: true, title: true, recurrence_start_date: true } },
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phoneNumber: true,
                        phone_prefix: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
        }),
    ]);

    const rows = [
        ...legacyEventInterests.map((row) => ({
            id: `event-interest-${row.id}`,
            source: 'EVENT' as const,
            sourceLabel: 'Evento',
            itemId: row.group_event_id,
            itemTitle: row.group_event.title,
            itemDate: row.group_event.start_at,
            personName: row.user.name,
            email: row.user.email,
            phonePrefix: row.user.phone_prefix,
            phoneNumber: row.user.phoneNumber,
            status: 'INTERESTED',
            createdAt: row.created_at,
        })),
        ...freeEventInterests.map((row) => {
            const fallbackName = [row.first_name, row.last_name]
                .map((value) => value?.trim() ?? '')
                .filter((value) => value.length > 0)
                .join(' ');
            return {
                id: `free-event-interest-${row.id}`,
                source: 'EVENT' as const,
                sourceLabel: 'Evento',
                itemId: row.group_event_id,
                itemTitle: row.group_event.title,
                itemDate: row.group_event.start_at,
                personName: row.user?.name ?? fallbackName,
                email: row.user?.email ?? row.email,
                phonePrefix: row.user?.phone_prefix ?? row.phone_prefix,
                phoneNumber: row.user?.phoneNumber ?? row.phone_number,
                status: row.status,
                createdAt: row.created_at,
            };
        }),
        ...classInterests.map((row) => ({
            id: `class-interest-${row.id}`,
            source: 'CLASS' as const,
            sourceLabel: 'Clase',
            itemId: row.group_class_id,
            itemTitle: row.group_class.title,
            itemDate: row.group_class.recurrence_start_date,
            personName: row.user.name,
            email: row.user.email,
            phonePrefix: row.user.phone_prefix,
            phoneNumber: row.user.phoneNumber,
            status: 'INTERESTED',
            createdAt: row.created_at,
        })),
        ...classEnrollments.map((row) => ({
            id: `class-enrollment-${row.id}`,
            source: 'CLASS' as const,
            sourceLabel: 'Clase',
            itemId: row.group_class_id,
            itemTitle: row.group_class.title,
            itemDate: row.group_class.recurrence_start_date,
            personName: row.user.name,
            email: row.user.email,
            phonePrefix: row.user.phone_prefix,
            phoneNumber: row.user.phoneNumber,
            status: row.status,
            createdAt: row.created_at,
        })),
    ];

    const deduped = new Map<string, (typeof rows)[number]>();
    rows
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .forEach((row) => {
            const email = row.email?.trim().toLowerCase();
            const phone = buildFullPhone(row.phonePrefix, row.phoneNumber);
            const key = `${row.source}:${row.itemId}:${email || phone || row.id}`;
            if (!deduped.has(key)) deduped.set(key, row);
        });

    return Array.from(deduped.values()).map((row) => ({
        ...row,
        itemDate: row.itemDate?.toISOString?.() ?? null,
        createdAt: row.createdAt.toISOString(),
    }));
}

export async function getCustomersHistory(
    companyId: number,
    params: { customerKey: string; page: number; limit: number }
) {
    if (!params.customerKey || !params.customerKey.trim()) {
        return {
            code: 400,
            error: true,
            message: 'customer_key is required',
        };
    }

    const result = await getCustomerBookingHistory({
        companyId,
        customerKey: params.customerKey.trim(),
        page: params.page,
        limit: params.limit,
    });

    return {
        code: 200,
        error: false,
        message: 'Customer booking history retrieved successfully',
        data: result,
    };
}

export async function getCustomerGroupPayments(
    companyId: number,
    params: { customerKey: string; page: number; limit: number }
) {
    if (!params.customerKey || !params.customerKey.trim()) {
        return {
            code: 400,
            error: true,
            message: 'customer_key is required',
        };
    }

    return GroupPaymentsService.getCustomerGroupPayments(
        companyId,
        params.customerKey.trim(),
        params.page,
        params.limit,
    );
}

export async function getCustomerByKey(companyId: number, customerKey: string) {
    const normalizedKey = (customerKey || '').trim();
    if (!normalizedKey) {
        return {
            code: 400,
            error: true,
            message: 'customer_key is required',
        };
    }

    const customers = await getCustomersWithBookingStats(companyId);
    const customer = customers.find((row) => row.customerKey === normalizedKey) || null;

    if (!customer) {
        return {
            code: 404,
            error: true,
            message: 'Customer not found',
        };
    }

    return {
        code: 200,
        error: false,
        message: 'Customer retrieved successfully',
        data: customer,
    };
}

export async function updateCustomerByKey(
    companyId: number,
    customerKey: string,
    input: {
        name?: string;
        email?: string | null;
        phone?: string | null;
        phone_prefix?: string | null;
        country_code?: string | null;
        notes?: string | null;
    },
) {
    const normalizedKey = (customerKey || '').trim();
    if (!normalizedKey) {
        return {
            code: 400,
            error: true,
            message: 'customer_key is required',
        };
    }

    const currentResult = await getCustomerByKey(companyId, normalizedKey);
    if (currentResult.error || !currentResult.data) {
        return currentResult;
    }

    const customer = currentResult.data as CustomerWithStats;
    if (!customer.userId) {
        return {
            code: 400,
            error: true,
            message: 'Only customers linked to an account can be edited',
        };
    }

    const existingProfile = await prisma.customerProfile.findFirst({
        where: {
            company_id: companyId,
            user_id: customer.userId,
            deleted_at: null,
        },
        include: {
            user: {
                select: {
                    id: true,
                    email: true,
                    name: true,
                    first_name: true,
                    last_name: true,
                    country_code: true,
                    phoneNumber: true,
                    phone_prefix: true,
                },
            },
        },
    });

    if (!existingProfile) {
        return {
            code: 404,
            error: true,
            message: 'Customer profile not found',
        };
    }

    const trimmedName = typeof input.name === 'string' ? input.name.trim() : '';
    if (!trimmedName) {
        return {
            code: 400,
            error: true,
            message: 'Customer name is required',
        };
    }

    const normalizedEmail = normalizeEmail(input.email);
    const canonicalPhone = canonicalizePhoneParts({
        phonePrefix: input.phone_prefix,
        phoneNumber: input.phone,
    });
    const hasPhone = Boolean(canonicalPhone.phoneNumber);
    if (!normalizedEmail && !hasPhone) {
        return {
            code: 400,
            error: true,
            message: 'Provide at least an email or phone number',
        };
    }

    if (normalizedEmail && !EMAIL_REGEX.test(normalizedEmail)) {
        return {
            code: 400,
            error: true,
            message: 'Provide a valid email address',
        };
    }

    if (normalizedEmail) {
        const existingEmailOwner = await UserRepo.getUserByEmail(normalizedEmail);
        if (existingEmailOwner && existingEmailOwner.id !== existingProfile.user.id) {
            return {
                code: 409,
                error: true,
                message: 'Email is already in use',
            };
        }
    }

    if (hasPhone) {
        const existingPhoneOwner = await UserRepo.findActiveUserByPhone({
            phoneNumber: canonicalPhone.phoneNumber!,
            phonePrefix: canonicalPhone.phonePrefix || undefined,
            excludeUserId: existingProfile.user.id,
        });
        if (existingPhoneOwner && existingPhoneOwner.id !== existingProfile.user.id) {
            return {
                code: 409,
                error: true,
                message: 'Phone number is already in use',
            };
        }
    }

    const currentEmail = normalizeEmail(existingProfile.user.email);
    const currentEmailIsTemporary =
        Boolean(currentEmail?.endsWith('@tmppriconpri.com')) ||
        Boolean(currentEmail?.endsWith('@temp.priconpri.com'));
    const finalEmail =
        normalizedEmail ||
        (currentEmailIsTemporary
            ? existingProfile.user.email
            : await ensureUniqueTempEmail(canonicalPhone.phoneNumber || existingProfile.user.id.slice(-6)));
    const finalCountryCode = hasPhone
        ? ((input.country_code || existingProfile.user.country_code || '').trim().toUpperCase() || null)
        : null;
    const nameParts = splitFullName(trimmedName);
    const emailChanged = finalEmail !== existingProfile.user.email;
    const phoneChanged =
        (canonicalPhone.phoneNumber || null) !== (existingProfile.user.phoneNumber || null) ||
        (canonicalPhone.phonePrefix || null) !== (existingProfile.user.phone_prefix || null);

    try {
        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: existingProfile.user.id },
                data: {
                    name: nameParts.displayName,
                    first_name: nameParts.firstName,
                    last_name: nameParts.lastName,
                    email: finalEmail,
                    emailVerified: emailChanged ? false : undefined,
                    phoneNumber: canonicalPhone.phoneNumber || null,
                    phone_prefix: canonicalPhone.phoneNumber ? (canonicalPhone.phonePrefix || null) : null,
                    country_code: finalCountryCode,
                    phoneNumberVerified: phoneChanged ? false : undefined,
                },
            });

            await tx.customerProfile.update({
                where: { id: existingProfile.id },
                data: {
                    notes: input.notes?.trim() || null,
                },
            });

            const credentialAccount = await tx.account.findFirst({
                where: {
                    userId: existingProfile.user.id,
                    providerId: { in: [...BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
                },
                orderBy: { createdAt: 'asc' },
                select: { id: true, accountId: true },
            });

            if (credentialAccount && credentialAccount.accountId !== finalEmail) {
                await tx.account.update({
                    where: { id: credentialAccount.id },
                    data: {
                        providerId: BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
                        accountId: finalEmail,
                    },
                });
            }
        });
    } catch (error: any) {
        if (error?.code === 'P2002') {
            return {
                code: 409,
                error: true,
                message: 'Email or phone number is already in use',
            };
        }
        throw error;
    }

    return getCustomerByKey(companyId, normalizedKey);
}

export async function exportCustomers(
    companyId: number,
    options: CustomerExportOptions = {},
) {
    const company = await prisma.company.findUnique({
        where: { id: companyId, deleted_at: null },
        select: { id: true, name: true, slug: true },
    });

    if (!company) {
        return {
            code: 404,
            error: true,
            message: 'Company not found',
        };
    }

    const customers = applyCustomerSegment(
        await getCustomersWithBookingStats(companyId, options.search || undefined),
        normalizeCustomerSegment(options.segment),
    );
    const csv = buildCustomersCsv(customers);

    try {
        const webhookResult = await triggerCustomerExportWebhook({
            companyId: company.id,
            companyName: company.name,
            requestedByUserId: options.requestedByUserId,
            search: options.search,
            segment: normalizeCustomerSegment(options.segment),
            customers,
        });

        return {
            code: 200,
            error: false,
            message: 'Customer export generated',
            data: {
                csv,
                fileName: `customers-${company.slug || company.id}-${Date.now()}.csv`,
                webhookTriggered: webhookResult.triggered,
                totalRows: customers.length,
            },
        };
    } catch (error: any) {
        logger.error(
            {
                event: 'customer_export_webhook_failed',
                companyId,
                requestedByUserId: options.requestedByUserId || null,
                error: error?.message || String(error),
            },
            'Customer export webhook failed',
        );

        return {
            code: 502,
            error: true,
            message: 'Customer export webhook failed',
            technicalMessage: error?.message || String(error),
        };
    }
}

export async function sendMassCustomerMessage(
    companyId: number,
    payload: SendMassCustomerMessageInput,
) {
    const message = (payload.message || '').trim();
    const search = (payload.search || '').trim();
    const segment = normalizeCustomerSegment(payload.segment);

    if (!message) {
        return {
            code: 400,
            error: true,
            message: 'Message body is required',
        };
    }

    if (message.length > 1500) {
        return {
            code: 400,
            error: true,
            message: 'Message body cannot exceed 1500 characters',
        };
    }

    const company = await prisma.company.findUnique({
        where: { id: companyId, deleted_at: null },
        select: { id: true, name: true },
    });

    if (!company) {
        return {
            code: 404,
            error: true,
            message: 'Company not found',
        };
    }

    const localeConfig = await prisma.configMessage.findUnique({
        where: {
            company_id_key: {
                company_id: companyId,
                key: DEFAULT_LANGUAGE_KEY,
            },
        },
        select: { value: true },
    });
    const locale = (localeConfig?.value || '').trim().toLowerCase() === 'en' ? 'en' : 'es';

    const customers = applyCustomerSegment(
        await getCustomersWithBookingStats(companyId, search || undefined),
        segment,
    );
    const seenWhatsappTargets = new Set<string>();
    const seenEmailTargets = new Set<string>();

    let whatsappSent = 0;
    let emailSent = 0;
    let noContact = 0;
    let failed = 0;
    let duplicatesSkipped = 0;

    const whatsappText =
        locale === 'en'
            ? `${company.name}\n\n${message}`
            : `${company.name}\n\n${message}`;

    const whatsappItems = [] as Array<{
        recipient: string;
        text: string;
        sourceType: string;
        sourceId: string;
        dedupeKey: string;
    }>;

    // Persist WhatsApp work before any synchronous email work. A large CRM
    // campaign therefore acknowledges WhatsApp recipients immediately.
    for (const customer of customers) {
        const whatsappTarget = buildFullPhone(customer.phonePrefix, customer.phone);
        if (whatsappTarget) {
            if (seenWhatsappTargets.has(whatsappTarget)) {
                duplicatesSkipped += 1;
                continue;
            }
            seenWhatsappTargets.add(whatsappTarget);
            whatsappItems.push({
                recipient: whatsappTarget,
                text: whatsappText,
                sourceType: 'CUSTOMER_MASS_MESSAGE',
                sourceId: String(customer.id),
                dedupeKey: `${payload.idempotencyKey ?? `customer-mass:${companyId}:${message}`}:${customer.id}`,
            });
        }
    }

    const whatsappBatch = await queueWhatsappBatch(whatsappItems, {
        companyId,
        sourceType: 'CUSTOMER_MASS_MESSAGE',
        sourceId: String(companyId),
        idempotencyKey: payload.idempotencyKey ?? `customer-mass:${companyId}:${message}`,
        metadata: { segment, search: search || null, recipientCount: customers.length },
    });
    const queuedWhatsapp = whatsappBatch.queued;
    failed += whatsappBatch.rejected;
    duplicatesSkipped += whatsappBatch.duplicates;

    // Email remains an explicitly separate channel. Customers with a phone
    // keep the existing phone-first behavior and are not silently converted
    // to email when WhatsApp is temporarily unavailable.
    for (const customer of customers) {
        const whatsappTarget = buildFullPhone(customer.phonePrefix, customer.phone);
        if (whatsappTarget) continue;

        const emailTarget = normalizeEmail(customer.email);
        if (emailTarget) {
            if (seenEmailTargets.has(emailTarget)) {
                duplicatesSkipped += 1;
                continue;
            }
            const emailResult = await sendCustomerMassMessageEmail({
                email: emailTarget,
                companyName: company.name,
                message,
                locale,
                companyId,
            });
            if (emailResult === 1) {
                emailSent += 1;
                seenEmailTargets.add(emailTarget);
            } else {
                failed += 1;
            }
            continue;
        }
        noContact += 1;
    }

    const totalSent = emailSent;
    logger.info(
        {
            event: 'customer_mass_message_completed',
            companyId,
            companyName: company.name,
            locale,
            search: search || null,
            segment,
            totalCustomers: customers.length,
            totalSent,
            whatsappSent,
            queuedWhatsapp,
            emailSent,
            noContact,
            failed,
            duplicatesSkipped,
            messageLength: message.length,
        },
        'Customer mass message completed',
    );

    return {
        code: 200,
        error: false,
        message:
            queuedWhatsapp > 0
                ? 'Mass message queued'
                : totalSent > 0
                    ? 'Mass message sent'
                : 'No messages sent',
        data: {
            total_customers: customers.length,
            sent_total: totalSent,
            sent_whatsapp: whatsappSent,
            sent_email: emailSent,
            skipped_no_contact: noContact,
            skipped_duplicates: duplicatesSkipped,
            failed,
            batch_id: whatsappBatch.batchId ?? null,
            queued_whatsapp: queuedWhatsapp,
            pending_whatsapp: whatsappBatch.pending ?? queuedWhatsapp,
            delivery_status: whatsappBatch.status,
        },
    };
}

export async function importCustomersFromFile(companyId: number, fileBuffer: Buffer) {
    const rows = parseImportRows(fileBuffer);

    const summary: ImportSummary = {
        totalRows: rows.length,
        importedRows: 0,
        skippedRows: 0,
        createdUsers: 0,
        linkedExistingUsers: 0,
        createdCompanyUsers: 0,
        createdProfiles: 0,
        restoredCompanyUsers: 0,
        restoredProfiles: 0,
        skipped: [],
    };

    for (const row of rows) {
        try {
            if (!row.name) {
                summary.skippedRows += 1;
                summary.skipped.push({ row: row.row, reason: 'Missing name' });
                continue;
            }

            if (!row.email && !row.phone) {
                summary.skippedRows += 1;
                summary.skipped.push({
                    row: row.row,
                    reason: 'At least one contact method is required (email or phone)',
                });
                continue;
            }

            if (row.email && !EMAIL_REGEX.test(row.email)) {
                summary.skippedRows += 1;
                summary.skipped.push({ row: row.row, reason: 'Invalid email format' });
                continue;
            }

            const userByEmail = row.email
                ? await prisma.user.findFirst({
                    where: { email: row.email, deleted_at: null },
                })
                : null;
            const userByPhone = row.phone
                ? await prisma.user.findFirst({
                    where: { phoneNumber: row.phone, deleted_at: null },
                })
                : null;

            if (userByEmail && userByPhone && userByEmail.id !== userByPhone.id) {
                summary.skippedRows += 1;
                summary.skipped.push({
                    row: row.row,
                    reason: 'Email and phone belong to different users',
                });
                continue;
            }

            let user = userByEmail || userByPhone;
            if (!user) {
                const emailToUse =
                    row.email ||
                    (row.phone ? await ensureUniqueTempEmail(row.phone) : await ensureUniqueTempEmail(`import${row.row}`));

                user = await prisma.user.create({
                    data: {
                        email: emailToUse,
                        name: row.name,
                        first_name: row.firstName,
                        last_name: row.lastName,
                        phoneNumber: row.phone || undefined,
                        phone_prefix: row.phone ? row.phonePrefix : undefined,
                        emailVerified: false,
                        is_active: true,
                    },
                });
                summary.createdUsers += 1;
            } else {
                summary.linkedExistingUsers += 1;
                const dataToUpdate: Record<string, any> = {};

                if (row.phone && !user.phoneNumber) {
                    const phoneOwner = await prisma.user.findFirst({
                        where: { phoneNumber: row.phone, deleted_at: null },
                        select: { id: true },
                    });
                    if (phoneOwner && phoneOwner.id !== user.id) {
                        summary.skippedRows += 1;
                        summary.skipped.push({
                            row: row.row,
                            reason: 'Phone number already belongs to another user',
                        });
                        continue;
                    }
                    dataToUpdate.phoneNumber = row.phone;
                    dataToUpdate.phone_prefix = row.phonePrefix;
                }

                if (!user.first_name && row.firstName) dataToUpdate.first_name = row.firstName;
                if (!user.last_name && row.lastName) dataToUpdate.last_name = row.lastName;
                if ((!user.name || user.name.trim().length === 0) && row.name) dataToUpdate.name = row.name;

                if (Object.keys(dataToUpdate).length > 0) {
                    user = await prisma.user.update({
                        where: { id: user.id },
                        data: dataToUpdate,
                    });
                }
            }

            const existingCompanyUser = await prisma.companyUser.findFirst({
                where: {
                    company_id: companyId,
                    user_id: user.id,
                    role: CompanyUserRole.CUSTOMER,
                },
            });

            if (existingCompanyUser) {
                if (existingCompanyUser.deleted_at) {
                    await prisma.companyUser.update({
                        where: { id: existingCompanyUser.id },
                        data: { deleted_at: null },
                    });
                    summary.restoredCompanyUsers += 1;
                }
            } else {
                await prisma.companyUser.create({
                    data: {
                        company_id: companyId,
                        user_id: user.id,
                        role: CompanyUserRole.CUSTOMER,
                    },
                });
                summary.createdCompanyUsers += 1;
            }

            const existingProfile = await prisma.customerProfile.findFirst({
                where: {
                    company_id: companyId,
                    user_id: user.id,
                },
            });

            if (existingProfile) {
                const updateData: Record<string, any> = {};
                if (existingProfile.deleted_at) {
                    updateData.deleted_at = null;
                    summary.restoredProfiles += 1;
                }
                if (row.notes && !existingProfile.notes) {
                    updateData.notes = row.notes;
                }
                if (Object.keys(updateData).length > 0) {
                    await prisma.customerProfile.update({
                        where: { id: existingProfile.id },
                        data: updateData,
                    });
                }
            } else {
                await prisma.customerProfile.create({
                    data: {
                        company_id: companyId,
                        user_id: user.id,
                        notes: row.notes,
                    },
                });
                summary.createdProfiles += 1;
            }

            summary.importedRows += 1;
        } catch (error: any) {
            summary.skippedRows += 1;
            const technicalMessage =
                error?.code === 'P2002'
                    ? 'Duplicate unique value (email/phone)'
                    : (error?.message || 'Unexpected row error');
            summary.skipped.push({ row: row.row, reason: technicalMessage });
        }
    }

    return summary;
}

export function buildCustomerImportTemplate(): Buffer {
    const wb = XLSX.utils.book_new();
    const rows = [
        ['name', 'email', 'phone_prefix', 'phone', 'notes'],
        ['Juan Perez', 'juan@example.com', '591', '70000004', 'Cliente frecuente'],
        ['Laura Martinez', '', '591', '70000008', 'Prefiere turno matutino'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'customers');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}
