import { BookingStatus } from '@prisma/client';
import { prisma } from '../prisma/client';

export interface CustomerWithStats {
    id: number;
    userId: string | null;
    name: string;
    email: string | null;
    phone: string | null;
    phonePrefix: string | null;
    notes: string | null;
    totalBookings: number;
    lastBookingAt: Date | null;
    totalSpentCents: number;
}

function normalizeEmail(email?: string | null): string | null {
    const value = (email || '').trim().toLowerCase();
    return value || null;
}

function normalizePhone(phone?: string | null): string | null {
    const value = (phone || '').replace(/\D/g, '');
    return value || null;
}

function normalizePrefix(prefix?: string | null): string | null {
    const value = (prefix || '').replace(/\D/g, '');
    return value || null;
}

function buildCustomerKey(params: {
    userId?: string | null;
    email?: string | null;
    phone?: string | null;
    phonePrefix?: string | null;
    fallbackName?: string | null;
}): string {
    if (params.userId) return `user:${params.userId}`;
    if (params.email) return `email:${params.email}`;
    if (params.phone) {
        const prefix = params.phonePrefix || '';
        return `phone:${prefix}${params.phone}`;
    }
    const fallback = (params.fallbackName || 'guest').trim().toLowerCase() || 'guest';
    return `guest:${fallback}`;
}

export async function getCustomersWithBookingStats(
    companyId: number,
    search?: string
): Promise<CustomerWithStats[]> {
    const [customerProfiles, bookings] = await Promise.all([
        prisma.customerProfile.findMany({
            where: {
                company_id: companyId,
                deleted_at: null,
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
        prisma.booking.findMany({
            where: {
                company_id: companyId,
                deleted_at: null,
                status: { not: BookingStatus.CANCELLED },
            },
            select: {
                id: true,
                customer_id: true,
                client_name: true,
                client_email: true,
                client_phone_prefix: true,
                client_phone_number: true,
                start_at: true,
                total_price_cents: true,
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

    const customers = new Map<string, CustomerWithStats>();

    for (const profile of customerProfiles) {
        const email = normalizeEmail(profile.user.email);
        const phone = normalizePhone(profile.user.phoneNumber);
        const phonePrefix = normalizePrefix(profile.user.phone_prefix);
        const key = buildCustomerKey({
            userId: profile.user.id,
            email,
            phone,
            phonePrefix,
            fallbackName: profile.user.name,
        });

        customers.set(key, {
            id: profile.id,
            userId: profile.user.id,
            name: profile.user.name || 'Guest',
            email,
            phone,
            phonePrefix,
            notes: profile.notes,
            totalBookings: 0,
            lastBookingAt: null,
            totalSpentCents: 0,
        });
    }

    for (const booking of bookings) {
        const user = booking.customer?.user;
        const email = normalizeEmail(user?.email || booking.client_email);
        const phone = normalizePhone(user?.phoneNumber || booking.client_phone_number);
        const phonePrefix = normalizePrefix(user?.phone_prefix || booking.client_phone_prefix || '591');
        const name =
            (user?.name || booking.client_name || '').trim() ||
            (email ? email.split('@')[0] : 'Guest');
        const key = buildCustomerKey({
            userId: user?.id,
            email,
            phone,
            phonePrefix,
            fallbackName: name,
        });

        if (!customers.has(key)) {
            customers.set(key, {
                id: booking.customer_id ?? booking.id,
                userId: user?.id || null,
                name,
                email,
                phone,
                phonePrefix,
                notes: null,
                totalBookings: 0,
                lastBookingAt: null,
                totalSpentCents: 0,
            });
        }

        const current = customers.get(key)!;
        current.totalBookings += 1;
        current.totalSpentCents += booking.total_price_cents;
        if (!current.lastBookingAt || booking.start_at > current.lastBookingAt) {
            current.lastBookingAt = booking.start_at;
        }

        if (!current.name && name) current.name = name;
        if (!current.email && email) current.email = email;
        if (!current.phone && phone) current.phone = phone;
        if (!current.phonePrefix && phonePrefix) current.phonePrefix = phonePrefix;
    }

    const normalizedSearch = (search || '').trim().toLowerCase();
    const rows = Array.from(customers.values()).filter((row) => {
        if (!normalizedSearch) return true;

        const phoneText = `${row.phonePrefix || ''}${row.phone || ''}`.toLowerCase();
        return (
            row.name.toLowerCase().includes(normalizedSearch) ||
            (row.email || '').toLowerCase().includes(normalizedSearch) ||
            phoneText.includes(normalizedSearch)
        );
    });

    rows.sort((a, b) => {
        const aDate = a.lastBookingAt ? a.lastBookingAt.getTime() : 0;
        const bDate = b.lastBookingAt ? b.lastBookingAt.getTime() : 0;
        if (bDate !== aDate) return bDate - aDate;
        return a.name.localeCompare(b.name);
    });

    return rows;
}
