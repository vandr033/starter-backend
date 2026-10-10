"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCompanyReviewsSchema = exports.createReviewSchema = void 0;
const zod_1 = require("zod");
const ratingField = zod_1.z.number().int().min(1).max(5);
const optionalRating = zod_1.z.number().int().min(1).max(5).optional();
exports.createReviewSchema = zod_1.z.object({
    booking_id: zod_1.z.number().int().positive(),
    rating: ratingField,
    comment: zod_1.z.string().max(2000).optional(),
    rating_service_quality: optionalRating,
    rating_staff_attention: optionalRating,
    rating_punctuality: optionalRating,
    rating_cleanliness: optionalRating,
}).strict();
exports.listCompanyReviewsSchema = zod_1.z.object({
    company_id: zod_1.z.coerce.number().int().positive(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(50).default(10),
}).strict();
