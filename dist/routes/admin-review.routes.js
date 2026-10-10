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
const client_1 = require("@prisma/client");
const ReviewService = __importStar(require("../services/review.service"));
const plan_enforcement_service_1 = require("../services/plan-enforcement.service");
const plan_capabilities_1 = require("../config/plan-capabilities");
const router = (0, express_1.Router)();
const allStaffRoles = [client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN, client_1.CompanyUserRole.STAFF];
// GET /api/admin/reviews - All reviews for the company (with pagination, search, filters, role scoping)
router.get('/', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), async (req, res) => {
    const companyId = req.companyID;
    if (!companyId)
        return res.status(400).json({ error: 'Company not resolved' });
    // Plan gating: REVIEW_MANAGEMENT required
    const allowed = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(companyId, 'REVIEW_MANAGEMENT');
    if (!allowed) {
        return res.status(403).json({ error: (0, plan_enforcement_service_1.buildFeatureNotAvailableMessage)((0, plan_capabilities_1.getFeatureRequiredPlan)('REVIEW_MANAGEMENT')) });
    }
    const companyUser = req.companyUser;
    const role = companyUser?.role;
    const filters = {
        page: req.query.page ? parseInt(req.query.page, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
        search: req.query.search,
        rating: req.query.rating ? parseInt(req.query.rating, 10) : undefined,
        staffId: req.query.staff_id ? parseInt(req.query.staff_id, 10) : undefined,
        serviceId: req.query.service_id ? parseInt(req.query.service_id, 10) : undefined,
        hasComment: req.query.has_comment !== undefined
            ? req.query.has_comment === 'true'
            : undefined,
        dateFrom: req.query.date_from,
        dateTo: req.query.date_to,
    };
    // If staff role, scope to only their own reviews
    if (role === 'STAFF') {
        const staffProfile = await ReviewService.findStaffProfileByUserId(companyUser.user_id, companyId);
        if (!staffProfile)
            return res.status(403).json({ error: 'Staff profile not found' });
        filters.staffId = staffProfile.id;
    }
    const result = await ReviewService.listAdminReviewsFiltered(companyId, filters);
    return res.status(result.code).json(result);
});
// GET /api/admin/reviews/metrics - Extended review metrics/dashboard for the company
router.get('/metrics', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), async (req, res) => {
    const companyId = req.companyID;
    if (!companyId)
        return res.status(400).json({ error: 'Company not resolved' });
    // Plan gating: REVIEW_ANALYTICS required
    const allowed = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(companyId, 'REVIEW_ANALYTICS');
    if (!allowed) {
        return res.status(403).json({ error: (0, plan_enforcement_service_1.buildFeatureNotAvailableMessage)((0, plan_capabilities_1.getFeatureRequiredPlan)('REVIEW_ANALYTICS')) });
    }
    const result = await ReviewService.getExtendedMetrics(companyId);
    return res.status(result.code).json(result);
});
// DELETE /api/admin/reviews/:reviewId - Delete a review (admin moderation)
router.delete('/:reviewId', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)([client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN]), async (req, res) => {
    const companyId = req.companyID;
    if (!companyId)
        return res.status(400).json({ error: 'Company not resolved' });
    const allowed = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(companyId, 'REVIEW_MANAGEMENT');
    if (!allowed) {
        return res.status(403).json({ error: (0, plan_enforcement_service_1.buildFeatureNotAvailableMessage)((0, plan_capabilities_1.getFeatureRequiredPlan)('REVIEW_MANAGEMENT')) });
    }
    const reviewId = parseInt(req.params.reviewId, 10);
    if (isNaN(reviewId))
        return res.status(400).json({ error: 'Invalid review ID' });
    const result = await ReviewService.deleteReviewAsAdmin(reviewId, companyId);
    return res.status(result.code).json(result);
});
// GET /api/admin/reviews/export - Export all reviews as JSON (for CSV generation on frontend)
router.get('/export', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)([client_1.CompanyUserRole.OWNER, client_1.CompanyUserRole.ADMIN]), async (req, res) => {
    const companyId = req.companyID;
    if (!companyId)
        return res.status(400).json({ error: 'Company not resolved' });
    const allowed = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(companyId, 'REVIEW_MANAGEMENT');
    if (!allowed) {
        return res.status(403).json({ error: (0, plan_enforcement_service_1.buildFeatureNotAvailableMessage)((0, plan_capabilities_1.getFeatureRequiredPlan)('REVIEW_MANAGEMENT')) });
    }
    const result = await ReviewService.exportReviewsForCompany(companyId);
    return res.status(result.code).json(result);
});
// GET /api/admin/reviews/staff/:staffId - Reviews for a specific staff member
router.get('/staff/:staffId', requireAuth_1.requireAuth, (0, requireAuth_1.requireCompanyRole)(allStaffRoles), async (req, res) => {
    const companyId = req.companyID;
    if (!companyId)
        return res.status(400).json({ error: 'Company not resolved' });
    const staffId = parseInt(req.params.staffId, 10);
    if (isNaN(staffId))
        return res.status(400).json({ error: 'Invalid staff ID' });
    const result = await ReviewService.listStaffReviews(staffId, companyId);
    return res.status(result.code).json(result);
});
exports.default = router;
