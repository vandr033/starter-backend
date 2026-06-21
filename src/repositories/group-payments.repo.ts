import { PaymentStatus } from '@prisma/client';
import { prisma } from '../prisma/client';

export function normalizeEmail(email?: string | null): string | null {
    const value = (email || '').trim().toLowerCase();
    return value || null;
}

export function normalizePhone(phone?: string | null): string | null {
    const value = (phone || '').replace(/\D/g, '');
    return value || null;
}

export function normalizePrefix(prefix?: string | null): string | null {
    const value = (prefix || '').replace(/\D/g, '');
    return value || null;
}

export async function getEnrollmentInstallmentPlan(params: {
    companyId: number;
    enrollmentId: number;
    userId?: string;
}) {
    return prisma.groupClassEnrollment.findFirst({
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
                        orderBy: { sent_at: 'desc' },
                        take: 5,
                        select: {
                            id: true,
                            channel: true,
                            recipient_email: true,
                            recipient_phone: true,
                            message_subject: true,
                            message_body: true,
                            sent_at: true,
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

export async function listFullCoursePaymentPlansForUser(userId: string) {
    return prisma.groupClassEnrollment.findMany({
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
                        orderBy: { sent_at: 'desc' },
                        take: 5,
                        select: {
                            id: true,
                            channel: true,
                            recipient_email: true,
                            recipient_phone: true,
                            message_subject: true,
                            message_body: true,
                            sent_at: true,
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

export async function listCompanyGroupPaymentSourceData(companyId: number) {
    const [company, eventBookings, classEnrollments] = await Promise.all([
        prisma.company.findUnique({
            where: { id: companyId },
            select: {
                id: true,
                name: true,
                slug: true,
                currency: true,
            },
        }),
        prisma.groupEventBooking.findMany({
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
        prisma.groupClassEnrollment.findMany({
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
                            orderBy: { sent_at: 'desc' },
                            take: 5,
                            select: {
                                id: true,
                                channel: true,
                                recipient_email: true,
                                recipient_phone: true,
                                message_subject: true,
                                message_body: true,
                                sent_at: true,
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

export async function getInstallmentReminderTarget(companyId: number, installmentId: number) {
    return prisma.enrollmentInstallment.findFirst({
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
                orderBy: { sent_at: 'desc' },
                take: 20,
                select: {
                    id: true,
                    channel: true,
                    recipient_email: true,
                    recipient_phone: true,
                    message_subject: true,
                    message_body: true,
                    sent_at: true,
                    sent_by_admin_id: true,
                    sent_by_admin: {
                        select: { id: true, name: true, email: true },
                    },
                },
            },
        },
    });
}

export async function getLatestReminderLog(installmentId: number, channel: string) {
    return prisma.installmentReminderLog.findFirst({
        where: {
            installment_id: installmentId,
            channel,
        },
        orderBy: { sent_at: 'desc' },
    });
}

export async function createReminderLog(data: {
    company_id: number;
    enrollment_id: number;
    installment_id: number;
    sent_by_admin_id?: string | null;
    channel: string;
    recipient_email?: string | null;
    recipient_phone?: string | null;
    message_subject?: string | null;
    message_body?: string | null;
}) {
    return prisma.installmentReminderLog.create({
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
        },
        include: {
            sent_by_admin: {
                select: { id: true, name: true, email: true },
            },
        },
    });
}

export async function listReminderLogs(companyId: number, installmentId: number) {
    return prisma.installmentReminderLog.findMany({
        where: {
            company_id: companyId,
            installment_id: installmentId,
        },
        include: {
            sent_by_admin: {
                select: { id: true, name: true, email: true },
            },
        },
        orderBy: { sent_at: 'desc' },
    });
}

export async function listInstallmentsEligibleForReminders(params: {
    companyId: number;
    installmentIds?: number[];
}) {
    return prisma.enrollmentInstallment.findMany({
        where: {
            enrollment: {
                company_id: params.companyId,
            },
            ...(params.installmentIds?.length ? { id: { in: params.installmentIds } } : {}),
            payment_status: {
                not: PaymentStatus.PAID,
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
                orderBy: { sent_at: 'desc' },
                take: 20,
                select: {
                    id: true,
                    channel: true,
                    recipient_email: true,
                    recipient_phone: true,
                    message_subject: true,
                    message_body: true,
                    sent_at: true,
                    sent_by_admin_id: true,
                },
            },
        },
        orderBy: [{ due_date: 'asc' }, { installment_number: 'asc' }],
    });
}
