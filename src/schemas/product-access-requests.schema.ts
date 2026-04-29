import {
    ProductAccessRequestSource,
    ProductCode,
    ProductTierCode,
    ProductCapabilityCode,
} from '@prisma/client';
import { z } from 'zod';

export const createProductAccessRequestSchema = z.object({
    productCode: z.nativeEnum(ProductCode),
    tierCode: z.nativeEnum(ProductTierCode),
    capability: z.nativeEnum(ProductCapabilityCode).optional(),
    message: z.string().trim().max(500).optional(),
    source: z.nativeEnum(ProductAccessRequestSource),
});

export const resolveProductAccessRequestSchema = z.object({
    internalNote: z.string().trim().max(500).optional(),
});
