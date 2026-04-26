import { prisma } from '../prisma/client';
import { BookingStatus, CompanyUserRole, StaffProfileStatus } from '@prisma/client';
import { INACTIVE_BOOKING_STATUSES } from '../utils/booking-status';

interface GetAllStaffOptions {
    shopId?: number;
    status?: string;
    role?: string;
    page: number;
    limit: number;
}

export async function getAllStaff(options: GetAllStaffOptions) {
    const { shopId, status, role, page, limit } = options;
    const skip = (page - 1) * limit;

    const where: any = { deleted_at: null };

    if (shopId) where.company_id = shopId;
    if (status && Object.values(StaffProfileStatus).includes(status as StaffProfileStatus)) {
        where.status = status;
    }

    const [staffProfiles, total] = await Promise.all([
        prisma.staffProfile.findMany({
            where,
            skip,
            take: limit,
            orderBy: { created_at: 'desc' },
            include: {
                company: { select: { id: true, name: true } },
                user: { select: { id: true, name: true, email: true } },
            },
        }),
        prisma.staffProfile.count({ where }),
    ]);

    // Get CompanyUser role for each staff member
    const companyUserPairs = staffProfiles.map((sp) => ({
        company_id: sp.company_id,
        user_id: sp.user_id,
    }));

    const companyUsers = await prisma.companyUser.findMany({
        where: {
            OR: companyUserPairs.map((p) => ({
                company_id: p.company_id,
                user_id: p.user_id,
                deleted_at: null,
            })),
        },
        select: { company_id: true, user_id: true, role: true },
    });

    const roleMap = new Map(
        companyUsers.map((cu) => [`${cu.company_id}-${cu.user_id}`, cu.role]),
    );

    // Filter by role if specified (post-query since role is on CompanyUser)
    let filteredProfiles = staffProfiles;
    if (role && Object.values(CompanyUserRole).includes(role as CompanyUserRole)) {
        filteredProfiles = staffProfiles.filter((sp) => {
            const key = `${sp.company_id}-${sp.user_id}`;
            return roleMap.get(key) === role;
        });
    }

    // Get booking counts per staff member
    const staffIds = filteredProfiles.map((sp) => sp.id);
    const bookingCounts = await prisma.booking.groupBy({
        by: ['staff_id'],
        where: {
            staff_id: { in: staffIds },
            deleted_at: null,
            status: { notIn: [...INACTIVE_BOOKING_STATUSES] },
        },
        _count: { id: true },
    });

    const bookingCountMap = new Map(bookingCounts.map((bc) => [bc.staff_id, bc._count.id]));

    const totalPages = Math.ceil(total / limit);

    return {
        staff: filteredProfiles.map((sp) => ({
            id: sp.id,
            displayName: sp.display_name,
            shopName: sp.company.name,
            shopId: sp.company.id,
            email: sp.user.email,
            role: roleMap.get(`${sp.company_id}-${sp.user_id}`) || 'STAFF',
            status: sp.status,
            isBookable: sp.is_bookable,
            startDate: sp.start_date?.toISOString() || null,
            endDate: sp.end_date?.toISOString() || null,
            totalBookings: bookingCountMap.get(sp.id) || 0,
            createdAt: sp.created_at.toISOString(),
        })),
        pagination: { total, page, limit, totalPages },
    };
}
