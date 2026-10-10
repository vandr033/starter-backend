"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllStaff = getAllStaff;
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
const booking_status_1 = require("../utils/booking-status");
async function getAllStaff(options) {
    const { shopId, status, role, page, limit } = options;
    const skip = (page - 1) * limit;
    const where = { deleted_at: null };
    if (shopId)
        where.company_id = shopId;
    if (status && Object.values(client_2.StaffProfileStatus).includes(status)) {
        where.status = status;
    }
    const [staffProfiles, total] = await Promise.all([
        client_1.prisma.staffProfile.findMany({
            where,
            skip,
            take: limit,
            orderBy: { created_at: 'desc' },
            include: {
                company: { select: { id: true, name: true } },
                user: { select: { id: true, name: true, email: true } },
            },
        }),
        client_1.prisma.staffProfile.count({ where }),
    ]);
    // Get CompanyUser role for each staff member
    const companyUserPairs = staffProfiles.map((sp) => ({
        company_id: sp.company_id,
        user_id: sp.user_id,
    }));
    const companyUsers = await client_1.prisma.companyUser.findMany({
        where: {
            OR: companyUserPairs.map((p) => ({
                company_id: p.company_id,
                user_id: p.user_id,
                deleted_at: null,
            })),
        },
        select: { company_id: true, user_id: true, role: true },
    });
    const roleMap = new Map(companyUsers.map((cu) => [`${cu.company_id}-${cu.user_id}`, cu.role]));
    // Filter by role if specified (post-query since role is on CompanyUser)
    let filteredProfiles = staffProfiles;
    if (role && Object.values(client_2.CompanyUserRole).includes(role)) {
        filteredProfiles = staffProfiles.filter((sp) => {
            const key = `${sp.company_id}-${sp.user_id}`;
            return roleMap.get(key) === role;
        });
    }
    // Get booking counts per staff member
    const staffIds = filteredProfiles.map((sp) => sp.id);
    const bookingCounts = await client_1.prisma.booking.groupBy({
        by: ['staff_id'],
        where: {
            staff_id: { in: staffIds },
            deleted_at: null,
            status: { notIn: [...booking_status_1.INACTIVE_BOOKING_STATUSES] },
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
