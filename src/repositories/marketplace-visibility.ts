import { Prisma } from '@prisma/client';

/**
 * Canonical marketplace discovery visibility filter.
 * A shop must be active, not deleted, visible in marketplace, and not expired.
 */
export function buildMarketplaceVisibilityWhere(now: Date = new Date()): Prisma.CompanyWhereInput {
  return {
    is_active: true,
    deleted_at: null,
    isMarketplaceVisible: true,
    availableUntil: { gte: now },
  };
}

/**
 * Combine the marketplace visibility filter with additional company conditions.
 */
export function withMarketplaceVisibilityWhere(
  where: Prisma.CompanyWhereInput,
  now: Date = new Date(),
): Prisma.CompanyWhereInput {
  return {
    AND: [buildMarketplaceVisibilityWhere(now), where],
  };
}
