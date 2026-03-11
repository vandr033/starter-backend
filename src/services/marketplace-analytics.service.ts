import { Prisma } from '@prisma/client';
import { logger } from '../config/logger';
import { prisma } from '../prisma/client';

export const MARKETPLACE_EVENT_NAMES = [
  'marketplace_search_submitted',
  'marketplace_search_results_viewed',
  'marketplace_no_exact_match',
  'marketplace_pin_clicked',
  'marketplace_result_card_clicked',
  'marketplace_book_now_clicked',
  'marketplace_view_salon_clicked',
  'booking_started',
  'booking_confirmed',
  // legacy aliases (kept for backwards compatibility in queries and old clients)
  'search_performed',
  'no_exact_match',
  'result_clicked',
] as const;

export type MarketplaceEventName = (typeof MARKETPLACE_EVENT_NAMES)[number];

async function trackMarketplaceEvent(eventName: MarketplaceEventName, payload: Record<string, unknown>) {
  try {
    await prisma.marketplaceEvent.create({
      data: {
        event_name: eventName,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    logger.error({ event: 'marketplace_event_failed', eventName, error }, 'Failed to persist marketplace event');
  }
}

export async function trackEvent(eventName: MarketplaceEventName, payload: Record<string, unknown>) {
  await trackMarketplaceEvent(eventName, payload);
}

export async function trackSearchPerformed(payload: Record<string, unknown>) {
  await trackMarketplaceEvent('marketplace_search_submitted', payload);
}

export async function trackNoExactMatch(payload: Record<string, unknown>) {
  await trackMarketplaceEvent('marketplace_no_exact_match', payload);
}

export async function trackResultClicked(payload: Record<string, unknown>) {
  await trackMarketplaceEvent('marketplace_result_card_clicked', payload);
}

export async function trackSearchResultsViewed(payload: Record<string, unknown>) {
  await trackMarketplaceEvent('marketplace_search_results_viewed', payload);
}

export async function trackBookingStarted(payload: Record<string, unknown>) {
  await trackMarketplaceEvent('booking_started', payload);
}

export async function trackBookingConfirmed(payload: Record<string, unknown>) {
  await trackMarketplaceEvent('booking_confirmed', payload);
}
