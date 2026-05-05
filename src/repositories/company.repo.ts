import { BookingStatus } from '@prisma/client';
import { Prisma, prisma } from '../prisma/client';
import {
  buildMarketplaceVisibilityWhere,
  withMarketplaceVisibilityWhere,
} from './marketplace-visibility';

export const getAllCompanies = async (limit?: number) => {
  const companies = await prisma.company.findMany({
    where: buildMarketplaceVisibilityWhere(),
    take: limit ? limit : undefined,
  });
  return companies;
}

export const getFeaturedCompanies = async (limit: number = 8) => {
  // 1. Fetch active, non-deleted companies with basic info
  const companies = await prisma.company.findMany({
    where: buildMarketplaceVisibilityWhere(),
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      address: true,
      logo_url: true,
      home_hero_image_url: true,
      created_at: true,
      company_type: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  if (companies.length === 0) return [];

  // 2. Aggregate ratings per company
  const ratingAgg = await prisma.review.groupBy({
    by: ['company_id'],
    where: {
      company_id: { in: companies.map((c) => c.id) },
    },
    _avg: { rating: true },
    _count: { rating: true },
  });

  const ratingMap = new Map<number, { avg: number; count: number }>();
  for (const r of ratingAgg) {
    ratingMap.set(r.company_id, {
      avg: r._avg.rating ?? 0,
      count: r._count.rating,
    });
  }

  // 3. Sort: companies with ratings first (by avg desc), then by created_at desc
  const sorted = companies
    .map((c) => ({
      ...c,
      rating: ratingMap.get(c.id) ?? { avg: 0, count: 0 },
    }))
    .sort((a, b) => {
      // Companies with reviews come first
      if (a.rating.count > 0 && b.rating.count === 0) return -1;
      if (a.rating.count === 0 && b.rating.count > 0) return 1;
      // Both have reviews: sort by avg rating desc
      if (a.rating.count > 0 && b.rating.count > 0) {
        return b.rating.avg - a.rating.avg;
      }
      // Both have no reviews: sort by created_at desc
      return b.created_at.getTime() - a.created_at.getTime();
    })
    .slice(0, limit);

  return sorted;
}

export const getCompanyById = async (id: number) => {
  return await prisma.company.findUnique({
    where: { id: (id), is_active: true },
  });
};

export const getCompaniesByIds = async (ids: number[]) => {
  return await prisma.company.findMany({
    where: { id: { in: ids }, is_active: true },
  });
}

export const getMarketplaceDiscoverableCompaniesByIds = async (ids: number[]) => {
  return await prisma.company.findMany({
    where: withMarketplaceVisibilityWhere({
      id: { in: ids },
    }),
  });
}

export const getMarketplaceDiscoverableCompanies = async (limit?: number) => {
  return await prisma.company.findMany({
    where: buildMarketplaceVisibilityWhere(),
    take: limit ? limit : undefined,
  });
}

export const getCompanyBySlug = async (slug: string) => {
  return await prisma.company.findUnique({
    where: { slug, is_active: true },
    include: {
      hours: true,
    },
  });
};

export const getCompanyByPhone = async (phone: string) => {
  return await prisma.company.findFirst({
    where: { phone, is_active: true },
  });
};

export const createCompany = async (companyData: Prisma.CompanyCreateInput) => {
  return await prisma.company.create({
    data: companyData,
  });
}

export const updateCompany = async (id: number, companyData: Prisma.CompanyUpdateInput) => {
  return await prisma.company.update({
    where: { id: id },
    data: companyData,
  });
}

export const deleteCompany = async (id: number) => {
  return await prisma.company.update({
    where: { id: id, is_active: true },
    data: { deleted_at: new Date(), is_active: false },
  });
}

//select all cities, distinct
export const getCities = async (query: string) => {
  return await prisma.company.findMany({
    select: {
      city: true,
    },
    distinct: ['city'],
    where: withMarketplaceVisibilityWhere({
      city: {
        contains: query,
      },
    }),
  });
}

export const getTopFourCompanyTypesIds = async () => {

  //retrieve top four company types ids with most companies
  try {
    const topFourCompanyTypesIds = await prisma.company.groupBy({
      by: ['company_type_id'],
      where: buildMarketplaceVisibilityWhere(),
      _count: {
        company_type_id: true,
      },
      orderBy: {
        _count: {
          company_type_id: 'desc',
        },
      },
      take: 4,
    });
    return topFourCompanyTypesIds;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function resolveSlotMinutesForGlobalType(
  globalServiceTypeId?: number,
): Promise<number> {
  if (globalServiceTypeId) {
    const agg = await prisma.service.aggregate({
      where: {
        global_type_id: globalServiceTypeId,
        is_active: true,
      },
      _min: {
        duration_minutes: true,
      },
    });

    const minDuration = agg._min.duration_minutes ?? 0;
    if (minDuration > 0) return minDuration;
  }

  // Fallback if no type or no valid durations
  return 60;
}

export const getCompanySearch = async (globalServiceTypeId?: number, location?: string, name?: string, date?: string, time?: string) => {
  // 1) Build requested time window if date/time provided
  //
  //    - Slot length is derived from services of this GlobalServiceType
  //    - This is approximate, but good enough for cross-company search
  let startAt: Date | undefined;
  let endAt: Date | undefined;

  if (date && time) {
    const slotMinutes = await resolveSlotMinutesForGlobalType(globalServiceTypeId);

    // NOTE: naive timezone handling; interpret in server TZ.
    // In a more advanced setup, you might convert based on user/company timezone.
    startAt = new Date(`${date}T${time}:00`);
    endAt = new Date(startAt.getTime() + slotMinutes * 60 * 1000);
  }

  const blockingBookingFilter =
    startAt && endAt
      ? {
          status: {
            in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
          },
          deleted_at: null,
          AND: [
            { start_at: { lt: endAt } },
            { end_at: { gt: startAt } },
          ],
        }
      : null;

  // 2) Build Company.where dynamically
  const where: Prisma.CompanyWhereInput = buildMarketplaceVisibilityWhere();

  // 2.a) Filter by city / "Location"
  if (location) {
    where.city = {
      equals: location,
    };
  }

  // 2.b) Filter by company name (partial)
  if (name) {
    where.name = {
      contains: name,
    };
  }

  // 2.c) Require company to have active services.
  //
  //      If globalServiceTypeId is provided:
  //        - must have at least one Service with that global_type_id.
  //      Else:
  //        - any active service is fine.
  if (globalServiceTypeId) {
    where.services = {
      some: {
        is_active: true,
        global_type_id: globalServiceTypeId,
      },
    };
  } else {
    where.services = {
      some: {
        is_active: true,
      },
    };
  }

  // 2.d) Staff availability + skill via Company.staff_services.
  //
  // We require at least one StaffService that:
  // - is_active = true
  // - if globalServiceTypeId exists:
  //     its Service has that global_type_id
  // - staff.is_bookable = true
  // - AND (if date/time given) staff has NO bookings overlapping [startAt, endAt)
  if (globalServiceTypeId) {
    where.staff_services = {
      some: {
        is_active: true,
        service: {
          is_active: true,
          global_type_id: globalServiceTypeId,
        },
        staff: {
          is_bookable: true,
          ...(blockingBookingFilter
            ? {
              bookings: { none: blockingBookingFilter },
              secondary_bookings: { none: blockingBookingFilter },
            }
            : {}),
        },
      },
    };
  } else {
    // No specific GlobalServiceType:
    // - any active StaffService
    // - staff is bookable
    // - and (optionally) free in that time window
    where.staff_services = {
      some: {
        is_active: true,
        staff: {
          is_bookable: true,
          ...(blockingBookingFilter
            ? {
              bookings: { none: blockingBookingFilter },
              secondary_bookings: { none: blockingBookingFilter },
            }
            : {}),
        },
      },
    };
  }

  // 3) Fetch companies that match filters + availability.
  //
  // Include:
  // - company_type → for "Category" in the search results
  // - services     → one representative service to show "Service - Price"
  const companies = await prisma.company.findMany({
    where,
    include: {
      company_type: true,
      services: {
        where: {
          is_active: true,
          ...(globalServiceTypeId
            ? { global_type_id: globalServiceTypeId }
            : {}),
        },
        orderBy: {
          price_cents: 'asc',
        },
        take: 1, // just one service to display in the card
      },
    },
  });

  // Early exit if nothing found
  if (companies.length === 0) {
    return [];
  }

  // 4) Aggregate ratings per company (average stars + count)
  const ratingAgg = await prisma.review.groupBy({
    by: ['company_id'],
    where: {
      company_id: {
        in: companies.map((c) => c.id),
      },
    },
    _avg: {
      rating: true,
    },
    _count: {
      rating: true,
    },
  });

  // Build a lookup map: company_id → { avg, count }
  const ratingMap = new Map<number, { avg: number; count: number }>();
  for (const r of ratingAgg) {
    ratingMap.set(r.company_id, {
      avg: r._avg.rating ?? 0,
      count: r._count.rating,
    });
  }

  // 5) Map DB models → your search API response shape:
  //
  // - Category          (CompanyType.name)
  // - name              (Company.name)
  // - city              (Company.city)
  // - lat / lng         (Company.latitude / longitude)
  // - totalStars        (avg rating or 0 if none)
  // - numberOfReviews   (count of ratings)
  // - Service - Price   (first included service)
  // - slug              (Company.slug)
  const result = companies.map((c) => {
    const ratingInfo = ratingMap.get(c.id);
    const service = c.services[0];

    return {
      category: c.company_type?.name ?? null,
      name: c.name,
      city: c.city,
      lat: c.latitude,
      lng: c.longitude,
      totalStars: ratingInfo?.avg ?? 0,
      numberOfReviews: ratingInfo?.count ?? 0,
      serviceName: service?.name ?? null,
      servicePriceCents: service?.price_cents ?? null,
      slug: c.slug,
      logo: c.logo_url || c.home_hero_image_url || null,
    };
  });

  return result;

}

export const getCompanyPublicPageBySlug = async (slug: string) => {
  return await prisma.company.findFirst({
    where: {
      slug,
      deleted_at: null,
    },
    include: {
      config_messages: {
        where: { key: 'default_language' },
        select: {
          key: true,
          value: true,
        },
        take: 1,
      },
      categories: {
        where: { is_active: true, deleted_at: null },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          position: true,
        },
      },
      services: {
        where: { is_active: true, deleted_at: null },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          category_id: true,
          name: true,
          description: true,
          price_cents: true,
          promo_price_cents: true,
          promo_starts_at: true,
          promo_ends_at: true,
          promo_label: true,
          duration_minutes: true,
          is_multi_session: true,
          session_count: true,
          session_duration_minutes: true,
          position: true,
          required_resources: {
            select: { staff_profile_id: true },
          },
        },
      },
      staff_profiles: {
        where: { is_bookable: true, deleted_at: null },
        select: {
          id: true,
          display_name: true,
          image_url: true,
          resource_type: true,
          staff_services: {
            select: {
              service_id: true,
              service: {
                select: {
                  id: true,
                  name: true,
                  category: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      company_settings: true,
      theme_config: true,
      hours: true,
      reviews: {
        select: {
          rating: true,
        },
      },
    },
  });
};

/**
 * Get company hours for a specific day of week
 */
export const getCompanyHoursForDay = async (companyId: number, dayOfWeek: number) => {
  return await prisma.hours.findFirst({
    where: {
      company_id: companyId,
      day_of_week: dayOfWeek,
    },
  });
};

/**
 * Get all hours for a specific day of week (supports multiple time windows)
 */
export const getAllHoursForDay = async (companyId: number, dayOfWeek: number) => {
  return await prisma.hours.findMany({
    where: {
      company_id: companyId,
      day_of_week: dayOfWeek,
    },
    orderBy: {
      open_time: 'asc',
    },
  });
};
