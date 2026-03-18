import * as reviewsRepo from '../repositories/reviews.repo';
import type { AdminReviewFilters } from '../repositories/reviews.repo';
import { buildSuccessResponse, buildNotFoundResponse, buildServiceErrorResponse } from '../utils/mensajeApiUtils';
import { MensajeApi } from '../types/MensajeApi';
import type { CreateReviewInput } from '../schemas/review.schema';
import { notifyNewReview } from '../utils/reviewNotifications';
import { prisma } from '../prisma/client';

const REVIEW_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours

// ---------------------------------------------------------------------------
// canUserReviewBooking
// ---------------------------------------------------------------------------

export interface ReviewEligibility {
  eligible: boolean;
  reason?: string;
  booking?: Awaited<ReturnType<typeof reviewsRepo.getBookingForReview>>;
}

export const canUserReviewBooking = async (
  userId: string,
  bookingId: number,
): Promise<ReviewEligibility> => {
  const booking = await reviewsRepo.getBookingForReview(bookingId);

  if (!booking) {
    return { eligible: false, reason: 'Booking not found' };
  }

  // Must be COMPLETED
  if (booking.status !== 'COMPLETED') {
    return { eligible: false, reason: 'Booking is not completed' };
  }

  // Must not be soft-deleted
  if (booking.deleted_at) {
    return { eligible: false, reason: 'Booking not found' };
  }

  // User must be the customer who booked
  if (!booking.customer || booking.customer.user_id !== userId) {
    return { eligible: false, reason: 'You can only review your own bookings' };
  }

  // Prevent staff/owners from reviewing their own company
  const companyUserIds = booking.company.company_users.map((cu) => cu.user_id);
  if (companyUserIds.includes(userId)) {
    return { eligible: false, reason: 'Company members cannot review their own company' };
  }

  // 2-hour delay from booking end time
  const bookingEnd = new Date(booking.end_at).getTime();
  if (Date.now() < bookingEnd + REVIEW_DELAY_MS) {
    return { eligible: false, reason: 'Reviews can be submitted 2 hours after the appointment ends' };
  }

  // Already reviewed
  if (booking.booking_review) {
    return { eligible: false, reason: 'This booking has already been reviewed' };
  }

  return { eligible: true, booking };
};

// ---------------------------------------------------------------------------
// createReview
// ---------------------------------------------------------------------------

export const createReview = async (
  userId: string,
  input: CreateReviewInput,
): Promise<MensajeApi> => {
  try {
    const eligibility = await canUserReviewBooking(userId, input.booking_id);
    if (!eligibility.eligible) {
      return new MensajeApi({ code: 403, error: true, message: eligibility.reason ?? 'Not eligible' });
    }

    const booking = eligibility.booking!;
    const firstService = booking.booking_services?.[0]?.service;

    const review = await reviewsRepo.createReview({
      company_id: booking.company_id,
      user_id: userId,
      booking_id: booking.id,
      service_id: firstService?.id ?? null,
      staff_id: booking.staff_id,
      rating: input.rating,
      comment: input.comment ?? null,
      rating_service_quality: input.rating_service_quality ?? null,
      rating_staff_attention: input.rating_staff_attention ?? null,
      rating_punctuality: input.rating_punctuality ?? null,
      rating_cleanliness: input.rating_cleanliness ?? null,
    });

    // Resolve reviewer name (fire-and-forget)
    const reviewer = await prisma.user.findUnique({
      where: { id: userId },
      select: { first_name: true, last_name: true, name: true },
    });
    const reviewerName =
      [reviewer?.first_name, reviewer?.last_name].filter(Boolean).join(' ') ||
      reviewer?.name ||
      'Customer';

    void notifyNewReview({
      companyId: booking.company_id,
      reviewId: review.id,
      reviewerName,
      rating: input.rating,
      comment: input.comment ?? null,
      serviceName: firstService?.name ?? null,
      staffName: review.staff?.display_name ?? null,
    });

    return buildSuccessResponse('Review created', review, 201);
  } catch (error) {
    return buildServiceErrorResponse('review', 'create', error);
  }
};

// ---------------------------------------------------------------------------
// getEligibleBookingsPendingReview
// ---------------------------------------------------------------------------

export const getEligibleBookingsPendingReview = async (
  userId: string,
): Promise<MensajeApi> => {
  try {
    const bookings = await reviewsRepo.getCompletedBookingsWithoutReview(userId);
    const now = Date.now();
    const eligible = bookings.filter((b) => {
      const endMs = new Date(b.end_at).getTime();
      return now >= endMs + REVIEW_DELAY_MS;
    });
    return buildSuccessResponse('Eligible bookings', eligible);
  } catch (error) {
    return buildServiceErrorResponse('review', 'get eligible bookings', error);
  }
};

// ---------------------------------------------------------------------------
// listCustomerReviews
// ---------------------------------------------------------------------------

export const listCustomerReviews = async (userId: string): Promise<MensajeApi> => {
  try {
    const reviews = await reviewsRepo.listCustomerReviews(userId);
    return buildSuccessResponse('Customer reviews', reviews);
  } catch (error) {
    return buildServiceErrorResponse('review', 'list customer reviews', error);
  }
};

// ---------------------------------------------------------------------------
// listCompanyPublicReviews
// ---------------------------------------------------------------------------

export const listCompanyPublicReviews = async (
  companyId: number,
  page: number,
  limit: number,
): Promise<MensajeApi> => {
  try {
    const result = await reviewsRepo.listCompanyPublicReviews(companyId, page, limit);
    return buildSuccessResponse('Company reviews', result);
  } catch (error) {
    return buildServiceErrorResponse('review', 'list company reviews', error);
  }
};

// ---------------------------------------------------------------------------
// listAdminReviews
// ---------------------------------------------------------------------------

export const listAdminReviews = async (companyId: number): Promise<MensajeApi> => {
  try {
    const reviews = await reviewsRepo.listAdminReviews(companyId);
    return buildSuccessResponse('Admin reviews', reviews);
  } catch (error) {
    return buildServiceErrorResponse('review', 'list admin reviews', error);
  }
};

// ---------------------------------------------------------------------------
// listStaffReviews
// ---------------------------------------------------------------------------

export const listStaffReviews = async (
  staffId: number,
  companyId: number,
): Promise<MensajeApi> => {
  try {
    const reviews = await reviewsRepo.listStaffReviews(staffId, companyId);
    return buildSuccessResponse('Staff reviews', reviews);
  } catch (error) {
    return buildServiceErrorResponse('review', 'list staff reviews', error);
  }
};

// ---------------------------------------------------------------------------
// getReviewMetrics (admin dashboard)
// ---------------------------------------------------------------------------

export const getReviewMetrics = async (companyId: number): Promise<MensajeApi> => {
  try {
    const metrics = await reviewsRepo.getReviewMetrics(companyId);
    return buildSuccessResponse('Review metrics', metrics);
  } catch (error) {
    return buildServiceErrorResponse('review', 'get metrics', error);
  }
};

// ---------------------------------------------------------------------------
// listAdminReviewsFiltered (enhanced with pagination, search, filters)
// ---------------------------------------------------------------------------

export const listAdminReviewsFiltered = async (
  companyId: number,
  filters: AdminReviewFilters,
): Promise<MensajeApi> => {
  try {
    const result = await reviewsRepo.listAdminReviewsFiltered(companyId, filters);
    return buildSuccessResponse('Admin reviews', result);
  } catch (error) {
    return buildServiceErrorResponse('review', 'list admin reviews', error);
  }
};

// ---------------------------------------------------------------------------
// getExtendedMetrics (admin dashboard)
// ---------------------------------------------------------------------------

export const getExtendedMetrics = async (companyId: number): Promise<MensajeApi> => {
  try {
    const [metrics, volume, topStaff, topServices, lowRatings] = await Promise.all([
      reviewsRepo.getReviewMetrics(companyId),
      reviewsRepo.getReviewVolumeByMonth(companyId),
      reviewsRepo.getTopRatedStaff(companyId),
      reviewsRepo.getTopRatedServices(companyId),
      reviewsRepo.getRecentLowRatings(companyId),
    ]);

    return buildSuccessResponse('Extended review metrics', {
      ...metrics,
      volume,
      topStaff,
      topServices,
      recentLowRatings: lowRatings,
    });
  } catch (error) {
    return buildServiceErrorResponse('review', 'get extended metrics', error);
  }
};

// ---------------------------------------------------------------------------
// findStaffProfileByUserId (for role scoping)
// ---------------------------------------------------------------------------

export const findStaffProfileByUserId = async (userId: string, companyId: number) => {
  return reviewsRepo.findStaffProfileByUserId(userId, companyId);
};

// ---------------------------------------------------------------------------
// getReviewSummaryForCompany (public)
// ---------------------------------------------------------------------------

export const getReviewSummaryForCompany = async (companyId: number): Promise<MensajeApi> => {
  try {
    const metrics = await reviewsRepo.getReviewMetrics(companyId);
    return buildSuccessResponse('Review summary', {
      average: metrics.average,
      count: metrics.count,
      distribution: metrics.distribution,
      subRatings: metrics.subRatings,
    });
  } catch (error) {
    return buildServiceErrorResponse('review', 'get summary', error);
  }
};
