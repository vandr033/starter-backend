"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllUsers = getAllUsers;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const BOOKING_FLOW_SOURCES = [client_1.BookingSource.SALON_SITE, client_1.BookingSource.MARKETPLACE];
const VALID_SOURCE_FILTERS = ['FREE_EVENTS', 'BOOKING_FLOW', 'PRICONPRI_SITE'];
function normalizeSourceFilter(value) {
    if (!value)
        return undefined;
    const normalized = value.trim().toUpperCase();
    return VALID_SOURCE_FILTERS.includes(normalized) ? normalized : undefined;
}
function buildSourceWhereFilter(source) {
    if (!source)
        return undefined;
    if (source === 'FREE_EVENTS') {
        return {
            free_event_registrations: {
                some: {},
            },
        };
    }
    if (source === 'BOOKING_FLOW') {
        return {
            OR: [
                {
                    created_bookings: {
                        some: {
                            deleted_at: null,
                            booking_source: { in: BOOKING_FLOW_SOURCES },
                        },
                    },
                },
                {
                    group_event_bookings: {
                        some: {
                            cancelled_at: null,
                        },
                    },
                },
                {
                    group_class_enrollments: {
                        some: {
                            cancelled_at: null,
                        },
                    },
                },
            ],
        };
    }
    return {
        AND: [
            {
                free_event_registrations: {
                    none: {},
                },
            },
            {
                created_bookings: {
                    none: {
                        deleted_at: null,
                        booking_source: { in: BOOKING_FLOW_SOURCES },
                    },
                },
            },
            {
                group_event_bookings: {
                    none: {
                        cancelled_at: null,
                    },
                },
            },
            {
                group_class_enrollments: {
                    none: {
                        cancelled_at: null,
                    },
                },
            },
        ],
    };
}
function buildPrimarySource(params) {
    if (params.hasFreeEvents)
        return 'FREE_EVENTS';
    if (params.hasBookingFlow)
        return 'BOOKING_FLOW';
    return 'PRICONPRI_SITE';
}
async function getAllUsers(options) {
    const sourceFilter = normalizeSourceFilter(options.source);
    const page = Math.max(1, options.page);
    const limit = Math.min(Math.max(1, options.limit), 100);
    const skip = (page - 1) * limit;
    const search = (options.search || '').trim();
    const andFilters = [];
    if (search) {
        andFilters.push({
            OR: [
                { name: { contains: search } },
                { email: { contains: search } },
                { first_name: { contains: search } },
                { last_name: { contains: search } },
                { phoneNumber: { contains: search } },
            ],
        });
    }
    const sourceWhereFilter = buildSourceWhereFilter(sourceFilter);
    if (sourceWhereFilter) {
        andFilters.push(sourceWhereFilter);
    }
    const where = {
        deleted_at: null,
        is_super_admin: false,
        ...(andFilters.length > 0 ? { AND: andFilters } : {}),
    };
    const [users, total] = await Promise.all([
        client_2.prisma.user.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                first_name: true,
                last_name: true,
                email: true,
                phoneNumber: true,
                phone_prefix: true,
                is_active: true,
                emailVerified: true,
                phoneNumberVerified: true,
                createdAt: true,
                company_users: {
                    where: { deleted_at: null },
                    select: {
                        role: true,
                        company: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
                free_event_registrations: {
                    select: {
                        id: true,
                        company: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
                created_bookings: {
                    where: {
                        deleted_at: null,
                        booking_source: { in: BOOKING_FLOW_SOURCES },
                    },
                    select: {
                        id: true,
                        company: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
                group_event_bookings: {
                    where: {
                        cancelled_at: null,
                    },
                    select: {
                        id: true,
                        company: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
                group_class_enrollments: {
                    where: {
                        cancelled_at: null,
                    },
                    select: {
                        id: true,
                        company: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        }),
        client_2.prisma.user.count({ where }),
    ]);
    const rows = users.map((user) => {
        const roleSet = new Set();
        const shopMap = new Map();
        for (const assignment of user.company_users) {
            roleSet.add(assignment.role);
            shopMap.set(assignment.company.id, {
                id: assignment.company.id,
                name: assignment.company.name,
            });
        }
        for (const reg of user.free_event_registrations) {
            if (reg.company) {
                shopMap.set(reg.company.id, { id: reg.company.id, name: reg.company.name });
            }
        }
        for (const booking of user.created_bookings) {
            if (booking.company) {
                shopMap.set(booking.company.id, { id: booking.company.id, name: booking.company.name });
            }
        }
        for (const booking of user.group_event_bookings) {
            if (booking.company) {
                shopMap.set(booking.company.id, { id: booking.company.id, name: booking.company.name });
            }
        }
        for (const enrollment of user.group_class_enrollments) {
            if (enrollment.company) {
                shopMap.set(enrollment.company.id, { id: enrollment.company.id, name: enrollment.company.name });
            }
        }
        const freeEventsCount = user.free_event_registrations.length;
        const bookingFlowCount = user.created_bookings.length +
            user.group_event_bookings.length +
            user.group_class_enrollments.length;
        const hasFreeEvents = freeEventsCount > 0;
        const hasBookingFlow = bookingFlowCount > 0;
        const primarySource = buildPrimarySource({ hasFreeEvents, hasBookingFlow });
        const signupSources = [];
        if (hasFreeEvents)
            signupSources.push('FREE_EVENTS');
        if (hasBookingFlow)
            signupSources.push('BOOKING_FLOW');
        if (signupSources.length === 0)
            signupSources.push('PRICONPRI_SITE');
        return {
            id: user.id,
            name: user.name,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            phone: user.phoneNumber,
            phone_prefix: user.phone_prefix,
            is_active: user.is_active,
            email_verified: user.emailVerified,
            phone_verified: Boolean(user.phoneNumberVerified),
            created_at: user.createdAt.toISOString(),
            primary_signup_source: primarySource,
            signup_sources: signupSources,
            free_events_count: freeEventsCount,
            booking_flow_count: bookingFlowCount,
            direct_booking_count: user.created_bookings.length,
            group_event_booking_count: user.group_event_bookings.length,
            group_class_enrollment_count: user.group_class_enrollments.length,
            company_membership_count: user.company_users.length,
            roles: Array.from(roleSet.values()),
            shops: Array.from(shopMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
        };
    });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    return {
        users: rows,
        pagination: {
            total,
            page: safePage,
            limit,
            totalPages,
        },
        filters: {
            source: sourceFilter || null,
        },
    };
}
