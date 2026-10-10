"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEmail = normalizeEmail;
exports.normalizePhone = normalizePhone;
exports.normalizePrefix = normalizePrefix;
exports.getEnrollmentInstallmentPlan = getEnrollmentInstallmentPlan;
exports.listFullCoursePaymentPlansForUser = listFullCoursePaymentPlansForUser;
exports.listCompanyGroupPaymentSourceData = listCompanyGroupPaymentSourceData;
exports.getInstallmentReminderTarget = getInstallmentReminderTarget;
exports.getLatestReminderLog = getLatestReminderLog;
exports.createReminderLog = createReminderLog;
exports.updateReminderLogStatus = updateReminderLogStatus;
exports.listReminderLogs = listReminderLogs;
exports.listInstallmentsEligibleForReminders = listInstallmentsEligibleForReminders;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
function normalizeEmail(email) {
    const value = (email || '').trim().toLowerCase();
    return value || null;
}
function normalizePhone(phone) {
    const value = (phone || '').replace(/\D/g, '');
    return value || null;
}
function normalizePrefix(prefix) {
    const value = (prefix || '').replace(/\D/g, '');
    return value || null;
}
async function getEnrollmentInstallmentPlan(params) {
    return client_2.prisma.groupClassEnrollment.findFirst({
        where: {
            id: params.enrollmentId,
            company_id: params.companyId,
            is_admin_sponsored: false,
            ...(params.userId ? { user_id: params.userId } : {}),
        },
        include: {
            company: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    currency: true,
                },
            },
            group_class: {
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    pricing_mode: true,
                    cover_image_url: true,
                    thumbnail_url: true,
                    recurrence_end_date: true,
                },
            },
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phoneNumber: true,
                    phone_prefix: true,
                },
            },
            installments: {
                include: {
                    marked_paid_by_admin: {
                        select: { id: true, name: true, email: true },
                    },
                    reminder_logs: {
                        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
                        take: 5,
                        select: {
                            id: true,
                            channel: true,
                            recipient_email: true,
                            recipient_phone: true,
                            message_subject: true,
                            message_body: true,
                            status: true,
                            sent_at: true,
                            created_at: true,
                            outbound_message_job_id: true,
                            sent_by_admin_id: true,
                            sent_by_admin: {
                                select: { id: true, name: true, email: true },
                            },
                        },
                    },
                },
                orderBy: { installment_number: 'asc' },
            },
        },
    });
}
async function listFullCoursePaymentPlansForUser(userId) {
    return client_2.prisma.groupClassEnrollment.findMany({
        where: {
            user_id: userId,
            pricing_mode: 'FULL_COURSE',
            is_admin_sponsored: false,
        },
        include: {
            company: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    currency: true,
                },
            },
            group_class: {
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    pricing_mode: true,
                    cover_image_url: true,
                    thumbnail_url: true,
                    location_text: true,
                    recurrence_end_date: true,
                },
            },
            installments: {
                include: {
                    marked_paid_by_admin: {
                        select: { id: true, name: true, email: true },
                    },
                    reminder_logs: {
                        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
                        take: 5,
                        select: {
                            id: true,
                            channel: true,
                            recipient_email: true,
                            recipient_phone: true,
                            message_subject: true,
                            message_body: true,
                            status: true,
                            sent_at: true,
                            created_at: true,
                            outbound_message_job_id: true,
                            sent_by_admin_id: true,
                            sent_by_admin: {
                                select: { id: true, name: true, email: true },
                            },
                        },
                    },
                },
                orderBy: { installment_number: 'asc' },
            },
        },
        orderBy: { created_at: 'desc' },
    });
}
async function listCompanyGroupPaymentSourceData(companyId) {
    const [company, eventBookings, classEnrollments] = await Promise.all([
        client_2.prisma.company.findUnique({
            where: { id: companyId },
            select: {
                id: true,
                name: true,
                slug: true,
                currency: true,
            },
        }),
        client_2.prisma.groupEventBooking.findMany({
            where: { company_id: companyId },
            include: {
                group_event: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        is_free: true,
                        start_at: true,
                    },
                },
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
        client_2.prisma.groupClassEnrollment.findMany({
            where: {
                company_id: companyId,
                is_admin_sponsored: false,
            },
            include: {
                group_class: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        pricing_mode: true,
                        recurrence_end_date: true,
                    },
                },
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phoneNumber: true,
                        phone_prefix: true,
                    },
                },
                installments: {
                    include: {
                        marked_paid_by_admin: {
                            select: { id: true, name: true, email: true },
                        },
                        reminder_logs: {
                            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
                            take: 5,
                            select: {
                                id: true,
                                channel: true,
                                recipient_email: true,
                                recipient_phone: true,
                                message_subject: true,
                                message_body: true,
                                status: true,
                                sent_at: true,
                                created_at: true,
                                outbound_message_job_id: true,
                                sent_by_admin_id: true,
                                sent_by_admin: {
                                    select: { id: true, name: true, email: true },
                                },
                            },
                        },
                    },
                    orderBy: { installment_number: 'asc' },
                },
            },
            orderBy: { created_at: 'desc' },
        }),
    ]);
    return { company, eventBookings, classEnrollments };
}
async function getInstallmentReminderTarget(companyId, installmentId) {
    return client_2.prisma.enrollmentInstallment.findFirst({
        where: {
            id: installmentId,
            enrollment: {
                company_id: companyId,
            },
        },
        include: {
            enrollment: {
                include: {
                    company: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            currency: true,
                        },
                    },
                    group_class: {
                        select: {
                            id: true,
                            title: true,
                            slug: true,
                            recurrence_end_date: true,
                        },
                    },
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
            },
            reminder_logs: {
                orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
                take: 20,
                select: {
                    id: true,
                    channel: true,
                    recipient_email: true,
                    recipient_phone: true,
                    message_subject: true,
                    message_body: true,
                    status: true,
                    sent_at: true,
                    created_at: true,
                    outbound_message_job_id: true,
                    sent_by_admin_id: true,
                    sent_by_admin: {
                        select: { id: true, name: true, email: true },
                    },
                },
            },
        },
    });
}
async function getLatestReminderLog(installmentId, channel) {
    return client_2.prisma.installmentReminderLog.findFirst({
        where: {
            installment_id: installmentId,
            channel,
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
}
async function createReminderLog(data) {
    return client_2.prisma.installmentReminderLog.create({
        data: {
            company_id: data.company_id,
            enrollment_id: data.enrollment_id,
            installment_id: data.installment_id,
            sent_by_admin_id: data.sent_by_admin_id ?? null,
            channel: data.channel,
            recipient_email: data.recipient_email ?? null,
            recipient_phone: data.recipient_phone ?? null,
            message_subject: data.message_subject ?? null,
            message_body: data.message_body ?? null,
            status: data.status ?? 'SENT',
            sent_at: data.sent_at ?? (data.status === 'SENT' || data.status === undefined ? new Date() : null),
            outbound_message_job_id: data.outbound_message_job_id ?? null,
        },
        include: {
            sent_by_admin: {
                select: { id: true, name: true, email: true },
            },
        },
    });
}
async function updateReminderLogStatus(companyId, logId, data) {
    return client_2.prisma.installmentReminderLog.updateMany({
        where: { id: logId, company_id: companyId },
        data,
    });
}
async function listReminderLogs(companyId, installmentId) {
    return client_2.prisma.installmentReminderLog.findMany({
        where: {
            company_id: companyId,
            installment_id: installmentId,
        },
        include: {
            sent_by_admin: {
                select: { id: true, name: true, email: true },
            },
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
}
async function listInstallmentsEligibleForReminders(params) {
    return client_2.prisma.enrollmentInstallment.findMany({
        where: {
            enrollment: {
                company_id: params.companyId,
            },
            ...(params.installmentIds?.length ? { id: { in: params.installmentIds } } : {}),
            payment_status: {
                not: client_1.PaymentStatus.PAID,
            },
        },
        include: {
            enrollment: {
                include: {
                    company: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            currency: true,
                        },
                    },
                    group_class: {
                        select: {
                            id: true,
                            title: true,
                            slug: true,
                            recurrence_end_date: true,
                        },
                    },
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
            },
            reminder_logs: {
                orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
                take: 20,
                select: {
                    id: true,
                    channel: true,
                    recipient_email: true,
                    recipient_phone: true,
                    message_subject: true,
                    message_body: true,
                    status: true,
                    sent_at: true,
                    created_at: true,
                    outbound_message_job_id: true,
                    sent_by_admin_id: true,
                },
            },
        },
        orderBy: [{ due_date: 'asc' }, { installment_number: 'asc' }],
    });
}
