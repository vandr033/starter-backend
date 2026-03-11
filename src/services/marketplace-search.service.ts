import { MensajeApi } from '../types/MensajeApi';
import * as BookingService from './booking.service';
import * as MarketplaceRepo from '../repositories/marketplace.repo';
import * as MarketplaceAnalyticsService from './marketplace-analytics.service';
import {
  buildWhyThisResult,
  toMatchClassification,
  toMatchLabel,
  type MarketplaceMatchClassification,
  type MarketplaceMatchType,
} from '../utils/marketplaceMatch';

const PRIMARY_CANDIDATE_EVALUATION_CAP = 60;
const SIMILAR_CANDIDATE_EVALUATION_CAP = 30;
const FETCH_CANDIDATE_LIMIT = 200;
const EVALUATION_CONCURRENCY = 6;

type SortOption = 'best_match' | 'earliest' | 'nearest' | 'rating' | 'price';
type MatchType = MarketplaceMatchType;

interface SearchMarketplaceParams {
  serviceTypeId: number;
  city?: string;
  zone?: string;
  date: string;
  time?: string;
  bounds?: MarketplaceRepo.BoundsFilter;
  sort: SortOption;
  page: number;
  limit: number;
  searchMode: MarketplaceRepo.MarketplaceSearchMode;
  q?: string;
  includeSimilar: boolean;
  debug: boolean;
}

interface TimeSlot {
  time: string;
  staff_id: number;
}

interface EvaluatedCandidate {
  companyId: number;
  slug: string;
  name: string;
  businessType: string | null;
  zoneOrArea: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  thumbnailImage: string | null;
  serviceId: number;
  serviceName: string;
  globalServiceTypeId: number;
  priceFrom: number;
  matchedSlotTime: string;
  matchedSlotDate: string;
  matchType: MatchType;
  matchDeltaMinutes: number | null;
  whyThisResult: string;
  selectedStaffId: number | null;
  availableStaffIds: number[];
  availabilityDensity: number;
  earliestSlotTime: string;
  distanceKm: number | null;
  fromRelaxedArea: boolean;
  rating: number;
  reviewCount: number;
  score: number;
  debugComponents?: {
    availabilityQuality: number;
    timeOrDensity: number;
    distance: number;
    rating: number;
    price: number;
  };
}

function parseTimeToMinutes(time: string): number | null {
  if (!time) return null;
  const normalized = time.trim();
  const match24 = normalized.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (match24) {
    const hours = Number(match24[1]);
    const minutes = Number(match24[2]);
    return hours * 60 + minutes;
  }
  const match12 = normalized.match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s*([AaPp][Mm])$/);
  if (match12) {
    const rawHour = Number(match12[1]);
    const minutes = Number(match12[2]);
    const meridiem = match12[3].toUpperCase();
    let hours = rawHour % 12;
    if (meridiem === 'PM') hours += 12;
    return hours * 60 + minutes;
  }
  return null;
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
  return results;
}

function uniqueSortedTimes(slots: TimeSlot[]): string[] {
  return [...new Set(slots.map((slot) => slot.time))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function chooseRandomStaffId(staffIds: number[]): number | null {
  if (staffIds.length === 0) return null;
  const idx = Math.floor(Math.random() * staffIds.length);
  return staffIds[idx] ?? null;
}

function toMatchType(deltaMinutes: number): MatchType {
  if (deltaMinutes <= 30) return 'exact';
  if (deltaMinutes <= 120) return 'flexible';
  return 'similar';
}

function buildDistanceKm(
  center: { lat: number; lng: number } | null,
  latitude: number | null,
  longitude: number | null,
): number | null {
  if (!center || latitude == null || longitude == null) return null;
  return haversineDistanceKm(center.lat, center.lng, latitude, longitude);
}

async function evaluateCompany(
  company: MarketplaceRepo.MarketplaceCompanyCandidate,
  params: SearchMarketplaceParams,
  requestedMinutes: number | null,
  referenceCenter: { lat: number; lng: number } | null,
  forceSimilarByArea: boolean,
): Promise<EvaluatedCandidate | null> {
  const matchingServices = company.services;
  if (matchingServices.length === 0) return null;

  type ServiceChoice = {
    serviceId: number;
    serviceName: string;
    globalServiceTypeId: number;
    priceFrom: number;
    matchedSlotTime: string;
    matchType: MatchType;
    matchDeltaMinutes: number | null;
    availableStaffIds: number[];
    availabilityDensity: number;
    earliestSlotTime: string;
    whyThisResult: string;
  };

  let bestChoice: ServiceChoice | null = null;

  for (const service of matchingServices) {
    const slotResponse = await BookingService.getAvailableSlots({
      company_id: company.id,
      service_ids: [service.id],
      date: params.date,
    });

    if (slotResponse.error || !Array.isArray(slotResponse.data)) {
      continue;
    }

    const slots = (slotResponse.data as TimeSlot[]).filter((slot) => typeof slot.time === 'string');
    if (slots.length === 0) continue;

    const times = uniqueSortedTimes(slots);
    if (times.length === 0) continue;

    const earliestSlotTime = times[0];
    const availabilityDensity = times.length;

    if (requestedMinutes == null) {
      const staffIds = [...new Set(slots.filter((slot) => slot.time === earliestSlotTime).map((slot) => slot.staff_id))];

      const candidateChoice: ServiceChoice = {
        serviceId: service.id,
        serviceName: service.name,
        globalServiceTypeId: service.global_type_id ?? params.serviceTypeId,
        priceFrom: service.price_cents,
        matchedSlotTime: earliestSlotTime,
        matchType: 'flexible',
        matchDeltaMinutes: null,
        availableStaffIds: staffIds,
        availabilityDensity,
        earliestSlotTime,
        whyThisResult: buildWhyThisResult({
          matchType: 'flexible',
          slotTime: earliestSlotTime,
          requestedTime: params.time,
          matchDeltaMinutes: null,
          noTimeRequested: true,
          fromRelaxedArea: false,
          rating: 0,
          reviewCount: 0,
        }),
      };

      if (!bestChoice) {
        bestChoice = candidateChoice;
      } else {
        if (candidateChoice.availabilityDensity > bestChoice.availabilityDensity) {
          bestChoice = candidateChoice;
        } else if (
          candidateChoice.availabilityDensity === bestChoice.availabilityDensity &&
          candidateChoice.matchedSlotTime < bestChoice.matchedSlotTime
        ) {
          bestChoice = candidateChoice;
        } else if (
          candidateChoice.availabilityDensity === bestChoice.availabilityDensity &&
          candidateChoice.matchedSlotTime === bestChoice.matchedSlotTime &&
          candidateChoice.priceFrom < bestChoice.priceFrom
        ) {
          bestChoice = candidateChoice;
        }
      }

      continue;
    }

    let bestTimeForService = times[0];
    let bestDelta = Number.MAX_SAFE_INTEGER;

    for (const time of times) {
      const slotMinutes = parseTimeToMinutes(time);
      if (slotMinutes == null || requestedMinutes == null) {
        continue;
      }
      const delta = Math.abs(slotMinutes - requestedMinutes);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestTimeForService = time;
      }
    }

    const inferredMatchType = toMatchType(bestDelta);
    const normalizedMatchType: MatchType = forceSimilarByArea ? 'similar' : inferredMatchType;
    const staffIds = [...new Set(slots.filter((slot) => slot.time === bestTimeForService).map((slot) => slot.staff_id))];

    const candidateChoice: ServiceChoice = {
      serviceId: service.id,
      serviceName: service.name,
      globalServiceTypeId: service.global_type_id ?? params.serviceTypeId,
      priceFrom: service.price_cents,
      matchedSlotTime: bestTimeForService,
      matchType: normalizedMatchType,
      matchDeltaMinutes: bestDelta,
      availableStaffIds: staffIds,
      availabilityDensity,
      earliestSlotTime,
      whyThisResult: buildWhyThisResult({
        matchType: normalizedMatchType,
        slotTime: bestTimeForService,
        requestedTime: params.time,
        matchDeltaMinutes: bestDelta,
        noTimeRequested: false,
        fromRelaxedArea: forceSimilarByArea,
        rating: 0,
        reviewCount: 0,
      }),
    };

    if (!bestChoice) {
      bestChoice = candidateChoice;
      continue;
    }

    const rank = (type: MatchType) => (type === 'exact' ? 0 : type === 'flexible' ? 1 : 2);

    const candidateRank = rank(candidateChoice.matchType);
    const currentRank = rank(bestChoice.matchType);

    if (candidateRank < currentRank) {
      bestChoice = candidateChoice;
      continue;
    }

    if (candidateRank === currentRank) {
      const candidateDelta = candidateChoice.matchDeltaMinutes ?? Number.MAX_SAFE_INTEGER;
      const currentDelta = bestChoice.matchDeltaMinutes ?? Number.MAX_SAFE_INTEGER;

      if (candidateDelta < currentDelta) {
        bestChoice = candidateChoice;
      } else if (candidateDelta === currentDelta && candidateChoice.priceFrom < bestChoice.priceFrom) {
        bestChoice = candidateChoice;
      }
    }
  }

  if (!bestChoice) return null;

  const selectedStaffId = chooseRandomStaffId(bestChoice.availableStaffIds);

  return {
    companyId: company.id,
    slug: company.slug,
    name: company.name,
    businessType: company.company_type?.name ?? null,
    zoneOrArea: company.state ?? company.address ?? null,
    city: company.city ?? null,
    latitude: company.latitude,
    longitude: company.longitude,
    thumbnailImage: company.home_hero_image_url || company.logo_url || null,
    serviceId: bestChoice.serviceId,
    serviceName: bestChoice.serviceName,
    globalServiceTypeId: bestChoice.globalServiceTypeId,
    priceFrom: bestChoice.priceFrom,
    matchedSlotTime: bestChoice.matchedSlotTime,
    matchedSlotDate: params.date,
    matchType: bestChoice.matchType,
    matchDeltaMinutes: bestChoice.matchDeltaMinutes,
    whyThisResult: bestChoice.whyThisResult,
    selectedStaffId,
    availableStaffIds: bestChoice.availableStaffIds,
    availabilityDensity: bestChoice.availabilityDensity,
    earliestSlotTime: bestChoice.earliestSlotTime,
    distanceKm: buildDistanceKm(referenceCenter, company.latitude, company.longitude),
    fromRelaxedArea: forceSimilarByArea,
    rating: 0,
    reviewCount: 0,
    score: 0,
  };
}

function scoreAndDecorate(
  items: EvaluatedCandidate[],
  hasRequestedTime: boolean,
  hasReferenceCenter: boolean,
  debug: boolean,
): EvaluatedCandidate[] {
  if (items.length === 0) return [];

  const maxDensity = Math.max(...items.map((item) => item.availabilityDensity), 1);

  const priced = items.filter((item) => Number.isFinite(item.priceFrom));
  const minPrice = priced.length ? Math.min(...priced.map((item) => item.priceFrom)) : 0;
  const maxPrice = priced.length ? Math.max(...priced.map((item) => item.priceFrom)) : 0;

  return items.map((item) => {
    const availabilityQuality =
      item.matchType === 'exact' ? 1 : item.matchType === 'flexible' ? 0.72 : 0.38;

    const timeOrDensity = hasRequestedTime
      ? Math.max(0, 1 - Math.min(item.matchDeltaMinutes ?? 240, 240) / 240)
      : Math.max(0, Math.min(1, item.availabilityDensity / maxDensity));

    const distance = hasReferenceCenter
      ? item.distanceKm == null
        ? 0.35
        : Math.max(0, 1 - Math.min(item.distanceKm, 30) / 30)
      : 0.5;

    const ratingBase = Math.max(0, Math.min(1, item.rating / 5));
    const reviewConfidence = Math.max(0, Math.min(1, Math.log10(item.reviewCount + 1) / 2));
    const rating = ratingBase * 0.7 + reviewConfidence * 0.3;

    let price = 0.5;
    if (maxPrice > minPrice) {
      price = Math.max(0, 1 - (item.priceFrom - minPrice) / (maxPrice - minPrice));
    } else if (maxPrice === minPrice && maxPrice > 0) {
      price = 1;
    }

    const score =
      availabilityQuality * 0.4 +
      timeOrDensity * 0.25 +
      distance * 0.15 +
      rating * 0.15 +
      price * 0.05;

    return {
      ...item,
      score,
      debugComponents: debug
        ? {
            availabilityQuality,
            timeOrDensity,
            distance,
            rating,
            price,
          }
        : undefined,
    };
  });
}

function sortCandidates(items: EvaluatedCandidate[], sort: SortOption): EvaluatedCandidate[] {
  const sorted = [...items];

  sorted.sort((a, b) => {
    if (sort === 'earliest') {
      if (a.matchedSlotTime !== b.matchedSlotTime) {
        return a.matchedSlotTime < b.matchedSlotTime ? -1 : 1;
      }
      return b.score - a.score;
    }

    if (sort === 'nearest') {
      const aDist = a.distanceKm == null ? Number.POSITIVE_INFINITY : a.distanceKm;
      const bDist = b.distanceKm == null ? Number.POSITIVE_INFINITY : b.distanceKm;
      if (aDist !== bDist) return aDist - bDist;
      return b.score - a.score;
    }

    if (sort === 'rating') {
      if (a.rating !== b.rating) return b.rating - a.rating;
      if (a.reviewCount !== b.reviewCount) return b.reviewCount - a.reviewCount;
      return b.score - a.score;
    }

    if (sort === 'price') {
      if (a.priceFrom !== b.priceFrom) return a.priceFrom - b.priceFrom;
      return b.score - a.score;
    }

    return b.score - a.score;
  });

  return sorted;
}

function toApiResult(item: EvaluatedCandidate, serviceTypeId: number, requestedTime?: string, debug?: boolean) {
  const matchClassification: MarketplaceMatchClassification = toMatchClassification(item.matchType);
  const matchLabel = toMatchLabel(matchClassification, { hasRequestedTime: Boolean(requestedTime) });

  return {
    companyId: item.companyId,
    slug: item.slug,
    name: item.name,
    businessType: item.businessType,
    zoneOrArea: item.zoneOrArea,
    city: item.city,
    latitude: item.latitude,
    longitude: item.longitude,
    thumbnailImage: item.thumbnailImage,
    rating: item.rating,
    reviewCount: item.reviewCount,
    serviceId: item.serviceId,
    serviceName: item.serviceName,
    globalServiceTypeId: item.globalServiceTypeId || serviceTypeId,
    priceFrom: item.priceFrom,
    matchedSlotTime: item.matchedSlotTime,
    matchedSlotDate: item.matchedSlotDate,
    matchType: item.matchType,
    matchClassification,
    matchLabel,
    matchDeltaMinutes: item.matchDeltaMinutes,
    whyThisResult: item.whyThisResult,
    prefill: {
      source: 'marketplace',
      companyId: item.companyId,
      companySlug: item.slug,
      serviceTypeId,
      serviceId: item.serviceId,
      date: item.matchedSlotDate,
      requestedTime: requestedTime ?? null,
      selectedSlotTime: item.matchedSlotTime,
      staffId: item.selectedStaffId,
      bookingUrlParams: {
        source: 'marketplace',
        company_id: item.companyId,
        date: item.matchedSlotDate,
        time: item.matchedSlotTime,
        service_ids: `${item.serviceId}`,
        staff_id: item.selectedStaffId,
      },
    },
    ...(debug
      ? {
          score: item.score,
          scoreComponents: item.debugComponents,
          distanceKm: item.distanceKm,
          availabilityDensity: item.availabilityDensity,
        }
      : {}),
  };
}

function toMapPin(item: EvaluatedCandidate, isPrimaryMatch: boolean) {
  if (item.latitude == null || item.longitude == null) return null;

  return {
    companyId: item.companyId,
    lat: item.latitude,
    lng: item.longitude,
    title: item.name,
    slug: item.slug,
    matchType: item.matchType,
    isPrimaryMatch,
    popup: {
      name: item.name,
      businessType: item.businessType,
      rating: item.rating,
      reviewCount: item.reviewCount,
      matchedSlotTime: item.matchedSlotTime,
      priceFrom: item.priceFrom,
    },
  };
}

function dedupeByCompany(items: EvaluatedCandidate[]): EvaluatedCandidate[] {
  const map = new Map<number, EvaluatedCandidate>();

  for (const item of items) {
    const existing = map.get(item.companyId);
    if (!existing) {
      map.set(item.companyId, item);
      continue;
    }

    if (item.score > existing.score) {
      map.set(item.companyId, item);
    }
  }

  return [...map.values()];
}

export async function searchMarketplace(params: SearchMarketplaceParams): Promise<MensajeApi> {
  const startedAt = Date.now();
  const requestedMinutes = params.time ? parseTimeToMinutes(params.time) : null;
  const referenceCenter = params.bounds
    ? {
        lat: (params.bounds.minLat + params.bounds.maxLat) / 2,
        lng: (params.bounds.minLng + params.bounds.maxLng) / 2,
      }
    : null;

  try {
    const primaryCandidates = await MarketplaceRepo.getMarketplaceCandidates({
      serviceTypeId: params.serviceTypeId,
      city: params.city,
      zone: params.zone,
      q: params.q,
      searchMode: params.searchMode,
      bounds: params.bounds,
      applyPrimaryAreaFilters: true,
      take: FETCH_CANDIDATE_LIMIT,
    });

    const primaryToEvaluate = primaryCandidates.slice(0, PRIMARY_CANDIDATE_EVALUATION_CAP);

    const primaryEvaluatedRaw = await mapWithConcurrency(
      primaryToEvaluate,
      EVALUATION_CONCURRENCY,
      (candidate) => evaluateCompany(candidate, params, requestedMinutes, referenceCenter, false),
    );

    const primaryEvaluated = primaryEvaluatedRaw.filter((item): item is EvaluatedCandidate => Boolean(item));

    let relaxedEvaluated: EvaluatedCandidate[] = [];

    if (params.includeSimilar && requestedMinutes != null) {
      const relaxedCandidates = await MarketplaceRepo.getMarketplaceCandidates({
        serviceTypeId: params.serviceTypeId,
        city: params.city,
        zone: params.zone,
        q: params.q,
        searchMode: params.searchMode,
        applyPrimaryAreaFilters: false,
        take: FETCH_CANDIDATE_LIMIT,
      });

      const alreadyPresent = new Set(primaryToEvaluate.map((candidate) => candidate.id));
      const relaxedToEvaluate = relaxedCandidates
        .filter((candidate) => !alreadyPresent.has(candidate.id))
        .slice(0, SIMILAR_CANDIDATE_EVALUATION_CAP);

      const relaxedRaw = await mapWithConcurrency(
        relaxedToEvaluate,
        EVALUATION_CONCURRENCY,
        (candidate) => evaluateCompany(candidate, params, requestedMinutes, referenceCenter, true),
      );

      relaxedEvaluated = relaxedRaw.filter((item): item is EvaluatedCandidate => Boolean(item));
    }

    const allEvaluated = [...primaryEvaluated, ...relaxedEvaluated];
    const ratingsMap = await MarketplaceRepo.getCompanyRatings(allEvaluated.map((item) => item.companyId));

    for (const item of allEvaluated) {
      const rating = ratingsMap.get(item.companyId);
      item.rating = rating?.rating ?? 0;
      item.reviewCount = rating?.reviewCount ?? 0;
      item.whyThisResult = buildWhyThisResult({
        matchType: item.matchType,
        slotTime: item.matchedSlotTime,
        requestedTime: params.time,
        matchDeltaMinutes: item.matchDeltaMinutes,
        noTimeRequested: requestedMinutes == null,
        fromRelaxedArea: item.fromRelaxedArea,
        rating: item.rating,
        reviewCount: item.reviewCount,
      });
    }

    const scoredPrimary = scoreAndDecorate(
      primaryEvaluated,
      requestedMinutes != null,
      referenceCenter != null,
      params.debug,
    );
    const scoredRelaxed = scoreAndDecorate(
      relaxedEvaluated,
      requestedMinutes != null,
      referenceCenter != null,
      params.debug,
    );

    let exactBucket: EvaluatedCandidate[] = [];
    let flexibleBucket: EvaluatedCandidate[] = [];
    let similarBucket: EvaluatedCandidate[] = [];

    if (requestedMinutes == null) {
      flexibleBucket = scoredPrimary;
    } else {
      // TODO(marketplace): Add similar-service-category bucket after validating demand.
      // TODO(marketplace): Add next-day fallback when same-day supply is insufficient.
      for (const item of scoredPrimary) {
        if (item.matchType === 'exact') {
          exactBucket.push(item);
        } else if (item.matchType === 'flexible') {
          flexibleBucket.push(item);
        } else if (params.includeSimilar) {
          similarBucket.push(item);
        }
      }

      if (params.includeSimilar) {
        similarBucket = [...similarBucket, ...scoredRelaxed];
      }
    }

    const orderedPrimary = sortCandidates([...exactBucket, ...flexibleBucket], params.sort);
    const orderedSimilar = params.includeSimilar ? sortCandidates(dedupeByCompany(similarBucket), params.sort) : [];

    const totalPrimary = orderedPrimary.length;
    const totalPages = Math.max(1, Math.ceil(totalPrimary / params.limit));
    const safePage = Math.min(params.page, totalPages);
    const startIdx = (safePage - 1) * params.limit;
    const pagedPrimary = orderedPrimary.slice(startIdx, startIdx + params.limit);
    const pagedSimilar = orderedSimilar.slice(0, params.limit);

    const mapPinsByCompany = new Map<number, ReturnType<typeof toMapPin>>();

    for (const item of [...orderedPrimary, ...orderedSimilar]) {
      const pin = toMapPin(item, !orderedSimilar.some((similar) => similar.companyId === item.companyId));
      if (pin && !mapPinsByCompany.has(item.companyId)) {
        mapPinsByCompany.set(item.companyId, pin);
      }
    }

    const searchPayload = {
      filters: {
        service_type_id: params.serviceTypeId,
        city: params.city ?? null,
        zone: params.zone ?? null,
        date: params.date,
        time: params.time ?? null,
        bounds: params.bounds ?? null,
        sort: params.sort,
        search_mode: params.searchMode,
        q: params.q ?? null,
        include_similar: params.includeSimilar,
      },
      counts: {
        total_primary: totalPrimary,
        exact: exactBucket.length,
        flexible: flexibleBucket.length,
        similar: orderedSimilar.length,
      },
      has_exact_matches: exactBucket.length > 0,
      pagination: {
        page: safePage,
        limit: params.limit,
      },
    };

    await Promise.all([
      MarketplaceAnalyticsService.trackSearchPerformed(searchPayload),
      MarketplaceAnalyticsService.trackSearchResultsViewed(searchPayload),
      requestedMinutes != null && exactBucket.length === 0
        ? MarketplaceAnalyticsService.trackNoExactMatch(searchPayload)
        : Promise.resolve(),
    ]);

    return {
      code: 200,
      error: false,
      message: 'Marketplace search completed',
      data: {
        querySummary: {
          serviceTypeId: params.serviceTypeId,
          city: params.city ?? null,
          zone: params.zone ?? null,
          date: params.date,
          time: params.time ?? null,
          hasRequestedTime: requestedMinutes != null,
          bounds: params.bounds ?? null,
          sort: params.sort,
          page: safePage,
          limit: params.limit,
          searchMode: params.searchMode,
          q: params.q ?? null,
          includeSimilar: params.includeSimilar,
        },
        results: pagedPrimary.map((item) => toApiResult(item, params.serviceTypeId, params.time, params.debug)),
        similarBookings: pagedSimilar.map((item) => toApiResult(item, params.serviceTypeId, params.time, params.debug)),
        mapPins: [...mapPinsByCompany.values()].filter(Boolean),
        mapProvider: 'mapbox',
        meta: {
          page: safePage,
          limit: params.limit,
          totalResults: totalPrimary,
          totalPages,
          counts: {
            exact: exactBucket.length,
            flexible: flexibleBucket.length,
            similar: orderedSimilar.length,
          },
          diagnostics: {
            candidatesFound: primaryCandidates.length,
            candidatesEvaluated: primaryToEvaluate.length + (params.includeSimilar ? relaxedEvaluated.length : 0),
            evaluationCapHit: primaryCandidates.length > PRIMARY_CANDIDATE_EVALUATION_CAP,
            processingMs: Date.now() - startedAt,
          },
        },
      },
    };
  } catch (error: any) {
    return {
      code: 500,
      error: true,
      message: 'Failed to run marketplace search',
      technicalMessage: error?.message || String(error),
    };
  }
}

interface TrackMarketplaceClickParams {
  eventName?: MarketplaceAnalyticsService.MarketplaceEventName;
  companyId?: number;
  serviceTypeId?: number;
  date?: string;
  time?: string;
  matchType?: MatchType;
  position?: number;
  source?: string;
  surface?: string;
  city?: string;
  zone?: string;
  hasExactMatches?: boolean;
  counts?: {
    exact?: number;
    flexible?: number;
    similar?: number;
  };
  metadata?: Record<string, unknown>;
  q?: string;
}

export async function trackMarketplaceClick(params: TrackMarketplaceClickParams): Promise<MensajeApi> {
  try {
    const eventName = params.eventName ?? 'marketplace_result_card_clicked';
    await MarketplaceAnalyticsService.trackEvent(eventName, {
      companyId: params.companyId ?? null,
      serviceTypeId: params.serviceTypeId ?? null,
      date: params.date ?? null,
      time: params.time ?? null,
      matchType: params.matchType ?? null,
      position: params.position ?? null,
      source: params.source ?? 'marketplace',
      surface: params.surface ?? null,
      city: params.city ?? null,
      zone: params.zone ?? null,
      hasExactMatches: params.hasExactMatches ?? null,
      counts: params.counts ?? null,
      ...(params.metadata ?? {}),
      q: params.q ?? null,
    });

    return {
      code: 201,
      error: false,
      message: 'Marketplace event tracked',
      data: {
        tracked: true,
      },
    };
  } catch (error: any) {
    return {
      code: 500,
      error: true,
      message: 'Failed to track marketplace click',
      technicalMessage: error?.message || String(error),
    };
  }
}
