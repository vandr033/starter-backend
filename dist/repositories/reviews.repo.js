"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBookingForReview = exports.getCompletedBookingsWithoutReview = exports.findStaffProfileByUserId = exports.getRecentLowRatings = exports.getTopRatedServices = exports.getTopRatedStaff = exports.getReviewVolumeByMonth = exports.listAdminReviewsFiltered = exports.getReviewMetrics = exports.listStaffReviews = exports.listAdminReviews = exports.listCustomerReviews = exports.listCompanyPublicReviews = exports.deleteReview = exports.findReviewById = exports.findReviewByBookingId = exports.createReview = exports.getTopRatedReviews = void 0;
const logger_1 = require("../config/logger");
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
const marketplace_visibility_1 = require("./marketplace-visibility");
// ---------------------------------------------------------------------------
// Aggregation (existing)
// ---------------------------------------------------------------------------
const getTopRatedReviews = async (limit = 10) => {
    try {
        const ratedGroups = await client_1.prisma.review.groupBy({
            by: ['company_id'],
            _avg: { rating: true },
            _count: { rating: true },
            where: {
                company: (0, marketplace_visibility_1.buildMarketplaceVisibilityWhere)(),
            },
            orderBy: [
                { _avg: { rating: 'desc' } },
                { _count: { rating: 'desc' } },
            ],
            take: limit,
        });
        return ratedGroups;
    }
    catch (error) {
        logger_1.logger.error("Error al obtener las reseñas top");
        logger_1.logger.error(error);
        throw error;
    }
};
exports.getTopRatedReviews = getTopRatedReviews;
const createReview = async (data) => {
    return client_1.prisma.review.create({
        data: {
            company_id: data.company_id,
            user_id: data.user_id,
            booking_id: data.booking_id,
            service_id: data.service_id ?? null,
            staff_id: data.staff_id ?? null,
            rating: data.rating,
            comment: data.comment ?? null,
            rating_service_quality: data.rating_service_quality ?? null,
            rating_staff_attention: data.rating_staff_attention ?? null,
            rating_punctuality: data.rating_punctuality ?? null,
            rating_cleanliness: data.rating_cleanliness ?? null,
        },
        include: {
            company: { select: { id: true, name: true, slug: true } },
            service: { select: { id: true, name: true } },
            staff: { select: { id: true, display_name: true } },
        },
    });
};
exports.createReview = createReview;
const findReviewByBookingId = async (bookingId) => {
    return client_1.prisma.review.findUnique({
        where: { booking_id: bookingId },
    });
};
exports.findReviewByBookingId = findReviewByBookingId;
const findReviewById = async (reviewId) => {
    return client_1.prisma.review.findUnique({
        where: { id: reviewId },
        select: { id: true, company_id: true, user_id: true },
    });
};
exports.findReviewById = findReviewById;
const deleteReview = async (reviewId) => {
    return client_1.prisma.review.delete({
        where: { id: reviewId },
    });
};
exports.deleteReview = deleteReview;
// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------
const publicReviewSelect = {
    id: true,
    rating: true,
    comment: true,
    rating_service_quality: true,
    rating_staff_attention: true,
    rating_punctuality: true,
    rating_cleanliness: true,
    created_at: true,
    user: { select: { first_name: true, last_name: true, image: true } },
    service: { select: { id: true, name: true } },
    staff: { select: { id: true, display_name: true } },
};
const listCompanyPublicReviews = async (companyId, page, limit) => {
    const skip = (page - 1) * limit;
    const [reviews, total] = await client_1.prisma.$transaction([
        client_1.prisma.review.findMany({
            where: { company_id: companyId },
            select: publicReviewSelect,
            orderBy: { created_at: 'desc' },
            skip,
            take: limit,
        }),
        client_1.prisma.review.count({ where: { company_id: companyId } }),
    ]);
    return { reviews, total, page, limit };
};
exports.listCompanyPublicReviews = listCompanyPublicReviews;
const listCustomerReviews = async (userId) => {
    return client_1.prisma.review.findMany({
        where: { user_id: userId },
        select: {
            ...publicReviewSelect,
            company: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { created_at: 'desc' },
    });
};
exports.listCustomerReviews = listCustomerReviews;
const listAdminReviews = async (companyId) => {
    return client_1.prisma.review.findMany({
        where: { company_id: companyId },
        select: {
            ...publicReviewSelect,
            booking: { select: { id: true, start_at: true, end_at: true, status: true } },
            company: { select: { id: true, name: true } },
        },
        orderBy: { created_at: 'desc' },
    });
};
exports.listAdminReviews = listAdminReviews;
const listStaffReviews = async (staffId, companyId) => {
    return client_1.prisma.review.findMany({
        where: { staff_id: staffId, company_id: companyId },
        select: publicReviewSelect,
        orderBy: { created_at: 'desc' },
    });
};
exports.listStaffReviews = listStaffReviews;
// ---------------------------------------------------------------------------
// Metrics / Summary
// ---------------------------------------------------------------------------
const getReviewMetrics = async (companyId) => {
    const [aggregate, distribution] = await client_1.prisma.$transaction([
        client_1.prisma.review.aggregate({
            where: { company_id: companyId },
            _avg: {
                rating: true,
                rating_service_quality: true,
                rating_staff_attention: true,
                rating_punctuality: true,
                rating_cleanliness: true,
            },
            _count: { rating: true },
        }),
        client_1.prisma.review.groupBy({
            by: ['rating'],
            where: { company_id: companyId },
            orderBy: { rating: 'asc' },
            _count: { _all: true },
        }),
    ]);
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of distribution) {
        const count = typeof row._count === 'object' && row._count ? row._count._all : 0;
        ratingDistribution[row.rating] = count ?? 0;
    }
    return {
        average: aggregate._avg.rating ? Math.round(aggregate._avg.rating * 10) / 10 : 0,
        count: aggregate._count.rating,
        subRatings: {
            serviceQuality: aggregate._avg.rating_service_quality
                ? Math.round(aggregate._avg.rating_service_quality * 10) / 10
                : null,
            staffAttention: aggregate._avg.rating_staff_attention
                ? Math.round(aggregate._avg.rating_staff_attention * 10) / 10
                : null,
            punctuality: aggregate._avg.rating_punctuality
                ? Math.round(aggregate._avg.rating_punctuality * 10) / 10
                : null,
            cleanliness: aggregate._avg.rating_cleanliness
                ? Math.round(aggregate._avg.rating_cleanliness * 10) / 10
                : null,
        },
        distribution: ratingDistribution,
    };
};
exports.getReviewMetrics = getReviewMetrics;
const listAdminReviewsFiltered = async (companyId, filters = {}) => {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 50);
    const skip = (page - 1) * limit;
    const where = { company_id: companyId };
    if (filters.rating)
        where.rating = filters.rating;
    if (filters.staffId)
        where.staff_id = filters.staffId;
    if (filters.serviceId)
        where.service_id = filters.serviceId;
    if (filters.hasComment === true)
        where.comment = { not: null };
    if (filters.hasComment === false)
        where.comment = null;
    if (filters.dateFrom || filters.dateTo) {
        where.created_at = {};
        if (filters.dateFrom)
            where.created_at.gte = new Date(filters.dateFrom);
        if (filters.dateTo)
            where.created_at.lte = new Date(filters.dateTo + 'T23:59:59.999Z');
    }
    if (filters.search) {
        where.OR = [
            { comment: { contains: filters.search } },
            { user: { first_name: { contains: filters.search } } },
            { user: { last_name: { contains: filters.search } } },
        ];
    }
    const [reviews, total] = await client_1.prisma.$transaction([
        client_1.prisma.review.findMany({
            where,
            select: {
                ...publicReviewSelect,
                booking: { select: { id: true, start_at: true, end_at: true, status: true } },
                company: { select: { id: true, name: true } },
            },
            orderBy: { created_at: 'desc' },
            skip,
            take: limit,
        }),
        client_1.prisma.review.count({ where }),
    ]);
    return {
        reviews,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasNextPage: skip + limit < total,
        },
    };
};
exports.listAdminReviewsFiltered = listAdminReviewsFiltered;
// ---------------------------------------------------------------------------
// Review volume over time (last 6 months, grouped by month)
// ---------------------------------------------------------------------------
const getReviewVolumeByMonth = async (companyId) => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);
    const reviews = await client_1.prisma.review.findMany({
        where: {
            company_id: companyId,
            created_at: { gte: sixMonthsAgo },
        },
        select: { created_at: true, rating: true },
        orderBy: { created_at: 'asc' },
    });
    const months = {};
    for (const r of reviews) {
        const key = `${r.created_at.getFullYear()}-${String(r.created_at.getMonth() + 1).padStart(2, '0')}`;
        if (!months[key])
            months[key] = { count: 0, totalRating: 0 };
        months[key].count++;
        months[key].totalRating += r.rating;
    }
    return Object.entries(months).map(([month, data]) => ({
        month,
        count: data.count,
        avgRating: Math.round((data.totalRating / data.count) * 10) / 10,
    }));
};
exports.getReviewVolumeByMonth = getReviewVolumeByMonth;
// ---------------------------------------------------------------------------
// Top rated staff
// ---------------------------------------------------------------------------
const getTopRatedStaff = async (companyId) => {
    const groups = await client_1.prisma.review.groupBy({
        by: ['staff_id'],
        where: { company_id: companyId, staff_id: { not: null } },
        _avg: { rating: true },
        _count: { rating: true },
        orderBy: [{ _avg: { rating: 'desc' } }, { _count: { rating: 'desc' } }],
        take: 10,
    });
    if (groups.length === 0)
        return [];
    const staffIds = groups.map((g) => g.staff_id).filter(Boolean);
    const staffProfiles = await client_1.prisma.staffProfile.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, display_name: true },
    });
    const staffMap = new Map(staffProfiles.map((s) => [s.id, s.display_name]));
    return groups.map((g) => ({
        staffId: g.staff_id,
        name: staffMap.get(g.staff_id) ?? 'Unknown',
        avgRating: Math.round((g._avg.rating ?? 0) * 10) / 10,
        reviewCount: g._count.rating,
    }));
};
exports.getTopRatedStaff = getTopRatedStaff;
// ---------------------------------------------------------------------------
// Top rated services
// ---------------------------------------------------------------------------
const getTopRatedServices = async (companyId) => {
    const groups = await client_1.prisma.review.groupBy({
        by: ['service_id'],
        where: { company_id: companyId, service_id: { not: null } },
        _avg: { rating: true },
        _count: { rating: true },
        orderBy: [{ _avg: { rating: 'desc' } }, { _count: { rating: 'desc' } }],
        take: 10,
    });
    if (groups.length === 0)
        return [];
    const serviceIds = groups.map((g) => g.service_id).filter(Boolean);
    const services = await client_1.prisma.service.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true, name: true },
    });
    const serviceMap = new Map(services.map((s) => [s.id, s.name]));
    return groups.map((g) => ({
        serviceId: g.service_id,
        name: serviceMap.get(g.service_id) ?? 'Unknown',
        avgRating: Math.round((g._avg.rating ?? 0) * 10) / 10,
        reviewCount: g._count.rating,
    }));
};
exports.getTopRatedServices = getTopRatedServices;
// ---------------------------------------------------------------------------
// Recent low ratings (rating <= 2)
// ---------------------------------------------------------------------------
const getRecentLowRatings = async (companyId, limit = 5) => {
    return client_1.prisma.review.findMany({
        where: { company_id: companyId, rating: { lte: 2 } },
        select: {
            ...publicReviewSelect,
            booking: { select: { id: true, start_at: true } },
        },
        orderBy: { created_at: 'desc' },
        take: limit,
    });
};
exports.getRecentLowRatings = getRecentLowRatings;
// ---------------------------------------------------------------------------
// Find staff profile by user_id + company_id (for role scoping)
// ---------------------------------------------------------------------------
const findStaffProfileByUserId = async (userId, companyId) => {
    return client_1.prisma.staffProfile.findFirst({
        where: { user_id: userId, company_id: companyId, deleted_at: null },
        select: { id: true },
    });
};
exports.findStaffProfileByUserId = findStaffProfileByUserId;
// ---------------------------------------------------------------------------
// Eligibility helpers
// ---------------------------------------------------------------------------
const getCompletedBookingsWithoutReview = async (userId) => {
    return client_1.prisma.booking.findMany({
        where: {
            customer: { user_id: userId },
            status: { in: [client_2.BookingStatus.PENDING, client_2.BookingStatus.CONFIRMED, client_2.BookingStatus.COMPLETED] },
            deleted_at: null,
            booking_review: null,
        },
        select: {
            id: true,
            company_id: true,
            staff_id: true,
            start_at: true,
            end_at: true,
            status: true,
            notes: true,
            updated_at: true,
            company: { select: { id: true, name: true, slug: true } },
            staff: { select: { id: true, display_name: true } },
            booking_services: {
                select: { service: { select: { id: true, name: true } } },
            },
            booking_review: { select: { id: true } },
        },
        orderBy: { end_at: 'desc' },
    });
};
exports.getCompletedBookingsWithoutReview = getCompletedBookingsWithoutReview;
const getBookingForReview = async (bookingId) => {
    return client_1.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
            customer: { select: { id: true, user_id: true } },
            company: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    company_users: { select: { user_id: true } },
                },
            },
            staff: { select: { id: true, user_id: true } },
            booking_services: {
                select: { service: { select: { id: true, name: true } } },
                take: 1,
            },
            booking_review: { select: { id: true } },
        },
    });
};
exports.getBookingForReview = getBookingForReview;
