"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnrollmentInstallmentPlan = getEnrollmentInstallmentPlan;
exports.listMyPaymentPlans = listMyPaymentPlans;
exports.listCompanyGroupPayments = listCompanyGroupPayments;
exports.getCustomerGroupPayments = getCustomerGroupPayments;
exports.listInstallmentReminderLogs = listInstallmentReminderLogs;
exports.sendInstallmentReminder = sendInstallmentReminder;
exports.bulkSendInstallmentReminders = bulkSendInstallmentReminders;
const client_1 = require("@prisma/client");
const logger_1 = require("../config/logger");
const customer_repo_1 = require("../repositories/customer.repo");
const GroupPaymentsRepo = __importStar(require("../repositories/group-payments.repo"));
const sendEmail_1 = require("../utils/sendEmail");
const whatsappSender_1 = require("../utils/whatsappSender");
const company_entitlements_service_1 = require("./company-entitlements.service");
const notification_provider_service_1 = require("./notification-provider.service");
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
async function canSendInstallmentReminders(companyId) {
    const [hasClassesPro, hasMessagingPro] = await Promise.all([
        (0, company_entitlements_service_1.companyHasCapability)(companyId, 'CLASES_PRO'),
        (0, company_entitlements_service_1.companyHasCapability)(companyId, 'MENSAJERIA_PRO'),
    ]);
    return hasClassesPro && hasMessagingPro;
}
function startOfToday() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function startOfCurrentMonth() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
function escapeHtml(input) {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function formatMoney(amountCents, currency) {
    const amount = (amountCents || 0) / 100;
    const symbol = (currency || 'Bs.').trim() || 'Bs.';
    return `${symbol} ${amount.toFixed(2)}`;
}
function formatDateLabel(value) {
    if (!value)
        return 'N/A';
    return new Date(value).toLocaleDateString('es-BO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}
function getFullPhone(prefix, phone) {
    const cleanPhone = GroupPaymentsRepo.normalizePhone(phone);
    if (!cleanPhone)
        return null;
    const cleanPrefix = GroupPaymentsRepo.normalizePrefix(prefix) || '591';
    return `${cleanPrefix}${cleanPhone}`;
}
function getIdentity(params) {
    const normalizedEmail = GroupPaymentsRepo.normalizeEmail(params.email);
    const normalizedPhone = GroupPaymentsRepo.normalizePhone(params.phone);
    const normalizedPrefix = GroupPaymentsRepo.normalizePrefix(params.phonePrefix);
    const displayName = (params.name || normalizedEmail || normalizedPhone || 'Guest').trim();
    return {
        customer_key: (0, customer_repo_1.buildCustomerKey)({
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
function getInstallmentDerivedStatus(installment) {
    if (installment.payment_status === client_1.PaymentStatus.PAID)
        return client_1.PaymentStatus.PAID;
    if (installment.payment_status === client_1.PaymentStatus.PENDING_CONFIRMATION)
        return client_1.PaymentStatus.PENDING_CONFIRMATION;
    if (installment.payment_status === client_1.PaymentStatus.REJECTED)
        return client_1.PaymentStatus.REJECTED;
    return new Date(installment.due_date).getTime() < startOfToday().getTime()
        ? 'OVERDUE'
        : client_1.PaymentStatus.UNPAID;
}
function buildInstallmentSummary(installments) {
    const todayStart = startOfToday();
    const paidCount = installments.filter((item) => item.payment_status === client_1.PaymentStatus.PAID).length;
    const pendingCount = installments.filter((item) => item.payment_status !== client_1.PaymentStatus.PAID).length;
    const overdueCount = installments.filter((item) => item.payment_status !== client_1.PaymentStatus.PAID
        && new Date(item.due_date).getTime() < todayStart.getTime()).length;
    const nextDue = installments
        .filter((item) => item.payment_status !== client_1.PaymentStatus.PAID)
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
            .filter((item) => item.payment_status === client_1.PaymentStatus.PAID)
            .reduce((sum, item) => sum + (item.amount_cents || 0), 0),
    };
}
function serializeInstallment(installment) {
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
function serializePaymentPlan(enrollment) {
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
function toPaymentRowBase(params) {
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
        is_overdue: params.row_type === 'INSTALLMENT'
            && params.payment_status !== client_1.PaymentStatus.PAID
            && Boolean(params.due_date && params.due_date.getTime() < startOfToday().getTime()),
    };
}
function buildLedgerRows(sourceData) {
    const rows = [];
    const paymentPlans = sourceData.classEnrollments
        .filter((enrollment) => enrollment.pricing_mode === 'FULL_COURSE')
        .map(serializePaymentPlan);
    for (const booking of sourceData.eventBookings) {
        if ((booking.total_price_cents || 0) <= 0 && booking.payment_method === client_1.PaymentMethod.NONE) {
            continue;
        }
        const identity = getIdentity({
            userId: booking.user?.id,
            name: booking.user?.name,
            email: booking.user?.email,
            phone: booking.user?.phoneNumber,
            phonePrefix: booking.user?.phone_prefix,
        });
        rows.push(toPaymentRowBase({
            row_type: 'EVENT_PAYMENT',
            amount_cents: booking.total_price_cents,
            payment_method: booking.payment_method,
            payment_status: booking.payment_status,
            qr_proof_image_url: booking.qr_proof_image_url,
            created_at: booking.created_at,
            due_date: booking.created_at,
            paid_at: booking.payment_status === client_1.PaymentStatus.PAID ? booking.updated_at : null,
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
        }));
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
                rows.push(toPaymentRowBase({
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
                }));
            }
            continue;
        }
        if ((enrollment.price_cents_snapshot || 0) <= 0 && enrollment.payment_method === client_1.PaymentMethod.NONE) {
            continue;
        }
        rows.push(toPaymentRowBase({
            row_type: 'CLASS_PAYMENT',
            amount_cents: enrollment.price_cents_snapshot,
            payment_method: enrollment.payment_method,
            payment_status: enrollment.payment_status,
            qr_proof_image_url: enrollment.qr_proof_image_url,
            created_at: enrollment.created_at,
            due_date: enrollment.created_at,
            paid_at: enrollment.payment_status === client_1.PaymentStatus.PAID ? enrollment.updated_at : null,
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
        }));
    }
    rows.sort((a, b) => {
        const aTime = new Date(a.due_date || a.created_at).getTime();
        const bTime = new Date(b.due_date || b.created_at).getTime();
        return bTime - aTime;
    });
    return { rows, paymentPlans };
}
function filterLedgerRows(rows, filters) {
    const search = (filters?.search || '').trim().toLowerCase();
    const now = new Date();
    const todayStart = startOfToday();
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const in7Days = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in30Days = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    return rows.filter((row) => {
        if (filters?.customer_key && row.customer_key !== filters.customer_key)
            return false;
        if (filters?.class_id && row.class_id !== filters.class_id)
            return false;
        if (filters?.payment_status && row.payment_status !== filters.payment_status)
            return false;
        if (filters?.payment_method && row.payment_method !== filters.payment_method)
            return false;
        if (filters?.row_type && row.row_type !== filters.row_type)
            return false;
        if (filters?.overdue_only && !row.is_overdue)
            return false;
        if (filters?.due_window && row.due_date) {
            const due = new Date(row.due_date);
            if (filters.due_window === 'TODAY' && !(due >= todayStart && due < todayEnd))
                return false;
            if (filters.due_window === '7_DAYS' && !(due >= todayStart && due < in7Days))
                return false;
            if (filters.due_window === '30_DAYS' && !(due >= todayStart && due < in30Days))
                return false;
            if (filters.due_window === 'OVERDUE' && !(due < todayStart && row.payment_status !== client_1.PaymentStatus.PAID))
                return false;
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
            if (!haystack.includes(search))
                return false;
        }
        return true;
    });
}
function buildLedgerSummary(rows) {
    const monthStart = startOfCurrentMonth();
    const unpaidTotal = rows
        .filter((row) => row.payment_status !== client_1.PaymentStatus.PAID)
        .reduce((sum, row) => sum + (row.amount_cents || 0), 0);
    const overdueInstallments = rows.filter((row) => row.row_type === 'INSTALLMENT' && row.is_overdue).length;
    const qrPendingConfirmations = rows.filter((row) => row.payment_status === client_1.PaymentStatus.PENDING_CONFIRMATION).length;
    const paidThisMonth = rows
        .filter((row) => row.payment_status === client_1.PaymentStatus.PAID && row.paid_at && new Date(row.paid_at) >= monthStart)
        .reduce((sum, row) => sum + (row.amount_cents || 0), 0);
    return {
        total_rows: rows.length,
        unpaid_total_cents: unpaidTotal,
        overdue_installments: overdueInstallments,
        qr_pending_confirmations: qrPendingConfirmations,
        paid_this_month_cents: paidThisMonth,
    };
}
function paginateRows(rows, page = 1, limit = 50) {
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
function buildReminderLink(companySlug, classId) {
    const frontendUrl = (process.env.FRONTEND_URL || '').trim();
    if (!frontendUrl || !companySlug || !classId)
        return null;
    return `${frontendUrl.replace(/\/$/, '')}/shop/${companySlug}/classes/${classId}`;
}
function buildReminderCopy(params) {
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
async function getEnrollmentInstallmentPlan(companyId, enrollmentId, userId) {
    const canUsePaymentPlans = await (0, company_entitlements_service_1.companyHasCapability)(companyId, 'CLASES_PRO');
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
async function listMyPaymentPlans(userId) {
    const enrollments = await GroupPaymentsRepo.listFullCoursePaymentPlansForUser(userId);
    const visiblePlans = [];
    for (const enrollment of enrollments) {
        if (await (0, company_entitlements_service_1.companyHasCapability)(enrollment.company_id, 'CLASES_PRO')) {
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
async function listCompanyGroupPayments(companyId, filters) {
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
async function getCustomerGroupPayments(companyId, customerKey, page = 1, limit = 25) {
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
    const filteredPlans = paymentPlans.filter((plan) => {
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
async function listInstallmentReminderLogs(companyId, installmentId) {
    const logs = await GroupPaymentsRepo.listReminderLogs(companyId, installmentId);
    return {
        code: 200,
        error: false,
        message: 'Reminder history retrieved',
        data: logs,
    };
}
async function sendInstallmentReminder(companyId, installmentId, adminUserId) {
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
    if (installment.payment_status === client_1.PaymentStatus.PAID) {
        return { code: 400, error: true, message: 'Installment is already paid' };
    }
    const recipientEmail = GroupPaymentsRepo.normalizeEmail(installment.enrollment.user?.email);
    const recipientPhone = getFullPhone(installment.enrollment.user?.phone_prefix, installment.enrollment.user?.phoneNumber);
    const channel = recipientPhone ? 'WHATSAPP' : recipientEmail ? 'EMAIL' : null;
    if (!channel) {
        return { code: 400, error: true, message: 'Customer has no phone or email for reminders' };
    }
    const latestLog = await GroupPaymentsRepo.getLatestReminderLog(installment.id, channel);
    const latestLogIsActive = latestLog && ['PENDING', 'PROCESSING', 'SENT'].includes(latestLog.status);
    const latestLogAt = latestLog?.sent_at?.getTime() ?? latestLog?.created_at.getTime();
    if (latestLogIsActive && latestLogAt && Date.now() - latestLogAt < REMINDER_COOLDOWN_MS) {
        return { code: 429, error: true, message: 'A reminder was already sent in the last 24 hours' };
    }
    const paymentLink = buildReminderLink(installment.enrollment.company?.slug, installment.enrollment.group_class?.id);
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
    let queuedLogId = null;
    let queueResult = null;
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
            const result = await (0, whatsappSender_1.queueWhatsappText)(recipientPhone, reminderCopy.text, {
                companyId,
                sourceType: 'INSTALLMENT_REMINDER',
                sourceId: String(installment.id),
                dedupeKey: `installment-reminder:${installment.id}:${reminderWindow}`,
                installmentReminderLogId: pendingLog.id,
            });
            queueResult = result;
            if (!(0, whatsappSender_1.isWhatsappEnqueueAccepted)(result)) {
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
        }
        else {
            const result = await (0, sendEmail_1.sendGenericEmail)(recipientEmail, reminderCopy.subject, reminderCopy.html, { companyId });
            if (!(0, notification_provider_service_1.isEmailDeliverySuccessful)(result)) {
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
    }
    catch (error) {
        // Once a job exists, its repository/worker owns the lifecycle. Do not
        // turn a queued job into FAILED merely because a response read failed
        // or because a duplicate job is already terminal.
        if (queuedLogId !== null && !queueAccepted && !queueResult?.jobId) {
            await GroupPaymentsRepo.updateReminderLogStatus(companyId, queuedLogId, { status: 'FAILED', sent_at: null });
        }
        logger_1.logger.error({ companyId, installmentId, adminUserId, error }, 'Failed to send installment reminder');
        return {
            code: 502,
            error: true,
            message: error instanceof Error ? error.message : 'Failed to send reminder',
        };
    }
}
async function bulkSendInstallmentReminders(companyId, adminUserId, payload) {
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
    const results = [];
    for (const candidate of candidates) {
        const result = await sendInstallmentReminder(companyId, candidate.id, adminUserId);
        if (result.error) {
            if (result.code === 429 || result.code === 400) {
                skipped += 1;
                results.push({ installment_id: candidate.id, status: 'skipped', message: result.message });
            }
            else {
                failed += 1;
                results.push({ installment_id: candidate.id, status: 'failed', message: result.message });
            }
        }
        else if (result.data?.status === 'PENDING' || result.data?.status === 'PROCESSING') {
            queued += 1;
            results.push({ installment_id: candidate.id, status: 'queued', message: result.message });
        }
        else {
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
