"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardMetrics = getDashboardMetrics;
const Repo = __importStar(require("../repositories/super-admin-dashboard.repo"));
function asObject(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return {};
    }
    return value;
}
function readString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function readNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function normalizeSource(payload) {
    const direct = readString(payload.source);
    if (direct === 'marketplace' || direct === 'salon_site' || direct === 'admin' || direct === 'manual') {
        return direct;
    }
    const bookingSource = readString(payload.booking_source);
    if (!bookingSource)
        return 'unknown';
    if (bookingSource === 'MARKETPLACE')
        return 'marketplace';
    if (bookingSource === 'SALON_SITE')
        return 'salon_site';
    if (bookingSource === 'ADMIN')
        return 'admin';
    if (bookingSource === 'MANUAL')
        return 'manual';
    return 'unknown';
}
function toRangeLabel(start, end) {
    return `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;
}
async function getDashboardMetrics(rangePreset = '7d') {
    try {
        const rangeWindow = Repo.getDashboardRangeWindow(rangePreset);
        const [bookings, revenue, topShopsByRevenue, topShopsByBookings, topServices, entityCounts, bookingsBySourceRaw, marketplaceEvents] = await Promise.all([
            Repo.getBookingCounts(),
            Repo.getRevenueTotals(),
            Repo.getTopShopsByRevenue(5),
            Repo.getTopShopsByBookings(5),
            Repo.getTopServices(5),
            Repo.getEntityCounts(),
            Repo.getBookingsBySource(rangeWindow.start, rangeWindow.end),
            Repo.getMarketplaceEventsInRange(rangeWindow.start, rangeWindow.end),
        ]);
        const serviceTypeDemandCounts = new Map();
        const locationDemandCounts = new Map();
        const dateDemandCounts = new Map();
        const hourDemandCounts = new Map();
        const funnel = {
            searches: 0,
            resultsViewed: 0,
            noExactMatches: 0,
            pinClicks: 0,
            resultCardClicks: 0,
            resultClicks: 0,
            bookNowClicks: 0,
            viewSalonClicks: 0,
            bookingStartsMarketplace: 0,
            bookingStartedBySource: {
                marketplace: 0,
                salonSite: 0,
                admin: 0,
                manual: 0,
                unknown: 0,
            },
            bookingConfirmedEvents: 0,
        };
        for (const event of marketplaceEvents) {
            const payload = asObject(event.payload);
            const filters = asObject(payload.filters);
            const counts = asObject(payload.counts);
            const serviceTypeId = readNumber(payload.service_type_id) ??
                readNumber(payload.serviceTypeId) ??
                readNumber(filters.service_type_id) ??
                readNumber(filters.serviceTypeId);
            const dateValue = readString(payload.date) ??
                readString(filters.date);
            const timeValue = readString(payload.time) ??
                readString(filters.time);
            const cityValue = readString(payload.city) ??
                readString(filters.city);
            const zoneValue = readString(payload.zone) ??
                readString(filters.zone);
            if (event.event_name === 'marketplace_search_submitted') {
                funnel.searches += 1;
                if (serviceTypeId) {
                    serviceTypeDemandCounts.set(serviceTypeId, (serviceTypeDemandCounts.get(serviceTypeId) || 0) + 1);
                }
                if (dateValue) {
                    dateDemandCounts.set(dateValue, (dateDemandCounts.get(dateValue) || 0) + 1);
                }
                if (timeValue) {
                    const hour = Number(timeValue.split(':')[0]);
                    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
                        hourDemandCounts.set(hour, (hourDemandCounts.get(hour) || 0) + 1);
                    }
                }
                if (zoneValue || cityValue) {
                    const label = zoneValue || cityValue || '';
                    const key = `${(zoneValue || '').toLowerCase()}|${(cityValue || '').toLowerCase()}`;
                    const prev = locationDemandCounts.get(key);
                    if (prev) {
                        prev.count += 1;
                    }
                    else {
                        locationDemandCounts.set(key, {
                            label,
                            city: cityValue,
                            zone: zoneValue,
                            count: 1,
                        });
                    }
                }
            }
            if (event.event_name === 'marketplace_search_results_viewed') {
                funnel.resultsViewed += 1;
            }
            if (event.event_name === 'marketplace_no_exact_match') {
                funnel.noExactMatches += 1;
            }
            if (event.event_name === 'marketplace_pin_clicked') {
                funnel.pinClicks += 1;
                funnel.resultClicks += 1;
            }
            if (event.event_name === 'marketplace_result_card_clicked') {
                funnel.resultCardClicks += 1;
                funnel.resultClicks += 1;
            }
            if (event.event_name === 'marketplace_book_now_clicked') {
                funnel.bookNowClicks += 1;
            }
            if (event.event_name === 'marketplace_view_salon_clicked') {
                funnel.viewSalonClicks += 1;
            }
            if (event.event_name === 'booking_started') {
                const source = normalizeSource(payload);
                if (source === 'marketplace')
                    funnel.bookingStartsMarketplace += 1;
                if (source === 'marketplace')
                    funnel.bookingStartedBySource.marketplace += 1;
                else if (source === 'salon_site')
                    funnel.bookingStartedBySource.salonSite += 1;
                else if (source === 'admin')
                    funnel.bookingStartedBySource.admin += 1;
                else if (source === 'manual')
                    funnel.bookingStartedBySource.manual += 1;
                else
                    funnel.bookingStartedBySource.unknown += 1;
            }
            if (event.event_name === 'booking_confirmed') {
                funnel.bookingConfirmedEvents += 1;
            }
            // Backward compatibility for old event names.
            if (event.event_name === 'search_performed') {
                funnel.searches += 1;
                const exact = readNumber(counts.exact);
                if (exact === 0) {
                    funnel.noExactMatches += 1;
                }
            }
            if (event.event_name === 'no_exact_match') {
                funnel.noExactMatches += 1;
            }
            if (event.event_name === 'result_clicked') {
                funnel.resultCardClicks += 1;
                funnel.resultClicks += 1;
            }
        }
        const serviceTypeIds = [...serviceTypeDemandCounts.keys()];
        const serviceTypeNameMap = await Repo.getGlobalServiceTypeNames(serviceTypeIds);
        const topSearchedServiceTypes = [...serviceTypeDemandCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([serviceTypeId, count]) => ({
            serviceTypeId,
            name: serviceTypeNameMap.get(serviceTypeId) || `Service #${serviceTypeId}`,
            count,
        }));
        const topSearchedLocations = [...locationDemandCounts.values()]
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
        const topSearchedDates = [...dateDemandCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([date, count]) => ({ date, count }));
        const demandByHour = Array.from({ length: 24 }, (_, hour) => ({
            hour,
            count: hourDemandCounts.get(hour) || 0,
        }));
        const peakDemandHour = demandByHour.reduce((best, current) => (current.count > best.count ? current : best), { hour: 0, count: 0 });
        const noExactRate = funnel.searches > 0 ? funnel.noExactMatches / funnel.searches : 0;
        const marketplaceShare = bookingsBySourceRaw.total > 0 ? bookingsBySourceRaw.marketplace / bookingsBySourceRaw.total : 0;
        const searchToClickRate = funnel.searches > 0 ? funnel.resultClicks / funnel.searches : 0;
        const searchToBookNowRate = funnel.searches > 0 ? funnel.bookNowClicks / funnel.searches : 0;
        const bookNowToStartRate = funnel.bookNowClicks > 0 ? funnel.bookingStartsMarketplace / funnel.bookNowClicks : 0;
        const startToConfirmRate = funnel.bookingStartsMarketplace > 0 ? bookingsBySourceRaw.marketplace / funnel.bookingStartsMarketplace : 0;
        const searchToConfirmRate = funnel.searches > 0 ? bookingsBySourceRaw.marketplace / funnel.searches : 0;
        const marketplace = {
            range: {
                preset: rangeWindow.preset,
                start: rangeWindow.start.toISOString(),
                end: rangeWindow.end.toISOString(),
                label: toRangeLabel(rangeWindow.start, rangeWindow.end),
            },
            bookingsBySource: {
                marketplace: bookingsBySourceRaw.marketplace,
                salonSite: bookingsBySourceRaw.salonSite,
                admin: bookingsBySourceRaw.admin,
                manual: bookingsBySourceRaw.manual,
                total: bookingsBySourceRaw.total,
                marketplaceShare,
            },
            funnel: {
                searches: funnel.searches,
                resultsViewed: funnel.resultsViewed,
                resultClicks: funnel.resultClicks,
                pinClicks: funnel.pinClicks,
                resultCardClicks: funnel.resultCardClicks,
                bookNowClicks: funnel.bookNowClicks,
                viewSalonClicks: funnel.viewSalonClicks,
                bookingStarts: funnel.bookingStartsMarketplace,
                bookingConfirmed: bookingsBySourceRaw.marketplace,
                bookingConfirmedEvents: funnel.bookingConfirmedEvents,
                noExactMatches: funnel.noExactMatches,
                noExactRate,
                searchToClickRate,
                searchToBookNowRate,
                bookNowToStartRate,
                startToConfirmRate,
                searchToConfirmRate,
            },
            demand: {
                topSearchedServiceTypes,
                topSearchedLocations,
                topSearchedDates,
                demandByHour,
                peakDemandHour,
            },
            diagnostics: {
                trackedEventRows: marketplaceEvents.length,
            },
        };
        return {
            code: 200,
            message: 'Super admin dashboard metrics retrieved successfully',
            error: false,
            data: { bookings, revenue, topShopsByRevenue, topShopsByBookings, topServices, entityCounts, marketplace },
        };
    }
    catch (error) {
        console.error('Error getting super admin dashboard metrics:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
