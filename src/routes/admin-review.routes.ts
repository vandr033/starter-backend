import { Router, Request, Response } from 'express';
import { requireAuth, requireCompanyRole } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';
import * as ReviewService from '../services/review.service';
import type { AdminReviewFilters } from '../repositories/reviews.repo';
import { isFeatureEnabledForCompany, buildFeatureNotAvailableMessage } from '../services/plan-enforcement.service';
import { getFeatureRequiredPlan } from '../config/plan-capabilities';

const router = Router();

const allStaffRoles = [CompanyUserRole.OWNER, CompanyUserRole.ADMIN, CompanyUserRole.STAFF];

// GET /api/admin/reviews - All reviews for the company (with pagination, search, filters, role scoping)
router.get(
  '/',
  requireAuth,
  requireCompanyRole(allStaffRoles),
  async (req: Request, res: Response) => {
    const companyId = (req as any).companyID as number;
    if (!companyId) return res.status(400).json({ error: 'Company not resolved' });

    // Plan gating: REVIEW_MANAGEMENT required
    const allowed = await isFeatureEnabledForCompany(companyId, 'REVIEW_MANAGEMENT');
    if (!allowed) {
      return res.status(403).json({ error: buildFeatureNotAvailableMessage(getFeatureRequiredPlan('REVIEW_MANAGEMENT')) });
    }

    const companyUser = (req as any).companyUser;
    const role = companyUser?.role;

    const filters: AdminReviewFilters = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      search: req.query.search as string | undefined,
      rating: req.query.rating ? parseInt(req.query.rating as string, 10) : undefined,
      staffId: req.query.staff_id ? parseInt(req.query.staff_id as string, 10) : undefined,
      serviceId: req.query.service_id ? parseInt(req.query.service_id as string, 10) : undefined,
      hasComment: req.query.has_comment !== undefined
        ? req.query.has_comment === 'true'
        : undefined,
      dateFrom: req.query.date_from as string | undefined,
      dateTo: req.query.date_to as string | undefined,
    };

    // If staff role, scope to only their own reviews
    if (role === 'STAFF') {
      const staffProfile = await ReviewService.findStaffProfileByUserId(companyUser.user_id, companyId);
      if (!staffProfile) return res.status(403).json({ error: 'Staff profile not found' });
      filters.staffId = staffProfile.id;
    }

    const result = await ReviewService.listAdminReviewsFiltered(companyId, filters);
    return res.status(result.code).json(result);
  },
);

// GET /api/admin/reviews/metrics - Extended review metrics/dashboard for the company
router.get(
  '/metrics',
  requireAuth,
  requireCompanyRole(allStaffRoles),
  async (req: Request, res: Response) => {
    const companyId = (req as any).companyID as number;
    if (!companyId) return res.status(400).json({ error: 'Company not resolved' });

    // Plan gating: REVIEW_ANALYTICS required
    const allowed = await isFeatureEnabledForCompany(companyId, 'REVIEW_ANALYTICS');
    if (!allowed) {
      return res.status(403).json({ error: buildFeatureNotAvailableMessage(getFeatureRequiredPlan('REVIEW_ANALYTICS')) });
    }

    const result = await ReviewService.getExtendedMetrics(companyId);
    return res.status(result.code).json(result);
  },
);

// GET /api/admin/reviews/staff/:staffId - Reviews for a specific staff member
router.get(
  '/staff/:staffId',
  requireAuth,
  requireCompanyRole(allStaffRoles),
  async (req: Request, res: Response) => {
    const companyId = (req as any).companyID as number;
    if (!companyId) return res.status(400).json({ error: 'Company not resolved' });

    const staffId = parseInt(req.params.staffId as string, 10);
    if (isNaN(staffId)) return res.status(400).json({ error: 'Invalid staff ID' });

    const result = await ReviewService.listStaffReviews(staffId, companyId);
    return res.status(result.code).json(result);
  },
);

export default router;
