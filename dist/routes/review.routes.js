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
const express_1 = require("express");
const requireAuth_1 = require("../middlewares/requireAuth");
const validate_1 = require("../middlewares/validate");
const review_schema_1 = require("../schemas/review.schema");
const ReviewService = __importStar(require("../services/review.service"));
const router = (0, express_1.Router)();
// POST /api/review - Create a review (authenticated customer)
router.post('/', requireAuth_1.requireAuth, (0, validate_1.validate)(review_schema_1.createReviewSchema), async (req, res) => {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    const input = req.validated;
    const result = await ReviewService.createReview(userId, input);
    return res.status(result.code).json(result);
});
// GET /api/review/my - List current user's reviews
router.get('/my', requireAuth_1.requireAuth, async (req, res) => {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    const result = await ReviewService.listCustomerReviews(userId);
    return res.status(result.code).json(result);
});
// GET /api/review/eligible - Bookings eligible for review
router.get('/eligible', requireAuth_1.requireAuth, async (req, res) => {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    const result = await ReviewService.getEligibleBookingsPendingReview(userId);
    return res.status(result.code).json(result);
});
// DELETE /api/review/:reviewId - Delete own review
router.delete('/:reviewId', requireAuth_1.requireAuth, async (req, res) => {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    const reviewId = parseInt(req.params.reviewId, 10);
    if (isNaN(reviewId))
        return res.status(400).json({ error: 'Invalid review ID' });
    const result = await ReviewService.deleteReviewAsCustomer(reviewId, userId);
    return res.status(result.code).json(result);
});
// GET /api/review/company/:companyId - Public reviews for a company
router.get('/company/:companyId', async (req, res) => {
    const companyId = parseInt(req.params.companyId, 10);
    if (isNaN(companyId))
        return res.status(400).json({ error: 'Invalid company ID' });
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const result = await ReviewService.listCompanyPublicReviews(companyId, page, limit);
    return res.status(result.code).json(result);
});
// GET /api/review/company/:companyId/summary - Public review summary
router.get('/company/:companyId/summary', async (req, res) => {
    const companyId = parseInt(req.params.companyId, 10);
    if (isNaN(companyId))
        return res.status(400).json({ error: 'Invalid company ID' });
    const result = await ReviewService.getReviewSummaryForCompany(companyId);
    return res.status(result.code).json(result);
});
// GET /api/review/check/:bookingId - Check if booking is eligible for review
router.get('/check/:bookingId', requireAuth_1.requireAuth, async (req, res) => {
    const authReq = req;
    const userId = authReq.authUser?.id;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    const bookingId = parseInt(req.params.bookingId, 10);
    if (isNaN(bookingId))
        return res.status(400).json({ error: 'Invalid booking ID' });
    const eligibility = await ReviewService.canUserReviewBooking(userId, bookingId);
    return res.status(200).json({ eligible: eligibility.eligible, reason: eligibility.reason });
});
exports.default = router;
