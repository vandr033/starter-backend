import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

export type BoundsFilter = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type MarketplaceSearchMode = 'service_now' | 'salon_name';

export interface MarketplaceCandidateQuery {
  serviceTypeId: number;
  city?: string;
  zone?: string;
  q?: string;
  searchMode: MarketplaceSearchMode;
  bounds?: BoundsFilter;
  applyPrimaryAreaFilters: boolean;
  take: number;
}

export type MarketplaceCompanyCandidate = {
  id: number;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  home_hero_image_url: string | null;
  logo_url: string | null;
  company_type: {
    name: string;
  } | null;
  services: Array<{
    id: number;
    name: string;
    price_cents: number;
    duration_minutes: number;
    global_type_id: number | null;
    category: {
      global_service_type_id: number | null;
    };
  }>;
};

function isMissingCategoryGlobalTypeColumnError(error: unknown): boolean {
  const maybe = error as { code?: string; meta?: { column?: unknown } };
  if (maybe?.code !== 'P2022') return false;
  const column = maybe.meta?.column;
  return typeof column === 'string' && column.includes('category.global_service_type_id');
}

function withTrimmedValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildPrimaryWhere(query: MarketplaceCandidateQuery): Prisma.CompanyWhereInput {
  const city = withTrimmedValue(query.city);
  const zone = withTrimmedValue(query.zone);
  const q = withTrimmedValue(query.q);

  const where: Prisma.CompanyWhereInput = {
    is_active: true,
    deleted_at: null,
  };

  if (query.applyPrimaryAreaFilters) {
    if (query.bounds) {
      where.latitude = { gte: query.bounds.minLat, lte: query.bounds.maxLat };
      where.longitude = { gte: query.bounds.minLng, lte: query.bounds.maxLng };
    } else {
      if (city) {
        where.city = { contains: city };
      }

      if (zone) {
        where.OR = [
          { state: { contains: zone } },
          { address: { contains: zone } },
          { city: { contains: zone } },
        ];
      }
    }
  }

  if (query.searchMode === 'salon_name') {
    if (q) {
      where.name = { contains: q };
    }
  } else if (q) {
    const qWhere: Prisma.CompanyWhereInput = {
      OR: [
        { name: { contains: q } },
        { city: { contains: q } },
        { state: { contains: q } },
        { address: { contains: q } },
      ],
    };

    const existingAnd = Array.isArray(where.AND)
      ? where.AND
      : where.AND
        ? [where.AND]
        : [];
    where.AND = [...existingAnd, qWhere];
  }

  return where;
}

function buildServiceFilterWithCategoryFallback(serviceTypeId: number): Prisma.ServiceWhereInput {
  return {
    is_active: true,
    deleted_at: null,
    category: {
      is_active: true,
      deleted_at: null,
    },
    OR: [
      { global_type_id: serviceTypeId },
      {
        global_type_id: null,
        category: {
          global_service_type_id: serviceTypeId,
        },
      },
    ],
  };
}

function buildServiceFilterWithoutCategoryFallback(serviceTypeId: number): Prisma.ServiceWhereInput {
  return {
    is_active: true,
    deleted_at: null,
    global_type_id: serviceTypeId,
  };
}

async function queryCandidates(
  where: Prisma.CompanyWhereInput,
  serviceWhere: Prisma.ServiceWhereInput,
  take: number,
): Promise<MarketplaceCompanyCandidate[]> {
  return prisma.company.findMany({
    where: {
      ...where,
      services: {
        some: serviceWhere,
      },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      state: true,
      address: true,
      latitude: true,
      longitude: true,
      home_hero_image_url: true,
      logo_url: true,
      company_type: {
        select: {
          name: true,
        },
      },
      services: {
        where: serviceWhere,
        select: {
          id: true,
          name: true,
          price_cents: true,
          duration_minutes: true,
          global_type_id: true,
          category: {
            select: {
              global_service_type_id: true,
            },
          },
        },
        orderBy: [{ price_cents: 'asc' }, { duration_minutes: 'asc' }, { id: 'asc' }],
      },
    },
    take,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
  });
}

export async function getMarketplaceCandidates(
  query: MarketplaceCandidateQuery,
): Promise<MarketplaceCompanyCandidate[]> {
  const baseWhere = buildPrimaryWhere(query);

  try {
    return await queryCandidates(
      baseWhere,
      buildServiceFilterWithCategoryFallback(query.serviceTypeId),
      query.take,
    );
  } catch (error) {
    if (!isMissingCategoryGlobalTypeColumnError(error)) {
      throw error;
    }

    return queryCandidates(
      baseWhere,
      buildServiceFilterWithoutCategoryFallback(query.serviceTypeId),
      query.take,
    );
  }
}

export async function getCompanyRatings(companyIds: number[]) {
  if (companyIds.length === 0) return new Map<number, { rating: number; reviewCount: number }>();

  const aggregated = await prisma.review.groupBy({
    by: ['company_id'],
    where: {
      company_id: { in: companyIds },
    },
    _avg: {
      rating: true,
    },
    _count: {
      rating: true,
    },
  });

  const map = new Map<number, { rating: number; reviewCount: number }>();

  for (const item of aggregated) {
    map.set(item.company_id, {
      rating: item._avg.rating ?? 0,
      reviewCount: item._count.rating ?? 0,
    });
  }

  return map;
}
