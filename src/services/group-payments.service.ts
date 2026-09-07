import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { logger } from '../config/logger';
import { buildCustomerKey } from '../repositories/customer.repo';
import * as GroupPaymentsRepo from '../repositories/group-payments.repo';
import { MensajeApi } from '../types/MensajeApi';
import { sendGenericEmail } from '../utils/sendEmail';
import { isWhatsappEnqueueAccepted, queueWhatsappText } from '../utils/whatsappSender';
import { companyHasCapability } from './company-entitlements.service';
import { isEmailDeliverySuccessful } from './notification-provider.service';

type ServiceResult = MensajeApi & { data?: any };
type ReminderChannel = 'WHATSAPP' | 'EMAIL';
type DerivedInstallmentStatus = PaymentStatus | 'OVERDUE';
type PaymentRowType = 'EVENT_PAYMENT' | 'CLASS_PAYMENT' | 'INSTALLMENT';

const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function canSendInstallmentReminders(companyId: number): Promise<boolean> {
    const [hasClassesPro, hasMessagingPro] = await Promise.all([
        companyHasCapability(companyId, 'CLASES_PRO'),
        companyHasCapability(companyId, 'MENSAJERIA_PRO'),
    ]);

    return hasClassesPro && hasMessagingPro;
}

function startOfToday(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfCurrentMonth(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatMoney(amountCents: number, currency?: string | null): string {
    const amount = (amountCents || 0) / 100;
    const symbol = (currency || 'Bs.').trim() || 'Bs.';
    return `${symbol} ${amount.toFixed(2)}`;
}

function formatDateLabel(value?: Date | string | null): string {
    if (!value) return 'N/A';
    return new Date(value).toLocaleDateString('es-BO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function getFullPhone(prefix?: string | null, phone?: string | null): string | null {
    const cleanPhone = GroupPaymentsRepo.normalizePhone(phone);
    if (!cleanPhone) return null;
    const cleanPrefix = GroupPaymentsRepo.normalizePrefix(prefix) || '591';
    return `${cleanPrefix}${cleanPhone}`;
}

function getIdentity(params: {
    userId?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    phonePrefix?: string | null;
}) {
    const normalizedEmail = GroupPaymentsRepo.normalizeEmail(params.email);
    const normalizedPhone = GroupPaymentsRepo.normalizePhone(params.phone);
    const normalizedPrefix = GroupPaymentsRepo.normalizePrefix(params.phonePrefix);
    const displayName = (params.name || normalizedEmail || normalizedPhone || 'Guest').trim();

    return {
        customer_key: buildCustomerKey({
            userId: params.userId || null,
            email: normalizedEmail,
            phone: normalizedPhone,
            phonePrefix: normalizedPrefix,
            fallbackName: displayName,
        }),
        customer_name: displayName,
        customer_email: normalizedEmail,
        customer_phone: normalizedPhone,
        customer_phone_prefix: normalizedPrefix,
    };
}

function getInstallmentDerivedStatus(installment: {
    due_date: Date | string;
    payment_status: PaymentStatus;
}): DerivedInstallmentStatus {
    if (installment.payment_status === PaymentStatus.PAID) return PaymentStatus.PAID;
    if (installment.payment_status === PaymentStatus.PENDING_CONFIRMATION) return PaymentStatus.PENDING_CONFIRMATION;
    if (installment.payment_status === PaymentStatus.REJECTED) return PaymentStatus.REJECTED;
    return new Date(installment.due_date).getTime() < startOfToday().getTime()
        ? 'OVERDUE'
        : PaymentStatus.UNPAID;
}

function buildInstallmentSummary(installments: Array<{
    due_date: Date | string;
    amount_cents: number;
    payment_status: PaymentStatus;
}>): {
    total_installments: number;
    paid_count: number;
    pending_count: number;
    overdue_count: number;
    next_due_date: Date | null;
    current_month_status: DerivedInstallmentStatus | null;
    total_amount_cents: number;
    paid_amount_cents: number;
} {
    const todayStart = startOfToday();
    const paidCount = installments.filter((item) => item.payment_status === PaymentStatus.PAID).length;
    const pendingCount = installments.filter((item) => item.payment_status !== PaymentStatus.PAID).length;
    const overdueCount = installments.filter(
        (item) =>
            item.payment_status !== PaymentStatus.PAID
            && new Date(item.due_date).getTime() < todayStart.getTime(),
    ).length;
    const nextDue = installments
        .filter((item) => item.payment_status !== PaymentStatus.PAID)
        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];
    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const currentMonthInstallment = installments.find((item) => {
        const due = new Date(item.due_date);
        return due >= currentMonthStart && due < nextMonthStart;
    }) ?? nextDue ?? installments[0] ?? null;

    return {
        total_installments: installments.length,
        paid_count: paidCount,
        pending_count: pendingCount,
        overdue_count: overdueCount,
        next_due_date: nextDue ? new Date(nextDue.due_date) : null,
        current_month_status: currentMonthInstallment ? getInstallmentDerivedStatus(currentMonthInstallment) : null,
        total_amount_cents: installments.reduce((sum, item) => sum + (item.amount_cents || 0), 0),
        paid_amount_cents: installments
            .filter((item) => item.payment_status === PaymentStatus.PAID)
            .reduce((sum, item) => sum + (item.amount_cents || 0), 0),
    };
}

function serializeInstallment(installment: any) {
    const latestReminder = installment.reminder_logs?.[0] ?? null;
    const derivedStatus = getInstallmentDerivedStatus(installment);
    return {
        id: installment.id,
        enrollment_id: installment.enrollment_id,
        installment_number: installment.installment_number,
        due_date: installment.due_date,
        amount_cents: installment.amount_cents,
        payment_status: installment.payment_status,
        payment_method: installment.payment_method,
        qr_proof_image_url: installment.qr_proof_image_url,
        paid_at: installment.paid_at,
        marked_paid_by_admin_id: installment.marked_paid_by_admin_id,
        marked_paid_by_admin: installment.marked_paid_by_admin ?? null,
        created_at: installment.created_at,
        updated_at: installment.updated_at,
        derived_status: derivedStatus,
        is_overdue: derivedStatus === 'OVERDUE',
        last_reminder_at: latestReminder?.sent_at ?? null,
        last_reminder_channel: latestReminder?.channel ?? null,
        last_reminder_status: latestReminder?.status ?? null,
        last_reminder_queued_at: latestReminder?.created_at ?? null,
        reminder_logs: installment.reminder_logs ?? [],
    };
}

function serializePaymentPlan(enrollment: any) {
    const installments = (enrollment.installments ?? []).map(serializeInstallment);
    const summary = buildInstallmentSummary(installments);
    return {
        enrollment: {
            id: enrollment.id,
            company_id: enrollment.company_id,
            group_class_id: enrollment.group_class_id,
            user_id: enrollment.user_id,
            pricing_mode: enrollment.pricing_mode,
            price_cents_snapshot: enrollment.price_cents_snapshot,
            status: enrollment.status,
            payment_method: enrollment.payment_method,
            payment_status: enrollment.payment_status,
            qr_proof_image_url: enrollment.qr_proof_image_url,
            valid_from: enrollment.valid_from,
            valid_until: enrollment.valid_until,
            created_at: enrollment.created_at,
            updated_at: enrollment.updated_at,
            cancelled_at: enrollment.cancelled_at,
            company: enrollment.company ?? null,
            group_class: enrollment.group_class ?? null,
            user: enrollment.user ?? null,
        },
        installments,
        summary,
    };
}

function toPaymentRowBase(params: {
    row_type: PaymentRowType;
    amount_cents: number;
    payment_method: PaymentMethod;
    payment_status: PaymentStatus;
    qr_proof_image_url?: string | null;
    created_at: Date;
    due_date?: Date | null;
    paid_at?: Date | null;
    booking_status?: string | null;
    item_title: string;
    item_id: number;
    customer_key: string;
    customer_name: string;
    customer_email?: string | null;
    customer_phone?: string | null;
    customer_phone_prefix?: string | null;
    user_id?: string | null;
    class_id?: number | null;
    event_id?: number | null;
    enrollment_id?: number | null;
    event_booking_id?: number | null;
    installment_id?: number | null;
    installment_number?: number | null;
    class_slug?: string | null;
    event_slug?: string | null;
    last_reminder_at?: Date | null;
    last_reminder_channel?: string | null;
}) {
    return {
        id: `${params.row_type}:${params.installment_id ?? params.event_booking_id ?? params.enrollment_id ?? params.item_id}`,
        row_type: params.row_type,
        item_id: params.item_id,
        item_title: params.item_title,
        class_id: params.class_id ?? null,
        event_id: params.event_id ?? null,
        class_slug: params.class_slug ?? null,
        event_slug: params.event_slug ?? null,
        enrollment_id: params.enrollment_id ?? null,
        event_booking_id: params.event_booking_id ?? null,
        installment_id: params.installment_id ?? null,
        installment_number: params.installment_number ?? null,
        customer_key: params.customer_key,
        customer_name: params.customer_name,
        customer_email: params.customer_email ?? null,
        customer_phone: params.customer_phone ?? null,
        customer_phone_prefix: params.customer_phone_prefix ?? null,
        user_id: params.user_id ?? null,
        amount_cents: params.amount_cents,
        due_date: params.due_date ?? null,
        paid_at: params.paid_at ?? null,
        payment_method: params.payment_method,
        payment_status: params.payment_status,
        booking_status: params.booking_status ?? null,
        qr_proof_image_url: params.qr_proof_image_url ?? null,
        created_at: params.created_at,
        last_reminder_at: params.last_reminder_at ?? null,
        last_reminder_channel: params.last_reminder_channel ?? null,
        is_overdue:
            params.row_type === 'INSTALLMENT'
            && params.payment_status !== PaymentStatus.PAID
            && Boolean(params.due_date && params.due_date.getTime() < startOfToday().getTime()),
    };
}

function buildLedgerRows(sourceData: Awaited<ReturnType<typeof GroupPaymentsRepo.listCompanyGroupPaymentSourceData>>) {
    const rows: any[] = [];
    const paymentPlans = sourceData.classEnrollments
        .filter((enrollment) => enrollment.pricing_mode === 'FULL_COURSE')
        .map(serializePaymentPlan);

    for (const booking of sourceData.eventBookings) {
        if ((booking.total_price_cents || 0) <= 0 && booking.payment_method === PaymentMethod.NONE) {
            continue;
        }
        const identity = getIdentity({
            userId: booking.user?.id,
            name: booking.user?.name,
            email: booking.user?.email,
            phone: booking.user?.phoneNumber,
            phonePrefix: booking.user?.phone_prefix,
        });
        rows.push(
            toPaymentRowBase({
                row_type: 'EVENT_PAYMENT',
                amount_cents: booking.total_price_cents,
                payment_method: booking.payment_method,
                payment_status: booking.payment_status,
                qr_proof_image_url: booking.qr_proof_image_url,
                created_at: booking.created_at,
                due_date: booking.created_at,
                paid_at: booking.payment_status === PaymentStatus.PAID ? booking.updated_at : null,
                booking_status: booking.status,
                item_title: booking.group_event?.title || `Event #${booking.group_event_id}`,
                item_id: booking.group_event_id,
                customer_key: identity.customer_key,
                customer_name: identity.customer_name,
                customer_email: identity.customer_email,
                customer_phone: identity.customer_phone,
                customer_phone_prefix: identity.customer_phone_prefix,
                user_id: booking.user_id,
                event_id: booking.group_event_id,
                event_booking_id: booking.id,
                event_slug: booking.group_event?.slug ?? null,
            }),
        );
    }

    for (const enrollment of sourceData.classEnrollments) {
        const identity = getIdentity({
            userId: enrollment.user?.id,
            name: enrollment.user?.name,
            email: enrollment.user?.email,
            phone: enrollment.user?.phoneNumber,
            phonePrefix: enrollment.user?.phone_prefix,
        });

        if (enrollment.pricing_mode === 'FULL_COURSE') {
            for (const installment of enrollment.installments) {
                const latestReminder = installment.reminder_logs?.[0] ?? null;
                rows.push(
                    toPaymentRowBase({
                        row_type: 'INSTALLMENT',
                        amount_cents: installment.amount_cents,
                        payment_method: installment.payment_method,
                        payment_status: installment.payment_status,
                        qr_proof_image_url: installment.qr_proof_image_url,
                        created_at: installment.created_at,
                        due_date: installment.due_date,
                        paid_at: installment.paid_at,
                        booking_status: enrollment.status,
                        item_title: enrollment.group_class?.title || `Class #${enrollment.group_class_id}`,
                        item_id: enrollment.group_class_id,
                        customer_key: identity.customer_key,
                        customer_name: identity.customer_name,
                        customer_email: identity.customer_email,
                        customer_phone: identity.customer_phone,
                        customer_phone_prefix: identity.customer_phone_prefix,
                        user_id: enrollment.user_id,
                        class_id: enrollment.group_class_id,
                        class_slug: enrollment.group_class?.slug ?? null,
                        enrollment_id: enrollment.id,
                        installment_id: installment.id,
                        installment_number: installment.installment_number,
                        last_reminder_at: latestReminder?.sent_at ?? null,
                        last_reminder_channel: latestReminder?.channel ?? null,
                    }),
                );
            }
            continue;
        }

        if ((enrollment.price_cents_snapshot || 0) <= 0 && enrollment.payment_method === PaymentMethod.NONE) {
            continue;
        }
        rows.push(
            toPaymentRowBase({
                row_type: 'CLASS_PAYMENT',
                amount_cents: enrollment.price_cents_snapshot,
                payment_method: enrollment.payment_method,
                payment_status: enrollment.payment_status,
                qr_proof_image_url: enrollment.qr_proof_image_url,
                created_at: enrollment.created_at,
                due_date: enrollment.created_at,
                paid_at: enrollment.payment_status === PaymentStatus.PAID ? enrollment.updated_at : null,
                booking_status: enrollment.status,
                item_title: enrollment.group_class?.title || `Class #${enrollment.group_class_id}`,
                item_id: enrollment.group_class_id,
                customer_key: identity.customer_key,
                customer_name: identity.customer_name,
                customer_email: identity.customer_email,
                customer_phone: identity.customer_phone,
                customer_phone_prefix: identity.customer_phone_prefix,
                user_id: enrollment.user_id,
                class_id: enrollment.group_class_id,
                class_slug: enrollment.group_class?.slug ?? null,
                enrollment_id: enrollment.id,
            }),
        );
    }

    rows.sort((a, b) => {
        const aTime = new Date(a.due_date || a.created_at).getTime();
        const bTime = new Date(b.due_date || b.created_at).getTime();
        return bTime - aTime;
    });

    return { rows, paymentPlans };
}

function filterLedgerRows(rows: any[], filters?: {
    search?: string;
    customer_key?: string;
    class_id?: number;
    payment_status?: PaymentStatus;
    payment_method?: PaymentMethod;
    row_type?: PaymentRowType;
    due_window?: 'TODAY' | '7_DAYS' | '30_DAYS' | 'OVERDUE';
    overdue_only?: boolean;
}) {
    const search = (filters?.search || '').trim().toLowerCase();
    const now = new Date();
    const todayStart = startOfToday();
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const in7Days = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in30Days = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000);

    return rows.filter((row) => {
        if (filters?.customer_key && row.customer_key !== filters.customer_key) return false;
        if (filters?.class_id && row.class_id !== filters.class_id) return false;
        if (filters?.payment_status && row.payment_status !== filters.payment_status) return false;
        if (filters?.payment_method && row.payment_method !== filters.payment_method) return false;
        if (filters?.row_type && row.row_type !== filters.row_type) return false;
        if (filters?.overdue_only && !row.is_overdue) return false;

        if (filters?.due_window && row.due_date) {
            const due = new Date(row.due_date);
            if (filters.due_window === 'TODAY' && !(due >= todayStart && due < todayEnd)) return false;
            if (filters.due_window === '7_DAYS' && !(due >= todayStart && due < in7Days)) return false;
            if (filters.due_window === '30_DAYS' && !(due >= todayStart && due < in30Days)) return false;
            if (filters.due_window === 'OVERDUE' && !(due < todayStart && row.payment_status !== PaymentStatus.PAID)) return false;
        }

        if (search) {
            const haystack = [
                row.customer_name,
                row.customer_email,
                row.customer_phone,
                row.item_title,
                row.row_type,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            if (!haystack.includes(search)) return false;
        }

        return true;
    });
}

function buildLedgerSummary(rows: any[]) {
    const monthStart = startOfCurrentMonth();
    const unpaidTotal = rows
        .filter((row) => row.payment_status !== PaymentStatus.PAID)
        .reduce((sum, row) => sum + (row.amount_cents || 0), 0);
    const overdueInstallments = rows.filter((row) => row.row_type === 'INSTALLMENT' && row.is_overdue).length;
    const qrPendingConfirmations = rows.filter((row) => row.payment_status === PaymentStatus.PENDING_CONFIRMATION).length;
    const paidThisMonth = rows
        .filter((row) => row.payment_status === PaymentStatus.PAID && row.paid_at && new Date(row.paid_at) >= monthStart)
        .reduce((sum, row) => sum + (row.amount_cents || 0), 0);

    return {
        total_rows: rows.length,
        unpaid_total_cents: unpaidTotal,
        overdue_installments: overdueInstallments,
        qr_pending_confirmations: qrPendingConfirmations,
        paid_this_month_cents: paidThisMonth,
    };
}

function paginateRows(rows: any[], page = 1, limit = 50) {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;
    const total = rows.length;
    const start = (safePage - 1) * safeLimit;
    const items = rows.slice(start, start + safeLimit);

    return {
        items,
        pagination: {
            total,
            page: safePage,
            limit: safeLimit,
            totalPages: total === 0 ? 1 : Math.ceil(total / safeLimit),
            hasNextPage: start + safeLimit < total,
        },
    };
}

function buildReminderLink(companySlug?: string | null, classId?: number | null): string | null {
    const frontendUrl = (process.env.FRONTEND_URL || '').trim();
    if (!frontendUrl || !companySlug || !classId) return null;
    return `${frontendUrl.replace(/\/$/, '')}/shop/${companySlug}/classes/${classId}`;
}

function buildReminderCopy(params: {
    customerName: string;
    classTitle: string;
    installmentNumber: number;
    amountCents: number;
    currency?: string | null;
    dueDate: Date;
    paymentLink?: string | null;
    isOverdue: boolean;
}) {
    const amountLabel = formatMoney(params.amountCents, params.currency);
    const dueDateLabel = formatDateLabel(params.dueDate);
    const intro = params.isOverdue
        ? `Hola ${params.customerName}, te recordamos que tu cuota ${params.installmentNumber} de ${params.classTitle} ya esta vencida.`
        : `Hola ${params.customerName}, te recordamos que tu cuota ${params.installmentNumber} de ${params.classTitle} vence pronto.`;
    const lines = [
        intro,
        `Monto: ${amountLabel}`,
        `Fecha de pago: ${dueDateLabel}`,
        'Puedes subir tu comprobante QR desde tu reserva grupal.',
    ];
    if (params.paymentLink) {
        lines.push(`Ver tu plan de pagos: ${params.paymentLink}`);
    }
    const text = lines.join('\n');
    const subject = params.isOverdue
        ? `Recordatorio de cuota vencida - ${params.classTitle}`
        : `Recordatorio de cuota - ${params.classTitle}`;
    const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 620px; margin: 0 auto; padding: 20px; background: #f8fafc;">
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
                <h2 style="margin-top: 0;">${escapeHtml(subject)}</h2>
                <p>${escapeHtml(intro)}</p>
                <ul>
                    <li><strong>Monto:</strong> ${escapeHtml(amountLabel)}</li>
                    <li><strong>Fecha de pago:</strong> ${escapeHtml(dueDateLabel)}</li>
                    <li><strong>Clase:</strong> ${escapeHtml(params.classTitle)}</li>
                </ul>
                <p>Puedes subir tu comprobante QR desde tu reserva grupal.</p>
                ${params.paymentLink ? `<p><a href="${params.paymentLink}" target="_blank" rel="noopener noreferrer">Ver tu plan de pagos</a></p>` : ''}
            </div>
        </div>
    `;

    return { subject, text, html };
}

export async function getEnrollmentInstallmentPlan(
    companyId: number,
    enrollmentId: number,
    userId?: string,
): Promise<ServiceResult> {
    const canUsePaymentPlans = await companyHasCapability(companyId, 'CLASES_PRO');
    if (!canUsePaymentPlans) {
        return {
            code: 403,
            error: true,
            message: 'Payment plans are not available for this business',
        };
    }

    const enrollment = await GroupPaymentsRepo.getEnrollmentInstallmentPlan({
        companyId,
        enrollmentId,
        userId,
    });

    if (!enrollment) {
        return { code: 404, error: true, message: 'Enrollment not found' };
    }

    if (enrollment.pricing_mode !== 'FULL_COURSE') {
        return { code: 400, error: true, message: 'This enrollment does not have installments' };
    }

    return {
        code: 200,
        error: false,
        message: 'Installments retrieved',
        data: serializePaymentPlan(enrollment),
    };
}

export async function listMyPaymentPlans(userId: string): Promise<ServiceResult> {
    const enrollments = await GroupPaymentsRepo.listFullCoursePaymentPlansForUser(userId);
    const visiblePlans = [];

    for (const enrollment of enrollments) {
        if (await companyHasCapability(enrollment.company_id, 'CLASES_PRO')) {
            visiblePlans.push(enrollment);
        }
    }

    return {
        code: 200,
        error: false,
        message: 'Payment plans retrieved',
        data: visiblePlans.map(serializePaymentPlan),
    };
}

export async function listCompanyGroupPayments(
    companyId: number,
    filters?: {
        search?: string;
        customer_key?: string;
        class_id?: number;
        payment_status?: PaymentStatus;
        payment_method?: PaymentMethod;
        row_type?: PaymentRowType;
        due_window?: 'TODAY' | '7_DAYS' | '30_DAYS' | 'OVERDUE';
        overdue_only?: boolean;
        page?: number;
        limit?: number;
    },
): Promise<ServiceResult> {
    const sourceData = await GroupPaymentsRepo.listCompanyGroupPaymentSourceData(companyId);
    if (!sourceData.company) {
        return { code: 404, error: true, message: 'Company not found' };
    }

    const { rows } = buildLedgerRows(sourceData);
    const filteredRows = filterLedgerRows(rows, filters);
    const paginated = paginateRows(filteredRows, filters?.page, filters?.limit);

    return {
        code: 200,
        error: false,
        message: 'Group payments retrieved',
        data: {
            rows: paginated.items,
            summary: buildLedgerSummary(filteredRows),
            pagination: paginated.pagination,
            currency: sourceData.company.currency,
        },
    };
}

export async function getCustomerGroupPayments(
    companyId: number,
    customerKey: string,
    page = 1,
    limit = 25,
): Promise<ServiceResult> {
    const key = (customerKey || '').trim();
    if (!key) {
        return { code: 400, error: true, message: 'customer_key is required' };
    }

    const sourceData = await GroupPaymentsRepo.listCompanyGroupPaymentSourceData(companyId);
    if (!sourceData.company) {
        return { code: 404, error: true, message: 'Company not found' };
    }

    const { rows, paymentPlans } = buildLedgerRows(sourceData);
    const filteredRows = filterLedgerRows(rows, { customer_key: key });
    const filteredPlans = paymentPlans.filter((plan: any) => {
        const identity = getIdentity({
            userId: plan.enrollment.user?.id,
            name: plan.enrollment.user?.name,
            email: plan.enrollment.user?.email,
            phone: plan.enrollment.user?.phoneNumber,
            phonePrefix: plan.enrollment.user?.phone_prefix,
        });
        return identity.customer_key === key;
    });
    const paginated = paginateRows(filteredRows, page, limit);

    return {
        code: 200,
        error: false,
        message: 'Customer group payments retrieved',
        data: {
            rows: paginated.items,
            payment_plans: filteredPlans,
            summary: buildLedgerSummary(filteredRows),
            pagination: paginated.pagination,
            currency: sourceData.company.currency,
        },
    };
}

export async function listInstallmentReminderLogs(companyId: number, installmentId: number): Promise<ServiceResult> {
    const logs = await GroupPaymentsRepo.listReminderLogs(companyId, installmentId);
    return {
        code: 200,
        error: false,
        message: 'Reminder history retrieved',
        data: logs,
    };
}

export async function sendInstallmentReminder(
    companyId: number,
    installmentId: number,
    adminUserId: string,
): Promise<ServiceResult> {
    if (!await canSendInstallmentReminders(companyId)) {
        return {
            code: 403,
            error: true,
            message: 'Requiere Clases Pro y Mensajería Pro',
        };
    }

    const installment = await GroupPaymentsRepo.getInstallmentReminderTarget(companyId, installmentId);
    if (!installment) {
        return { code: 404, error: true, message: 'Installment not found' };
    }
    if (installment.payment_status === PaymentStatus.PAID) {
        return { code: 400, error: true, message: 'Installment is already paid' };
    }

    const recipientEmail = GroupPaymentsRepo.normalizeEmail(installment.enrollment.user?.email);
    const recipientPhone = getFullPhone(
        installment.enrollment.user?.phone_prefix,
        installment.enrollment.user?.phoneNumber,
    );
    const channel: ReminderChannel | null = recipientPhone ? 'WHATSAPP' : recipientEmail ? 'EMAIL' : null;

    if (!channel) {
        return { code: 400, error: true, message: 'Customer has no phone or email for reminders' };
    }

    const latestLog = await GroupPaymentsRepo.getLatestReminderLog(installment.id, channel);
    const latestLogIsActive = latestLog && ['PENDING', 'PROCESSING', 'SENT'].includes(latestLog.status);
    const latestLogAt = latestLog?.sent_at?.getTime() ?? latestLog?.created_at.getTime();
    if (latestLogIsActive && latestLogAt && Date.now() - latestLogAt < REMINDER_COOLDOWN_MS) {
        return { code: 429, error: true, message: 'A reminder was already sent in the last 24 hours' };
    }

    const paymentLink = buildReminderLink(
        installment.enrollment.company?.slug,
        installment.enrollment.group_class?.id,
    );
    const reminderCopy = buildReminderCopy({
        customerName: installment.enrollment.user?.name || 'cliente',
        classTitle: installment.enrollment.group_class?.title || `Clase #${installment.enrollment.group_class_id}`,
        installmentNumber: installment.installment_number,
        amountCents: installment.amount_cents,
        currency: installment.enrollment.company?.currency,
        dueDate: installment.due_date,
        paymentLink,
        isOverdue: getInstallmentDerivedStatus(installment) === 'OVERDUE',
    });

    let queuedLogId: number | null = null;
    let queueResult: { jobId?: number } | null = null;
    let queueAccepted = false;
    try {
        if (channel === 'WHATSAPP') {
            const pendingLog = await GroupPaymentsRepo.createReminderLog({
                company_id: companyId,
                enrollment_id: installment.enrollment_id,
                installment_id: installment.id,
                sent_by_admin_id: adminUserId,
                channel,
                recipient_email: recipientEmail,
                recipient_phone: recipientPhone,
                message_subject: reminderCopy.subject,
                message_body: reminderCopy.text,
                status: 'PENDING',
                sent_at: null,
            });
            queuedLogId = pendingLog.id;
            const reminderWindow = Math.floor(Date.now() / REMINDER_COOLDOWN_MS);
            const result = await queueWhatsappText(recipientPhone!, reminderCopy.text, {
                companyId,
                sourceType: 'INSTALLMENT_REMINDER',
                sourceId: String(installment.id),
                dedupeKey: `installment-reminder:${installment.id}:${reminderWindow}`,
                installmentReminderLogId: pendingLog.id,
            });
            queueResult = result;
            if (!isWhatsappEnqueueAccepted(result)) {
                throw new Error('WhatsApp reminder delivery failed');
            }
            queueAccepted = true;

            const log = await GroupPaymentsRepo.getLatestReminderLog(installment.id, channel);
            return {
                code: 200,
                error: false,
                message: 'Reminder queued',
                data: {
                    channel,
                    status: log?.status ?? 'PENDING',
                    job_id: result.jobId ?? null,
                    log,
                },
            };
        } else {
            const result = await sendGenericEmail(recipientEmail!, reminderCopy.subject, reminderCopy.html, { companyId });
            if (!isEmailDeliverySuccessful(result)) {
                throw new Error(`Email reminder delivery failed: ${result.reason}`);
            }
        }

        const log = await GroupPaymentsRepo.createReminderLog({
            company_id: companyId,
            enrollment_id: installment.enrollment_id,
            installment_id: installment.id,
            sent_by_admin_id: adminUserId,
            channel,
            recipient_email: recipientEmail,
            recipient_phone: recipientPhone,
            message_subject: reminderCopy.subject,
            message_body: reminderCopy.text,
            status: 'SENT',
            sent_at: new Date(),
        });

        return {
            code: 200,
            error: false,
            message: 'Reminder sent',
            data: {
                channel,
                log,
            },
        };
    } catch (error) {
        // Once a job exists, its repository/worker owns the lifecycle. Do not
        // turn a queued job into FAILED merely because a response read failed
        // or because a duplicate job is already terminal.
        if (queuedLogId !== null && !queueAccepted && !queueResult?.jobId) {
            await GroupPaymentsRepo.updateReminderLogStatus(companyId, queuedLogId, { status: 'FAILED', sent_at: null });
        }
        logger.error({ companyId, installmentId, adminUserId, error }, 'Failed to send installment reminder');
        return {
            code: 502,
            error: true,
            message: error instanceof Error ? error.message : 'Failed to send reminder',
        };
    }
}

export async function bulkSendInstallmentReminders(
    companyId: number,
    adminUserId: string,
    payload: {
        installment_ids?: number[];
        overdue_only?: boolean;
        class_id?: number;
        customer_key?: string;
    },
): Promise<ServiceResult> {
    if (!await canSendInstallmentReminders(companyId)) {
        return {
            code: 403,
            error: true,
            message: 'Requiere Clases Pro y Mensajería Pro',
        };
    }

    const installmentIds = Array.isArray(payload.installment_ids)
        ? payload.installment_ids.map((value) => Number.parseInt(String(value), 10)).filter((value) => Number.isInteger(value) && value > 0)
        : [];

    let candidates = await GroupPaymentsRepo.listInstallmentsEligibleForReminders({
        companyId,
        installmentIds: installmentIds.length > 0 ? installmentIds : undefined,
    });

    if (payload.class_id) {
        candidates = candidates.filter((item) => item.enrollment.group_class_id === payload.class_id);
    }
    if (payload.customer_key) {
        candidates = candidates.filter((item) => {
            const identity = getIdentity({
                userId: item.enrollment.user?.id,
                name: item.enrollment.user?.name,
                email: item.enrollment.user?.email,
                phone: item.enrollment.user?.phoneNumber,
                phonePrefix: item.enrollment.user?.phone_prefix,
            });
            return identity.customer_key === payload.customer_key;
        });
    }
    if (payload.overdue_only) {
        candidates = candidates.filter((item) => getInstallmentDerivedStatus(item) === 'OVERDUE');
    }

    let sent = 0;
    let queued = 0;
    let skipped = 0;
    let failed = 0;
    const results: Array<{ installment_id: number; status: 'sent' | 'queued' | 'skipped' | 'failed'; message: string }> = [];

    for (const candidate of candidates) {
        const result = await sendInstallmentReminder(companyId, candidate.id, adminUserId);
        if (result.error) {
            if (result.code === 429 || result.code === 400) {
                skipped += 1;
                results.push({ installment_id: candidate.id, status: 'skipped', message: result.message });
            } else {
                failed += 1;
                results.push({ installment_id: candidate.id, status: 'failed', message: result.message });
            }
        } else if (result.data?.status === 'PENDING' || result.data?.status === 'PROCESSING') {
            queued += 1;
            results.push({ installment_id: candidate.id, status: 'queued', message: result.message });
        } else {
            sent += 1;
            results.push({ installment_id: candidate.id, status: 'sent', message: result.message });
        }
    }

    return {
        code: 200,
        error: false,
        message: 'Bulk reminders processed',
        data: {
            total: candidates.length,
            sent,
            queued,
            skipped,
            failed,
            results,
        },
    };
}
