import { CompanyUserRole } from '@prisma/client';
import { prisma } from '../prisma/client';
import { getCustomersWithBookingStats } from '../repositories/customer.repo';
import { sendCustomerMassMessageEmail } from '../utils/sendEmail';
import { sendWhatsappText } from '../utils/whatsappSender';
import { logger } from '../config/logger';

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
}

const DEFAULT_LANGUAGE_KEY = 'default_language';
const WHATSAPP_MIN_INTERVAL_MS = 350;

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

function buildFullPhone(prefix?: string | null, phone?: string | null): string | null {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) return null;
    const cleanPrefix = normalizePrefix(prefix || '591');
    return `${cleanPrefix}${cleanPhone}`;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

async function ensureUniqueTempEmail(basePhone: string): Promise<string> {
    let attempt = 0;
    while (attempt < 1000) {
        const suffix = attempt === 0 ? '' : `.${attempt}`;
        const email = `${basePhone}${suffix}@temp.bookinsite.com`;
        const existing = await prisma.user.findFirst({
            where: { email, deleted_at: null },
            select: { id: true },
        });
        if (!existing) return email;
        attempt += 1;
    }
    return `${basePhone}.${Date.now()}@temp.bookinsite.com`;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function listCustomers(companyId: number, search?: string) {
    return getCustomersWithBookingStats(companyId, search);
}

export async function sendMassCustomerMessage(
    companyId: number,
    payload: SendMassCustomerMessageInput,
) {
    const message = (payload.message || '').trim();
    const search = (payload.search || '').trim();

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

    const customers = await getCustomersWithBookingStats(companyId, search || undefined);
    const seenWhatsappTargets = new Set<string>();
    const seenEmailTargets = new Set<string>();

    let whatsappSent = 0;
    let emailSent = 0;
    let noContact = 0;
    let failed = 0;
    let duplicatesSkipped = 0;
    let lastWhatsappAt = 0;

    const whatsappText =
        locale === 'en'
            ? `${company.name}\n\n${message}`
            : `${company.name}\n\n${message}`;

    for (const customer of customers) {
        const whatsappTarget = buildFullPhone(customer.phonePrefix, customer.phone);
        const emailTarget = normalizeEmail(customer.email);

        if (whatsappTarget) {
            if (seenWhatsappTargets.has(whatsappTarget)) {
                duplicatesSkipped += 1;
                continue;
            }

            const elapsed = Date.now() - lastWhatsappAt;
            const waitMs = Math.max(0, WHATSAPP_MIN_INTERVAL_MS - elapsed);
            if (waitMs > 0) {
                await sleep(waitMs);
            }

            const waResult = await sendWhatsappText(whatsappTarget, whatsappText);
            if (waResult !== -1) {
                whatsappSent += 1;
                seenWhatsappTargets.add(whatsappTarget);
                lastWhatsappAt = Date.now();
                continue;
            }
            failed += 1;
            continue;
        }

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

    const totalSent = whatsappSent + emailSent;
    logger.info(
        {
            event: 'customer_mass_message_completed',
            companyId,
            companyName: company.name,
            locale,
            search: search || null,
            totalCustomers: customers.length,
            totalSent,
            whatsappSent,
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
            totalSent > 0
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
