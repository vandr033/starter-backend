"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReviewSummaryForCompany = exports.exportReviewsForCompany = exports.deleteReviewAsCustomer = exports.deleteReviewAsAdmin = exports.findStaffProfileByUserId = exports.getExtendedMetrics = exports.listAdminReviewsFiltered = exports.getReviewMetrics = exports.listStaffReviews = exports.listAdminReviews = exports.listCompanyPublicReviews = exports.listCustomerReviews = exports.getEligibleBookingsPendingReview = exports.createReview = exports.canUserReviewBooking = void 0;
const reviewsRepo = __importStar(require("../repositories/reviews.repo"));
const mensajeApiUtils_1 = require("../utils/mensajeApiUtils");
const MensajeApi_1 = require("../types/MensajeApi");
const reviewNotifications_1 = require("../utils/reviewNotifications");
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
const booking_status_1 = require("../utils/booking-status");
const REVIEW_DELAY_MS = 12 * 60 * 60 * 1000; // 12 hours
function resolveReviewEligibility(params) {
    const nowMs = params.nowMs ?? Date.now();
    const booking = params.booking;
    const lifecycleStatus = (0, booking_status_1.getBookingLifecycleStatus)(booking.status, booking.notes);
    if (lifecycleStatus === client_2.BookingStatus.CANCELLED) {
        return { eligible: false, reason: 'Cancelled bookings cannot be reviewed' };
    }
    if (lifecycleStatus === client_2.BookingStatus.NO_SHOW) {
        return { eligible: false, reason: 'No-show bookings cannot be reviewed' };
    }
    if (booking.booking_review) {
        return { eligible: false, reason: 'This booking has already been reviewed' };
    }
    if (lifecycleStatus === client_2.BookingStatus.COMPLETED) {
        const completedAt = new Date(booking.updated_at).getTime();
        if (nowMs < completedAt + REVIEW_DELAY_MS) {
            return {
                eligible: false,
                reason: 'Reviews can be submitted 12 hours after the appointment is marked as completed',
            };
        }
        return { eligible: true };
    }
    const bookingEnd = new Date(booking.end_at).getTime();
    if (nowMs < bookingEnd + REVIEW_DELAY_MS) {
        return {
            eligible: false,
            reason: 'Reviews can be submitted 12 hours after the appointment ends',
        };
    }
    return { eligible: true };
}
const canUserReviewBooking = async (userId, bookingId) => {
    const booking = await reviewsRepo.getBookingForReview(bookingId);
    if (!booking) {
        return { eligible: false, reason: 'Booking not found' };
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
    const timingEligibility = resolveReviewEligibility({ booking });
    if (!timingEligibility.eligible) {
        return { eligible: false, reason: timingEligibility.reason };
    }
    return { eligible: true, booking };
};
exports.canUserReviewBooking = canUserReviewBooking;
// ---------------------------------------------------------------------------
// createReview
// ---------------------------------------------------------------------------
const createReview = async (userId, input) => {
    try {
        const eligibility = await (0, exports.canUserReviewBooking)(userId, input.booking_id);
        if (!eligibility.eligible) {
            return new MensajeApi_1.MensajeApi({ code: 403, error: true, message: eligibility.reason ?? 'Not eligible' });
        }
        const booking = eligibility.booking;
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
        const reviewer = await client_1.prisma.user.findUnique({
            where: { id: userId },
            select: { first_name: true, last_name: true, name: true },
        });
        const reviewerName = [reviewer?.first_name, reviewer?.last_name].filter(Boolean).join(' ') ||
            reviewer?.name ||
            'Customer';
        void (0, reviewNotifications_1.notifyNewReview)({
            companyId: booking.company_id,
            reviewId: review.id,
            reviewerName,
            rating: input.rating,
            comment: input.comment ?? null,
            serviceName: firstService?.name ?? null,
            staffName: review.staff?.display_name ?? null,
        });
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Review created', review, 201);
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('review', 'create', error);
    }
};
exports.createReview = createReview;
// ---------------------------------------------------------------------------
// getEligibleBookingsPendingReview
// ---------------------------------------------------------------------------
const getEligibleBookingsPendingReview = async (userId) => {
    try {
        const bookings = await reviewsRepo.getCompletedBookingsWithoutReview(userId);
        const now = Date.now();
        const eligible = bookings.filter((b) => resolveReviewEligibility({ booking: b, nowMs: now }).eligible);
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Eligible bookings', eligible);
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('review', 'get eligible bookings', error);
    }
};
exports.getEligibleBookingsPendingReview = getEligibleBookingsPendingReview;
// ---------------------------------------------------------------------------
// listCustomerReviews
// ---------------------------------------------------------------------------
const listCustomerReviews = async (userId) => {
    try {
        const reviews = await reviewsRepo.listCustomerReviews(userId);
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Customer reviews', reviews);
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('review', 'list customer reviews', error);
    }
};
exports.listCustomerReviews = listCustomerReviews;
// ---------------------------------------------------------------------------
// listCompanyPublicReviews
// ---------------------------------------------------------------------------
const listCompanyPublicReviews = async (companyId, page, limit) => {
    try {
        const result = await reviewsRepo.listCompanyPublicReviews(companyId, page, limit);
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Company reviews', result);
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('review', 'list company reviews', error);
    }
};
exports.listCompanyPublicReviews = listCompanyPublicReviews;
// ---------------------------------------------------------------------------
// listAdminReviews
// ---------------------------------------------------------------------------
const listAdminReviews = async (companyId) => {
    try {
        const reviews = await reviewsRepo.listAdminReviews(companyId);
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Admin reviews', reviews);
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('review', 'list admin reviews', error);
    }
};
exports.listAdminReviews = listAdminReviews;
// ---------------------------------------------------------------------------
// listStaffReviews
// ---------------------------------------------------------------------------
const listStaffReviews = async (staffId, companyId) => {
    try {
        const reviews = await reviewsRepo.listStaffReviews(staffId, companyId);
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Staff reviews', reviews);
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('review', 'list staff reviews', error);
    }
};
exports.listStaffReviews = listStaffReviews;
// ---------------------------------------------------------------------------
// getReviewMetrics (admin dashboard)
// ---------------------------------------------------------------------------
const getReviewMetrics = async (companyId) => {
    try {
        const metrics = await reviewsRepo.getReviewMetrics(companyId);
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Review metrics', metrics);
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('review', 'get metrics', error);
    }
};
exports.getReviewMetrics = getReviewMetrics;
// ---------------------------------------------------------------------------
// listAdminReviewsFiltered (enhanced with pagination, search, filters)
// ---------------------------------------------------------------------------
const listAdminReviewsFiltered = async (companyId, filters) => {
    try {
        const result = await reviewsRepo.listAdminReviewsFiltered(companyId, filters);
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Admin reviews', result);
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('review', 'list admin reviews', error);
    }
};
exports.listAdminReviewsFiltered = listAdminReviewsFiltered;
// ---------------------------------------------------------------------------
// getExtendedMetrics (admin dashboard)
// ---------------------------------------------------------------------------
const getExtendedMetrics = async (companyId) => {
    try {
        const [metrics, volume, topStaff, topServices, lowRatings] = await Promise.all([
            reviewsRepo.getReviewMetrics(companyId),
            reviewsRepo.getReviewVolumeByMonth(companyId),
            reviewsRepo.getTopRatedStaff(companyId),
            reviewsRepo.getTopRatedServices(companyId),
            reviewsRepo.getRecentLowRatings(companyId),
        ]);
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Extended review metrics', {
            ...metrics,
            volume,
            topStaff,
            topServices,
            recentLowRatings: lowRatings,
        });
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('review', 'get extended metrics', error);
    }
};
exports.getExtendedMetrics = getExtendedMetrics;
// ---------------------------------------------------------------------------
// findStaffProfileByUserId (for role scoping)
// ---------------------------------------------------------------------------
const findStaffProfileByUserId = async (userId, companyId) => {
    return reviewsRepo.findStaffProfileByUserId(userId, companyId);
};
exports.findStaffProfileByUserId = findStaffProfileByUserId;
// ---------------------------------------------------------------------------
// deleteReviewAsAdmin
// ---------------------------------------------------------------------------
const deleteReviewAsAdmin = async (reviewId, companyId) => {
    try {
        const review = await reviewsRepo.findReviewById(reviewId);
        if (!review) {
            return (0, mensajeApiUtils_1.buildNotFoundResponse)('Review');
        }
        if (review.company_id !== companyId) {
            return new MensajeApi_1.MensajeApi({ code: 403, error: true, message: 'Review does not belong to this company' });
        }
        await reviewsRepo.deleteReview(reviewId);
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Review deleted');
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('review', 'delete', error);
    }
};
exports.deleteReviewAsAdmin = deleteReviewAsAdmin;
// ---------------------------------------------------------------------------
// deleteReviewAsCustomer
// ---------------------------------------------------------------------------
const deleteReviewAsCustomer = async (reviewId, userId) => {
    try {
        const review = await reviewsRepo.findReviewById(reviewId);
        if (!review) {
            return (0, mensajeApiUtils_1.buildNotFoundResponse)('Review');
        }
        if (review.user_id !== userId) {
            return new MensajeApi_1.MensajeApi({ code: 403, error: true, message: 'You can only delete your own reviews' });
        }
        await reviewsRepo.deleteReview(reviewId);
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Review deleted');
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('review', 'delete', error);
    }
};
exports.deleteReviewAsCustomer = deleteReviewAsCustomer;
// ---------------------------------------------------------------------------
// exportReviewsForCompany (CSV data)
// ---------------------------------------------------------------------------
const exportReviewsForCompany = async (companyId) => {
    try {
        const reviews = await reviewsRepo.listAdminReviews(companyId);
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Reviews for export', reviews);
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('review', 'export', error);
    }
};
exports.exportReviewsForCompany = exportReviewsForCompany;
// ---------------------------------------------------------------------------
// getReviewSummaryForCompany (public)
// ---------------------------------------------------------------------------
const getReviewSummaryForCompany = async (companyId) => {
    try {
        const metrics = await reviewsRepo.getReviewMetrics(companyId);
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Review summary', {
            average: metrics.average,
            count: metrics.count,
            distribution: metrics.distribution,
            subRatings: metrics.subRatings,
        });
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('review', 'get summary', error);
    }
};
exports.getReviewSummaryForCompany = getReviewSummaryForCompany;
