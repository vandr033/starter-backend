import { Router, Request, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middlewares/requireAuth';
import { validate } from '../middlewares/validate';
import { createReviewSchema, listCompanyReviewsSchema } from '../schemas/review.schema';
import * as ReviewService from '../services/review.service';

const router = Router();

// POST /api/review - Create a review (authenticated customer)
router.post(
  '/',
  requireAuth,
  validate(createReviewSchema),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.authUser?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const input = (req as any).validated;
    const result = await ReviewService.createReview(userId, input);
    return res.status(result.code).json(result);
  },
);

// GET /api/review/my - List current user's reviews
router.get('/my', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.authUser?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const result = await ReviewService.listCustomerReviews(userId);
  return res.status(result.code).json(result);
});

// GET /api/review/eligible - Bookings eligible for review
router.get('/eligible', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.authUser?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const result = await ReviewService.getEligibleBookingsPendingReview(userId);
  return res.status(result.code).json(result);
});

// DELETE /api/review/:reviewId - Delete own review
router.delete('/:reviewId', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.authUser?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const reviewId = parseInt(req.params.reviewId as string, 10);
  if (isNaN(reviewId)) return res.status(400).json({ error: 'Invalid review ID' });

  const result = await ReviewService.deleteReviewAsCustomer(reviewId, userId);
  return res.status(result.code).json(result);
});

// GET /api/review/company/:companyId - Public reviews for a company
router.get('/company/:companyId', async (req: Request, res: Response) => {
  const companyId = parseInt(req.params.companyId as string, 10);
  if (isNaN(companyId)) return res.status(400).json({ error: 'Invalid company ID' });

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));

  const result = await ReviewService.listCompanyPublicReviews(companyId, page, limit);
  return res.status(result.code).json(result);
});

// GET /api/review/company/:companyId/summary - Public review summary
router.get('/company/:companyId/summary', async (req: Request, res: Response) => {
  const companyId = parseInt(req.params.companyId as string, 10);
  if (isNaN(companyId)) return res.status(400).json({ error: 'Invalid company ID' });

  const result = await ReviewService.getReviewSummaryForCompany(companyId);
  return res.status(result.code).json(result);
});

// GET /api/review/check/:bookingId - Check if booking is eligible for review
router.get('/check/:bookingId', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.authUser?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const bookingId = parseInt(req.params.bookingId as string, 10);
  if (isNaN(bookingId)) return res.status(400).json({ error: 'Invalid booking ID' });

  const eligibility = await ReviewService.canUserReviewBooking(userId, bookingId);
  return res.status(200).json({ eligible: eligibility.eligible, reason: eligibility.reason });
});

export default router;
