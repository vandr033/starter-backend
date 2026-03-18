import { logger } from "../config/logger";
import { Prisma, prisma } from "../prisma/client";
import { buildMarketplaceVisibilityWhere } from "./marketplace-visibility";

// ---------------------------------------------------------------------------
// Aggregation (existing)
// ---------------------------------------------------------------------------

export const getTopRatedReviews = async (limit: number = 10) => {
  try {
    const ratedGroups = await prisma.review.groupBy({
      by: ['company_id'],
      _avg: { rating: true },
      _count: { rating: true },
      where: {
        company: buildMarketplaceVisibilityWhere(),
      },
      orderBy: [
        { _avg: { rating: 'desc' } },
        { _count: { rating: 'desc' } },
      ],
      take: limit,
    });
    return ratedGroups;
  } catch (error) {
    logger.error("Error al obtener las reseñas top");
    logger.error(error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface CreateReviewData {
  company_id: number;
  user_id: string;
  booking_id: number;
  service_id?: number | null;
  staff_id?: number | null;
  rating: number;
  comment?: string | null;
  rating_service_quality?: number | null;
  rating_staff_attention?: number | null;
  rating_punctuality?: number | null;
  rating_cleanliness?: number | null;
}

export const createReview = async (data: CreateReviewData) => {
  return prisma.review.create({
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

export const findReviewByBookingId = async (bookingId: number) => {
  return prisma.review.findUnique({
    where: { booking_id: bookingId },
  });
};

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
} as const;

export const listCompanyPublicReviews = async (
  companyId: number,
  page: number,
  limit: number,
) => {
  const skip = (page - 1) * limit;
  const [reviews, total] = await prisma.$transaction([
    prisma.review.findMany({
      where: { company_id: companyId },
      select: publicReviewSelect,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.review.count({ where: { company_id: companyId } }),
  ]);
  return { reviews, total, page, limit };
};

export const listCustomerReviews = async (userId: string) => {
  return prisma.review.findMany({
    where: { user_id: userId },
    select: {
      ...publicReviewSelect,
      company: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { created_at: 'desc' },
  });
};

export const listAdminReviews = async (companyId: number) => {
  return prisma.review.findMany({
    where: { company_id: companyId },
    select: {
      ...publicReviewSelect,
      booking: { select: { id: true, start_at: true, end_at: true, status: true } },
      company: { select: { id: true, name: true } },
    },
    orderBy: { created_at: 'desc' },
  });
};

export const listStaffReviews = async (staffId: number, companyId: number) => {
  return prisma.review.findMany({
    where: { staff_id: staffId, company_id: companyId },
    select: publicReviewSelect,
    orderBy: { created_at: 'desc' },
  });
};

// ---------------------------------------------------------------------------
// Metrics / Summary
// ---------------------------------------------------------------------------

export const getReviewMetrics = async (companyId: number) => {
  const [aggregate, distribution] = await prisma.$transaction([
    prisma.review.aggregate({
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
    prisma.review.groupBy({
      by: ['rating'],
      where: { company_id: companyId },
      orderBy: { rating: 'asc' },
      _count: { _all: true },
    }),
  ]);

  const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of distribution) {
    const count = typeof row._count === 'object' && row._count ? (row._count as Record<string, number>)._all : 0;
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

// ---------------------------------------------------------------------------
// Enhanced admin listing with pagination, search, and filters
// ---------------------------------------------------------------------------

export interface AdminReviewFilters {
  page?: number;
  limit?: number;
  search?: string;
  rating?: number;
  staffId?: number;
  serviceId?: number;
  hasComment?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export const listAdminReviewsFiltered = async (
  companyId: number,
  filters: AdminReviewFilters = {},
) => {
  const page = filters.page ?? 1;
  const limit = Math.min(filters.limit ?? 20, 50);
  const skip = (page - 1) * limit;

  const where: any = { company_id: companyId };

  if (filters.rating) where.rating = filters.rating;
  if (filters.staffId) where.staff_id = filters.staffId;
  if (filters.serviceId) where.service_id = filters.serviceId;
  if (filters.hasComment === true) where.comment = { not: null };
  if (filters.hasComment === false) where.comment = null;
  if (filters.dateFrom || filters.dateTo) {
    where.created_at = {};
    if (filters.dateFrom) where.created_at.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.created_at.lte = new Date(filters.dateTo + 'T23:59:59.999Z');
  }
  if (filters.search) {
    where.OR = [
      { comment: { contains: filters.search } },
      { user: { first_name: { contains: filters.search } } },
      { user: { last_name: { contains: filters.search } } },
    ];
  }

  const [reviews, total] = await prisma.$transaction([
    prisma.review.findMany({
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
    prisma.review.count({ where }),
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

// ---------------------------------------------------------------------------
// Review volume over time (last 6 months, grouped by month)
// ---------------------------------------------------------------------------

export const getReviewVolumeByMonth = async (companyId: number) => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const reviews = await prisma.review.findMany({
    where: {
      company_id: companyId,
      created_at: { gte: sixMonthsAgo },
    },
    select: { created_at: true, rating: true },
    orderBy: { created_at: 'asc' },
  });

  const months: Record<string, { count: number; totalRating: number }> = {};
  for (const r of reviews) {
    const key = `${r.created_at.getFullYear()}-${String(r.created_at.getMonth() + 1).padStart(2, '0')}`;
    if (!months[key]) months[key] = { count: 0, totalRating: 0 };
    months[key].count++;
    months[key].totalRating += r.rating;
  }

  return Object.entries(months).map(([month, data]) => ({
    month,
    count: data.count,
    avgRating: Math.round((data.totalRating / data.count) * 10) / 10,
  }));
};

// ---------------------------------------------------------------------------
// Top rated staff
// ---------------------------------------------------------------------------

export const getTopRatedStaff = async (companyId: number) => {
  const groups = await prisma.review.groupBy({
    by: ['staff_id'],
    where: { company_id: companyId, staff_id: { not: null } },
    _avg: { rating: true },
    _count: { rating: true },
    orderBy: [{ _avg: { rating: 'desc' } }, { _count: { rating: 'desc' } }],
    take: 10,
  });

  if (groups.length === 0) return [];

  const staffIds = groups.map((g) => g.staff_id!).filter(Boolean);
  const staffProfiles = await prisma.staffProfile.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, display_name: true },
  });
  const staffMap = new Map(staffProfiles.map((s) => [s.id, s.display_name]));

  return groups.map((g) => ({
    staffId: g.staff_id!,
    name: staffMap.get(g.staff_id!) ?? 'Unknown',
    avgRating: Math.round((g._avg.rating ?? 0) * 10) / 10,
    reviewCount: g._count.rating,
  }));
};

// ---------------------------------------------------------------------------
// Top rated services
// ---------------------------------------------------------------------------

export const getTopRatedServices = async (companyId: number) => {
  const groups = await prisma.review.groupBy({
    by: ['service_id'],
    where: { company_id: companyId, service_id: { not: null } },
    _avg: { rating: true },
    _count: { rating: true },
    orderBy: [{ _avg: { rating: 'desc' } }, { _count: { rating: 'desc' } }],
    take: 10,
  });

  if (groups.length === 0) return [];

  const serviceIds = groups.map((g) => g.service_id!).filter(Boolean);
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds } },
    select: { id: true, name: true },
  });
  const serviceMap = new Map(services.map((s) => [s.id, s.name]));

  return groups.map((g) => ({
    serviceId: g.service_id!,
    name: serviceMap.get(g.service_id!) ?? 'Unknown',
    avgRating: Math.round((g._avg.rating ?? 0) * 10) / 10,
    reviewCount: g._count.rating,
  }));
};

// ---------------------------------------------------------------------------
// Recent low ratings (rating <= 2)
// ---------------------------------------------------------------------------

export const getRecentLowRatings = async (companyId: number, limit: number = 5) => {
  return prisma.review.findMany({
    where: { company_id: companyId, rating: { lte: 2 } },
    select: {
      ...publicReviewSelect,
      booking: { select: { id: true, start_at: true } },
    },
    orderBy: { created_at: 'desc' },
    take: limit,
  });
};

// ---------------------------------------------------------------------------
// Find staff profile by user_id + company_id (for role scoping)
// ---------------------------------------------------------------------------

export const findStaffProfileByUserId = async (userId: string, companyId: number) => {
  return prisma.staffProfile.findFirst({
    where: { user_id: userId, company_id: companyId, deleted_at: null },
    select: { id: true },
  });
};

// ---------------------------------------------------------------------------
// Eligibility helpers
// ---------------------------------------------------------------------------

export const getCompletedBookingsWithoutReview = async (userId: string) => {
  return prisma.booking.findMany({
    where: {
      customer: { user_id: userId },
      status: 'COMPLETED',
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
      company: { select: { id: true, name: true, slug: true } },
      staff: { select: { id: true, display_name: true } },
      booking_services: {
        select: { service: { select: { id: true, name: true } } },
      },
    },
    orderBy: { end_at: 'desc' },
  });
};

export const getBookingForReview = async (bookingId: number) => {
  return prisma.booking.findUnique({
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
