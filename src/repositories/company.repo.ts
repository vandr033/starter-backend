import { BookingStatus } from '@prisma/client';
import {Prisma, prisma } from '../prisma/client';

export const getAllCompanies =async(limit?:number)=>{
  const companies = await prisma.company.findMany({
    where: { is_active: true },
    take: limit? limit:undefined,
  });
  return companies;
}

export const getCompanyById = async (id: number) => {
  return await prisma.company.findUnique({
    where: { id:  (id), is_active: true },
  });
};

export const getCompaniesByIds = async (ids: number[]) => {
  return await prisma.company.findMany({
    where: { id: { in: ids }, is_active: true },
  });
}

export const getCompanyBySlug = async (slug: string) => {
  return await prisma.company.findUnique({
    where: { slug, is_active: true },
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
    where: {
      city: {
        contains: query,
      },
    },
  });
}

export const getTopFourCompanyTypesIds = async () => {

  //retrieve top four company types ids with most companies
    try{
        const topFourCompanyTypesIds = await prisma.company.groupBy({
            by: ['company_type_id'],
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
    } catch(error){
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

  // 2) Build Company.where dynamically
  const where: Prisma.CompanyWhereInput = {
    is_active: true,
  };

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
          ...(startAt && endAt
            ? {
                bookings: {
                  none: {
                    status: {
                      in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
                    },
                    AND: [
                      { start_at: { lt: endAt } },  // booking starts before requested slot ends
                      { end_at: { gt: startAt } },  // booking ends after requested slot starts
                    ],
                  },
                },
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
          ...(startAt && endAt
            ? {
                bookings: {
                  none: {
                    status: {
                      in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
                    },
                    AND: [
                      { start_at: { lt: endAt } },
                      { end_at: { gt: startAt } },
                    ],
                  },
                },
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
    };
  });

  return result;

}