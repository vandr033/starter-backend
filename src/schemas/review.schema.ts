import { z } from 'zod';

const ratingField = z.number().int().min(1).max(5);
const optionalRating = z.number().int().min(1).max(5).optional();

export const createReviewSchema = z.object({
  booking_id: z.number().int().positive(),
  rating: ratingField,
  comment: z.string().max(2000).optional(),
  rating_service_quality: optionalRating,
  rating_staff_attention: optionalRating,
  rating_punctuality: optionalRating,
  rating_cleanliness: optionalRating,
}).strict();

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const listCompanyReviewsSchema = z.object({
  company_id: z.coerce.number().int().positive(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
}).strict();

export type ListCompanyReviewsInput = z.infer<typeof listCompanyReviewsSchema>;
