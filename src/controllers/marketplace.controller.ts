import { Request, Response } from 'express';
import * as MarketplaceSearchService from '../services/marketplace-search.service';
import { MARKETPLACE_EVENT_NAMES, type MarketplaceEventName } from '../services/marketplace-analytics.service';
import type { BoundsFilter } from '../repositories/marketplace.repo';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_REGEX = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const TIME_12H_REGEX = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*([AaPp][Mm])$/;

function parseBounds(bounds?: string): BoundsFilter | null {
  if (!bounds) return null;

  const values = bounds.split(',').map((value) => Number(value.trim()));
  if (values.length !== 4 || values.some((value) => Number.isNaN(value))) {
    return null;
  }

  const [minLng, minLat, maxLng, maxLat] = values;

  if (
    minLng < -180 ||
    maxLng > 180 ||
    minLat < -90 ||
    maxLat > 90 ||
    minLng >= maxLng ||
    minLat >= maxLat
  ) {
    return null;
  }

  return { minLng, minLat, maxLng, maxLat };
}

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value !== 'string') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return defaultValue;
}

function normalizeTimeInput(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  const match24 = trimmed.match(TIME_24H_REGEX);
  if (match24) {
    const hours = Number(match24[1]);
    const minutes = Number(match24[2]);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const match12 = trimmed.match(TIME_12H_REGEX);
  if (match12) {
    const rawHour = Number(match12[1]);
    const minutes = Number(match12[2]);
    const meridiem = match12[3].toUpperCase();
    let hours = rawHour % 12;
    if (meridiem === 'PM') hours += 12;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  return null;
}

export async function searchMarketplace(req: Request, res: Response) {
  const startedAt = Date.now();
  const requestId = Math.random().toString(36).slice(2, 10);
  const serviceTypeRaw = req.query.service_type_id;
  const dateRaw = req.query.date;
  const timeRaw = req.query.time;
  const normalizedTime = typeof timeRaw === 'string' ? (normalizeTimeInput(timeRaw) ?? undefined) : undefined;

  console.info('[marketplace.search] request_received', {
    requestId,
    method: req.method,
    path: req.originalUrl,
    query: req.query,
  });

  if (!serviceTypeRaw || typeof serviceTypeRaw !== 'string') {
    console.warn('[marketplace.search] validation_failed', {
      requestId,
      reason: 'service_type_id is required',
    });
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'service_type_id is required',
    });
  }

  const serviceTypeId = parseInt(serviceTypeRaw, 10);
  if (Number.isNaN(serviceTypeId) || serviceTypeId < 1) {
    console.warn('[marketplace.search] validation_failed', {
      requestId,
      reason: 'service_type_id must be a positive integer',
      serviceTypeRaw,
    });
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'service_type_id must be a positive integer',
    });
  }

  if (!dateRaw || typeof dateRaw !== 'string' || !DATE_REGEX.test(dateRaw)) {
    console.warn('[marketplace.search] validation_failed', {
      requestId,
      reason: 'date is required and must use YYYY-MM-DD format',
      dateRaw,
    });
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'date is required and must use YYYY-MM-DD format',
    });
  }

  if (timeRaw && (!normalizedTime || typeof timeRaw !== 'string')) {
    console.warn('[marketplace.search] validation_failed', {
      requestId,
      reason: 'time must use HH:mm or h:mm AM/PM format',
      timeRaw,
    });
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'time must use HH:mm or h:mm AM/PM format',
    });
  }

  const boundsRaw = typeof req.query.bounds === 'string' ? req.query.bounds : undefined;
  const bounds = parseBounds(boundsRaw);

  if (boundsRaw && !bounds) {
    console.warn('[marketplace.search] validation_failed', {
      requestId,
      reason: 'bounds must use minLng,minLat,maxLng,maxLat format',
      boundsRaw,
    });
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'bounds must use minLng,minLat,maxLng,maxLat format',
    });
  }

  const searchMode = req.query.search_mode === 'salon_name' ? 'salon_name' : 'service_now';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;

  if (searchMode === 'salon_name' && !q) {
    console.warn('[marketplace.search] validation_failed', {
      requestId,
      reason: 'q is required when search_mode=salon_name',
      searchMode,
    });
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'q is required when search_mode=salon_name',
    });
  }

  const sortInput = typeof req.query.sort === 'string' ? req.query.sort : 'best_match';
  const sort = ['best_match', 'earliest', 'nearest', 'rating', 'price'].includes(sortInput)
    ? (sortInput as 'best_match' | 'earliest' | 'nearest' | 'rating' | 'price')
    : 'best_match';

  const pageInput = typeof req.query.page === 'string' ? parseInt(req.query.page, 10) : 1;
  const limitInput = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 20;

  if (Number.isNaN(pageInput) || pageInput < 1) {
    console.warn('[marketplace.search] validation_failed', {
      requestId,
      reason: 'page must be a positive integer',
      pageInput,
    });
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'page must be a positive integer',
    });
  }

  if (Number.isNaN(limitInput) || limitInput < 1 || limitInput > 50) {
    console.warn('[marketplace.search] validation_failed', {
      requestId,
      reason: 'limit must be between 1 and 50',
      limitInput,
    });
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'limit must be between 1 and 50',
    });
  }

  const result = await MarketplaceSearchService.searchMarketplace({
    serviceTypeId,
    city: typeof req.query.city === 'string' ? req.query.city.trim() : undefined,
    zone: typeof req.query.zone === 'string' ? req.query.zone.trim() : undefined,
    date: dateRaw,
    time: normalizedTime,
    bounds: bounds || undefined,
    sort,
    page: pageInput,
    limit: limitInput,
    searchMode,
    q,
    includeSimilar: parseBoolean(req.query.include_similar, true),
    debug: parseBoolean(req.query.debug, false),
  });

  console.info('[marketplace.search] response_sent', {
    requestId,
    tookMs: Date.now() - startedAt,
    code: result.code,
    error: result.error,
    message: result.message,
    totalResults: result?.data?.meta?.totalResults ?? null,
    counts: result?.data?.meta?.counts ?? null,
  });

  return res.status(result.code).json(result);
}

export async function trackMarketplaceClick(req: Request, res: Response) {
  const { company_id, service_type_id, date, time, match_type, position, source, surface, q, metadata } = req.body || {};
  const normalizedTime = typeof time === 'string' ? (normalizeTimeInput(time) ?? undefined) : undefined;

  if (!company_id || typeof company_id !== 'number') {
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'company_id is required and must be a number',
    });
  }

  if (!service_type_id || typeof service_type_id !== 'number') {
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'service_type_id is required and must be a number',
    });
  }

  if (!date || typeof date !== 'string' || !DATE_REGEX.test(date)) {
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'date is required and must use YYYY-MM-DD format',
    });
  }

  if (time !== undefined && (!normalizedTime || typeof time !== 'string')) {
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'time must use HH:mm or h:mm AM/PM format when provided',
    });
  }

  if (position !== undefined && (typeof position !== 'number' || position < 0)) {
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'position must be a positive number when provided',
    });
  }

  if (match_type !== undefined && !['exact', 'flexible', 'similar'].includes(match_type)) {
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'match_type must be exact, flexible, or similar',
    });
  }

  const result = await MarketplaceSearchService.trackMarketplaceClick({
    eventName: 'marketplace_result_card_clicked',
    companyId: company_id,
    serviceTypeId: service_type_id,
    date,
    time: normalizedTime,
    matchType: match_type,
    position,
    source,
    surface,
    metadata: typeof metadata === 'object' && metadata ? metadata : undefined,
    q,
  });

  return res.status(result.code).json(result);
}

export async function trackMarketplaceEvent(req: Request, res: Response) {
  const {
    event_name,
    company_id,
    service_type_id,
    date,
    time,
    match_type,
    position,
    source,
    surface,
    city,
    zone,
    has_exact_matches,
    counts,
    q,
    metadata,
  } = req.body || {};
  const normalizedTime = typeof time === 'string' ? (normalizeTimeInput(time) ?? undefined) : undefined;

  if (!event_name || typeof event_name !== 'string' || !MARKETPLACE_EVENT_NAMES.includes(event_name as MarketplaceEventName)) {
    return res.status(400).json({
      code: 400,
      error: true,
      message: `event_name is required and must be one of: ${MARKETPLACE_EVENT_NAMES.join(', ')}`,
    });
  }

  const normalizedEvent = event_name as MarketplaceEventName;
  const requiresCompany =
    normalizedEvent === 'marketplace_pin_clicked' ||
    normalizedEvent === 'marketplace_result_card_clicked' ||
    normalizedEvent === 'marketplace_book_now_clicked' ||
    normalizedEvent === 'marketplace_view_salon_clicked';

  if (requiresCompany && (!company_id || typeof company_id !== 'number')) {
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'company_id is required and must be a number for this event',
    });
  }

  if (service_type_id != null && typeof service_type_id !== 'number') {
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'service_type_id must be a number when provided',
    });
  }

  if (date != null && (typeof date !== 'string' || !DATE_REGEX.test(date))) {
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'date must use YYYY-MM-DD format when provided',
    });
  }

  if (time != null && (!normalizedTime || typeof time !== 'string')) {
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'time must use HH:mm or h:mm AM/PM format when provided',
    });
  }

  if (position !== undefined && (typeof position !== 'number' || position < 0)) {
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'position must be a positive number when provided',
    });
  }

  if (match_type !== undefined && !['exact', 'flexible', 'similar'].includes(match_type)) {
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'match_type must be exact, flexible, or similar when provided',
    });
  }

  if (has_exact_matches != null && typeof has_exact_matches !== 'boolean') {
    return res.status(400).json({
      code: 400,
      error: true,
      message: 'has_exact_matches must be a boolean when provided',
    });
  }

  const result = await MarketplaceSearchService.trackMarketplaceClick({
    eventName: normalizedEvent,
    companyId: typeof company_id === 'number' ? company_id : undefined,
    serviceTypeId: typeof service_type_id === 'number' ? service_type_id : undefined,
    date: typeof date === 'string' ? date : undefined,
    time: normalizedTime,
    matchType: match_type,
    position,
    source,
    surface,
    city,
    zone,
    hasExactMatches: has_exact_matches,
    counts: typeof counts === 'object' && counts ? counts : undefined,
    q,
    metadata: typeof metadata === 'object' && metadata ? metadata : undefined,
  });

  return res.status(result.code).json(result);
}
