"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MARKETPLACE_EVENT_NAMES = void 0;
exports.trackEvent = trackEvent;
exports.trackSearchPerformed = trackSearchPerformed;
exports.trackNoExactMatch = trackNoExactMatch;
exports.trackResultClicked = trackResultClicked;
exports.trackSearchResultsViewed = trackSearchResultsViewed;
exports.trackBookingStarted = trackBookingStarted;
exports.trackBookingConfirmed = trackBookingConfirmed;
const logger_1 = require("../config/logger");
const client_1 = require("../prisma/client");
exports.MARKETPLACE_EVENT_NAMES = [
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
];
async function trackMarketplaceEvent(eventName, payload) {
    try {
        await client_1.prisma.marketplaceEvent.create({
            data: {
                event_name: eventName,
                payload: payload,
            },
        });
    }
    catch (error) {
        logger_1.logger.error({ event: 'marketplace_event_failed', eventName, error }, 'Failed to persist marketplace event');
    }
}
async function trackEvent(eventName, payload) {
    await trackMarketplaceEvent(eventName, payload);
}
async function trackSearchPerformed(payload) {
    await trackMarketplaceEvent('marketplace_search_submitted', payload);
}
async function trackNoExactMatch(payload) {
    await trackMarketplaceEvent('marketplace_no_exact_match', payload);
}
async function trackResultClicked(payload) {
    await trackMarketplaceEvent('marketplace_result_card_clicked', payload);
}
async function trackSearchResultsViewed(payload) {
    await trackMarketplaceEvent('marketplace_search_results_viewed', payload);
}
async function trackBookingStarted(payload) {
    await trackMarketplaceEvent('booking_started', payload);
}
async function trackBookingConfirmed(payload) {
    await trackMarketplaceEvent('booking_confirmed', payload);
}
