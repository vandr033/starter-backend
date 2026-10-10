"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCustomerKey = buildCustomerKey;
exports.buildCustomerCategoryFilter = buildCustomerCategoryFilter;
exports.getCustomersWithBookingStats = getCustomersWithBookingStats;
exports.getCustomerBookingHistory = getCustomerBookingHistory;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const booking_status_1 = require("../utils/booking-status");
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
function buildCustomerKey(params) {
    if (params.userId)
        return `user:${params.userId}`;
    if (params.email)
        return `email:${params.email}`;
    if (params.phone) {
        const prefix = params.phonePrefix || '';
        return `phone:${prefix}${params.phone}`;
    }
    const fallback = (params.fallbackName || 'guest').trim().toLowerCase() || 'guest';
    return `guest:${fallback}`;
}
function getBookingStatusWithNoShow(status, notes) {
    return (0, booking_status_1.getBookingLifecycleStatus)(status, notes);
}
function incrementCounter(counter, key) {
    if (!key)
        return;
    counter.set(key, (counter.get(key) || 0) + 1);
}
function pickTop(counter) {
    if (counter.size === 0) {
        return { key: null, count: 0 };
    }
    let topKey = null;
    let topCount = 0;
    for (const [key, count] of counter.entries()) {
        if (count > topCount) {
            topKey = key;
            topCount = count;
        }
    }
    return { key: topKey, count: topCount };
}
function roundToTwo(value) {
    return Math.round(value * 100) / 100;
}
function buildCustomerSeed(params) {
    return {
        id: params.id,
        customerKey: params.customerKey,
        userId: params.userId,
        name: params.name,
        email: params.email,
        phone: params.phone,
        phonePrefix: params.phonePrefix,
        notes: params.notes,
        totalBookings: 0,
        completedBookings: 0,
        cancelledBookings: 0,
        noShowBookings: 0,
        totalSpentCents: 0,
        spendEligibleBookings: 0,
        lastBookingAt: null,
        firstBookingAt: null,
        nextBookingAt: null,
        staffCounts: new Map(),
        serviceCounts: new Map(),
        categoryCounts: new Map(),
        recentActivity: {
            bookingId: null,
            happenedAt: null,
            status: null,
            staffName: null,
            serviceName: null,
        },
    };
}
function toFinalCustomer(row) {
    const topStaff = pickTop(row.staffCounts);
    const topService = pickTop(row.serviceCounts);
    const topCategory = pickTop(row.categoryCounts);
    const avgTicketCents = row.spendEligibleBookings > 0
        ? Math.round(row.totalSpentCents / row.spendEligibleBookings)
        : 0;
    let bookingFrequencyPerMonth = 0;
    if (row.totalBookings > 0 && row.firstBookingAt) {
        const elapsedMs = Date.now() - row.firstBookingAt.getTime();
        const elapsedMonths = Math.max(1, elapsedMs / (1000 * 60 * 60 * 24 * 30));
        bookingFrequencyPerMonth = roundToTwo(row.totalBookings / elapsedMonths);
    }
    return {
        id: row.id,
        customerKey: row.customerKey,
        userId: row.userId,
        name: row.name,
        email: row.email,
        phone: row.phone,
        phonePrefix: row.phonePrefix,
        notes: row.notes,
        totalBookings: row.totalBookings,
        completedBookings: row.completedBookings,
        cancelledBookings: row.cancelledBookings,
        noShowBookings: row.noShowBookings,
        totalSpentCents: row.totalSpentCents,
        avgTicketCents,
        lastBookingAt: row.lastBookingAt,
        nextBookingAt: row.nextBookingAt,
        favoriteStaffName: topStaff.key,
        favoriteStaffBookingCount: topStaff.count,
        preferredServiceName: topService.key,
        preferredCategoryName: topCategory.key,
        preferredServiceBookingCount: topService.count,
        bookingFrequencyPerMonth,
        recentActivity: row.recentActivity,
    };
}
function buildCustomerCategoryFilter(categoryId) {
    return {
        OR: [
            { bookings: { some: { deleted_at: null, booking_services: { some: { service: { category_id: categoryId } } } } } },
            { group_event_bookings: { some: { group_event: { is: { category_id: categoryId, deleted_at: null } } } } },
            { group_class_enrollments: { some: { group_class: { is: { category_id: categoryId, deleted_at: null } } } } },
            { group_event_interests: { some: { group_event: { is: { category_id: categoryId, deleted_at: null } } } } },
            { group_class_interests: { some: { group_class: { is: { category_id: categoryId, deleted_at: null } } } } },
        ],
    };
}
function buildCustomerKeyFromBooking(booking) {
    const user = booking.customer?.user && !booking.customer.user.deleted_at
        ? booking.customer.user
        : null;
    const email = normalizeEmail(user?.email || booking.client_email);
    const phone = normalizePhone(user?.phoneNumber || booking.client_phone_number);
    const phonePrefix = normalizePrefix(user?.phone_prefix || booking.client_phone_prefix || '591');
    const name = (user?.name || booking.client_name || '').trim() || (email ? email.split('@')[0] : 'Guest');
    return buildCustomerKey({
        userId: user?.id,
        email,
        phone,
        phonePrefix,
        fallbackName: name,
    });
}
async function fetchBookingsForCompany(companyId) {
    return client_2.prisma.booking.findMany({
        where: {
            company_id: companyId,
            deleted_at: null,
        },
        select: {
            id: true,
            customer_id: true,
            client_name: true,
            client_email: true,
            client_phone_prefix: true,
            client_phone_number: true,
            start_at: true,
            end_at: true,
            status: true,
            notes: true,
            booking_source: true,
            total_price_cents: true,
            staff: {
                select: {
                    id: true,
                    display_name: true,
                },
            },
            customer: {
                select: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phoneNumber: true,
                            phone_prefix: true,
                            deleted_at: true,
                        },
                    },
                },
            },
            booking_services: {
                select: {
                    service_name_snapshot: true,
                    duration_minutes_snapshot: true,
                    price_cents_snapshot: true,
                    service: {
                        select: {
                            name: true,
                            category: {
                                select: {
                                    id: true,
                                    name: true,
                                },
                            },
                        },
                    },
                },
            },
        },
        orderBy: { start_at: 'desc' },
    });
}
async function getCustomersWithBookingStats(companyId, search, categoryId) {
    const now = new Date();
    const [customerProfiles, bookings, registrations] = await Promise.all([
        client_2.prisma.customerProfile.findMany({
            where: {
                company_id: companyId,
                deleted_at: null,
                user: {
                    is: {
                        deleted_at: null,
                    },
                },
                ...(categoryId ? buildCustomerCategoryFilter(categoryId) : {}),
            },
            include: {
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
        fetchBookingsForCompany(companyId),
        categoryId ? client_2.prisma.freeEventRegistration.findMany({
            where: {
                company_id: companyId,
                group_event: { is: { category_id: categoryId, deleted_at: null } },
            },
            select: {
                id: true,
                user_id: true,
                first_name: true,
                last_name: true,
                email: true,
                phone_prefix: true,
                phone_number: true,
                user: { select: { id: true, name: true, email: true, phoneNumber: true, phone_prefix: true, deleted_at: true } },
            },
        }) : Promise.resolve([]),
    ]);
    const customerMap = new Map();
    for (const profile of customerProfiles) {
        const email = normalizeEmail(profile.user.email);
        const phone = normalizePhone(profile.user.phoneNumber);
        const phonePrefix = normalizePrefix(profile.user.phone_prefix);
        const customerKey = buildCustomerKey({
            userId: profile.user.id,
            email,
            phone,
            phonePrefix,
            fallbackName: profile.user.name,
        });
        customerMap.set(customerKey, buildCustomerSeed({
            id: profile.id,
            customerKey,
            userId: profile.user.id,
            name: profile.user.name || 'Guest',
            email,
            phone,
            phonePrefix,
            notes: profile.notes,
        }));
    }
    for (const registration of registrations) {
        if (registration.user?.deleted_at)
            continue;
        const email = normalizeEmail(registration.user?.email || registration.email);
        const phone = normalizePhone(registration.user?.phoneNumber || registration.phone_number);
        const phonePrefix = normalizePrefix(registration.user?.phone_prefix || registration.phone_prefix);
        const name = registration.user?.name || `${registration.first_name} ${registration.last_name}`.trim() || 'Guest';
        const userId = registration.user?.id || null;
        const customerKey = buildCustomerKey({ userId, email, phone, phonePrefix, fallbackName: name });
        if (!customerMap.has(customerKey)) {
            customerMap.set(customerKey, buildCustomerSeed({
                id: registration.id,
                customerKey,
                userId,
                name,
                email,
                phone,
                phonePrefix,
                notes: null,
            }));
        }
    }
    for (const booking of bookings) {
        const user = booking.customer?.user && !booking.customer.user.deleted_at
            ? booking.customer.user
            : null;
        if (booking.customer?.user?.deleted_at) {
            continue;
        }
        const email = normalizeEmail(user?.email || booking.client_email);
        const phone = normalizePhone(user?.phoneNumber || booking.client_phone_number);
        const phonePrefix = normalizePrefix(user?.phone_prefix || booking.client_phone_prefix || '591');
        const name = (user?.name || booking.client_name || '').trim() || (email ? email.split('@')[0] : 'Guest');
        const customerKey = buildCustomerKey({
            userId: user?.id,
            email,
            phone,
            phonePrefix,
            fallbackName: name,
        });
        if (categoryId && !customerMap.has(customerKey) && !booking.booking_services.some((bookingService) => bookingService.service?.category?.id === categoryId)) {
            continue;
        }
        if (!customerMap.has(customerKey)) {
            customerMap.set(customerKey, buildCustomerSeed({
                id: booking.customer_id ?? booking.id,
                customerKey,
                userId: user?.id || null,
                name,
                email,
                phone,
                phonePrefix,
                notes: null,
            }));
        }
        const current = customerMap.get(customerKey);
        current.totalBookings += 1;
        if (booking.status === client_1.BookingStatus.COMPLETED) {
            current.completedBookings += 1;
        }
        if (booking.status === client_1.BookingStatus.CANCELLED && !(0, booking_status_1.isNoShowBooking)(booking.status, booking.notes)) {
            current.cancelledBookings += 1;
        }
        if ((0, booking_status_1.isNoShowBooking)(booking.status, booking.notes)) {
            current.noShowBookings += 1;
        }
        if (booking.status !== client_1.BookingStatus.CANCELLED && !(0, booking_status_1.isNoShowBooking)(booking.status, booking.notes)) {
            current.totalSpentCents += booking.total_price_cents;
            current.spendEligibleBookings += 1;
        }
        if (!current.lastBookingAt || booking.start_at > current.lastBookingAt) {
            current.lastBookingAt = booking.start_at;
        }
        if (!current.firstBookingAt || booking.start_at < current.firstBookingAt) {
            current.firstBookingAt = booking.start_at;
        }
        if (booking.start_at >= now &&
            (booking.status === client_1.BookingStatus.PENDING || booking.status === client_1.BookingStatus.CONFIRMED) &&
            (!current.nextBookingAt || booking.start_at < current.nextBookingAt)) {
            current.nextBookingAt = booking.start_at;
        }
        incrementCounter(current.staffCounts, booking.staff.display_name);
        for (const bookingService of booking.booking_services) {
            const resolvedServiceName = bookingService.service_name_snapshot || bookingService.service?.name || null;
            const resolvedCategoryName = bookingService.service?.category?.name || null;
            incrementCounter(current.serviceCounts, resolvedServiceName);
            incrementCounter(current.categoryCounts, resolvedCategoryName);
        }
        if (!current.name && name)
            current.name = name;
        if (!current.email && email)
            current.email = email;
        if (!current.phone && phone)
            current.phone = phone;
        if (!current.phonePrefix && phonePrefix)
            current.phonePrefix = phonePrefix;
        if (!current.recentActivity.happenedAt || booking.start_at > current.recentActivity.happenedAt) {
            const firstService = booking.booking_services[0];
            current.recentActivity = {
                bookingId: booking.id,
                happenedAt: booking.start_at,
                status: getBookingStatusWithNoShow(booking.status, booking.notes),
                staffName: booking.staff.display_name,
                serviceName: firstService?.service_name_snapshot || firstService?.service?.name || null,
            };
        }
    }
    const normalizedSearch = (search || '').trim().toLowerCase();
    const rows = Array.from(customerMap.values())
        .map(toFinalCustomer)
        .filter((row) => {
        if (!normalizedSearch)
            return true;
        const phoneText = `${row.phonePrefix || ''}${row.phone || ''}`.toLowerCase();
        return (row.name.toLowerCase().includes(normalizedSearch) ||
            (row.email || '').toLowerCase().includes(normalizedSearch) ||
            phoneText.includes(normalizedSearch));
    });
    rows.sort((a, b) => {
        const aDate = a.lastBookingAt ? a.lastBookingAt.getTime() : 0;
        const bDate = b.lastBookingAt ? b.lastBookingAt.getTime() : 0;
        if (bDate !== aDate)
            return bDate - aDate;
        return a.name.localeCompare(b.name);
    });
    return rows;
}
async function getCustomerBookingHistory(params) {
    const safePage = Math.max(1, Math.trunc(params.page || 1));
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(params.limit || 20)));
    const bookings = await fetchBookingsForCompany(params.companyId);
    const matching = bookings.filter((booking) => buildCustomerKeyFromBooking(booking) === params.customerKey);
    const total = matching.length;
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const page = Math.min(safePage, totalPages);
    const start = (page - 1) * safeLimit;
    const paginated = matching.slice(start, start + safeLimit);
    return {
        items: paginated.map((booking) => ({
            id: booking.id,
            startAt: booking.start_at,
            endAt: booking.end_at,
            status: getBookingStatusWithNoShow(booking.status, booking.notes),
            source: booking.booking_source,
            totalPriceCents: booking.total_price_cents,
            notes: booking.notes,
            staffName: booking.staff.display_name,
            services: booking.booking_services.map((bookingService) => ({
                serviceName: bookingService.service_name_snapshot || bookingService.service?.name || null,
                categoryName: bookingService.service?.category?.name || null,
                durationMinutes: bookingService.duration_minutes_snapshot,
                priceCents: bookingService.price_cents_snapshot,
            })),
        })),
        pagination: {
            total,
            page,
            limit: safeLimit,
            totalPages,
            hasNextPage: page < totalPages,
        },
    };
}
