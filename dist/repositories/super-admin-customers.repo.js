"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllCustomers = getAllCustomers;
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
function addShopToCustomer(customer, shop) {
    if (!shop)
        return;
    if (!customer.shops.some((s) => s.id === shop.id)) {
        customer.shops.push({ id: shop.id, name: shop.name });
    }
}
async function getAllCustomers(options) {
    const { search, shopId, page, limit } = options;
    const [companyUsers, bookings] = await Promise.all([
        client_2.prisma.companyUser.findMany({
            where: {
                deleted_at: null,
                role: client_1.CompanyUserRole.CUSTOMER,
                ...(shopId ? { company_id: shopId } : {}),
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
                company: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { created_at: 'desc' },
        }),
        client_2.prisma.booking.findMany({
            where: {
                deleted_at: null,
                status: { notIn: [...booking_status_1.INACTIVE_BOOKING_STATUSES] },
                ...(shopId ? { company_id: shopId } : {}),
            },
            select: {
                id: true,
                customer_id: true,
                company_id: true,
                client_name: true,
                client_email: true,
                client_phone_prefix: true,
                client_phone_number: true,
                start_at: true,
                total_price_cents: true,
                company: {
                    select: { id: true, name: true },
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
                            },
                        },
                    },
                },
            },
            orderBy: { start_at: 'desc' },
        }),
    ]);
    const customerMap = new Map();
    let syntheticId = 1000000000;
    for (const companyUser of companyUsers) {
        const email = normalizeEmail(companyUser.user.email);
        const phone = normalizePhone(companyUser.user.phoneNumber);
        const phonePrefix = normalizePrefix(companyUser.user.phone_prefix);
        const key = buildCustomerKey({
            userId: companyUser.user.id,
            email,
            phone,
            phonePrefix,
            fallbackName: companyUser.user.name,
        });
        if (!customerMap.has(key)) {
            customerMap.set(key, {
                id: companyUser.id,
                userId: companyUser.user.id,
                name: companyUser.user.name || 'Unknown',
                email,
                phone,
                phonePrefix,
                shops: [],
                totalBookings: 0,
                totalSpentCents: 0,
                lastBookingAt: null,
            });
        }
        const current = customerMap.get(key);
        addShopToCustomer(current, companyUser.company);
    }
    for (const booking of bookings) {
        const user = booking.customer?.user;
        const email = normalizeEmail(user?.email || booking.client_email);
        const phone = normalizePhone(user?.phoneNumber || booking.client_phone_number);
        const phonePrefix = normalizePrefix(user?.phone_prefix || booking.client_phone_prefix || '591');
        const name = (user?.name || booking.client_name || '').trim() ||
            (email ? email.split('@')[0] : 'Guest');
        const key = buildCustomerKey({
            userId: user?.id,
            email,
            phone,
            phonePrefix,
            fallbackName: name,
        });
        if (!customerMap.has(key)) {
            customerMap.set(key, {
                id: booking.customer_id ?? syntheticId++,
                userId: user?.id || null,
                name,
                email,
                phone,
                phonePrefix,
                shops: [],
                totalBookings: 0,
                totalSpentCents: 0,
                lastBookingAt: null,
            });
        }
        const current = customerMap.get(key);
        addShopToCustomer(current, booking.company);
        current.totalBookings += 1;
        current.totalSpentCents += booking.total_price_cents;
        if (!current.lastBookingAt || booking.start_at > current.lastBookingAt) {
            current.lastBookingAt = booking.start_at;
        }
        if (!current.name && name)
            current.name = name;
        if (!current.email && email)
            current.email = email;
        if (!current.phone && phone)
            current.phone = phone;
        if (!current.phonePrefix && phonePrefix)
            current.phonePrefix = phonePrefix;
    }
    const normalizedSearch = (search || '').trim().toLowerCase();
    const filtered = Array.from(customerMap.values()).filter((row) => {
        if (!normalizedSearch)
            return true;
        const phoneText = `${row.phonePrefix || ''}${row.phone || ''}`.toLowerCase();
        const shopsText = row.shops.map((s) => s.name.toLowerCase()).join(' ');
        return (row.name.toLowerCase().includes(normalizedSearch) ||
            (row.email || '').toLowerCase().includes(normalizedSearch) ||
            phoneText.includes(normalizedSearch) ||
            shopsText.includes(normalizedSearch));
    });
    filtered.sort((a, b) => {
        const aDate = a.lastBookingAt ? a.lastBookingAt.getTime() : 0;
        const bDate = b.lastBookingAt ? b.lastBookingAt.getTime() : 0;
        if (bDate !== aDate)
            return bDate - aDate;
        return a.name.localeCompare(b.name);
    });
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * limit;
    const pageRows = filtered.slice(start, start + limit);
    return {
        customers: pageRows.map((row) => ({
            ...row,
            lastBookingAt: row.lastBookingAt ? row.lastBookingAt.toISOString() : null,
        })),
        pagination: {
            total,
            page: safePage,
            limit,
            totalPages,
        },
    };
}
