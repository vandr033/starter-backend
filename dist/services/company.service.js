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
exports.getCompanyStatus = exports.getCompanyInviteService = exports.getCompanyPublicPage = exports.deleteCompany = exports.updateCompany = exports.createCompany = exports.getCompanyByPhone = exports.getCompanyBySlug = exports.getCompanyById = exports.getFeaturedCompanies = exports.getAllCompanies = void 0;
const mensajeApiUtils_1 = require("../utils/mensajeApiUtils");
const CompanyRepo = __importStar(require("../repositories/company.repo"));
const company_entitlements_service_1 = require("./company-entitlements.service");
const public_storefront_1 = require("../utils/public-storefront");
const CommerceRepo = __importStar(require("../repositories/commerce.repo"));
const service_pricing_service_1 = require("./service-pricing.service");
const coordinates_1 = require("../utils/coordinates");
const restaurant_schedule_service_1 = require("./restaurant-schedule.service");
const ServiceRepo = __importStar(require("../repositories/service.repo"));
let mensaje;
const DEFAULT_LANGUAGE_KEY = 'default_language';
const FALLBACK_DEFAULT_LANGUAGE = 'es';
const getAllCompanies = async () => {
    try {
        const companies = await CompanyRepo.getAllCompanies();
        mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('Succesfully retrieved all companies', companies);
        return mensaje;
    }
    catch (error) {
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get all', error);
        return mensaje;
    }
};
exports.getAllCompanies = getAllCompanies;
const BACKEND_BASE_URL = (process.env.BASE_URL || '').trim();
/** Turn a relative path like `/api/storage/...` into a full URL */
function resolveImageUrl(url) {
    if (!url)
        return '';
    if (url.startsWith('http://') || url.startsWith('https://'))
        return url;
    if (!BACKEND_BASE_URL)
        return url;
    return `${BACKEND_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}
const getFeaturedCompanies = async () => {
    try {
        const companies = await CompanyRepo.getFeaturedCompanies(8);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const featured = companies.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            city: c.city ?? '',
            neighborhood: c.address ?? '',
            imageUrl: resolveImageUrl(c.home_hero_image_url || c.logo_url),
            rating: Math.round((c.rating.avg + Number.EPSILON) * 10) / 10,
            reviewCount: c.rating.count,
            isTopRated: c.rating.avg >= 4.5 && c.rating.count >= 2,
            isNew: c.created_at >= thirtyDaysAgo,
            category: c.company_type?.name ?? null,
        }));
        mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('Successfully retrieved featured companies', featured);
        return mensaje;
    }
    catch (error) {
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get featured', error);
        return mensaje;
    }
};
exports.getFeaturedCompanies = getFeaturedCompanies;
const getCompanyById = async (id) => {
    try {
        const company = await CompanyRepo.getCompanyById(id);
        mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('Succesfully retrieved company with id: ' + id, company);
        return mensaje;
    }
    catch (error) {
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get by id', error);
        return mensaje;
    }
};
exports.getCompanyById = getCompanyById;
const getCompanyBySlug = async (slug) => {
    try {
        const company = await CompanyRepo.getCompanyBySlug(slug);
        mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('Succesfully retrieved company with slug: ' + slug, company);
        return mensaje;
    }
    catch (error) {
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get by slug', error);
        return mensaje;
    }
};
exports.getCompanyBySlug = getCompanyBySlug;
const getCompanyByPhone = async (phone) => {
    try {
        const company = await CompanyRepo.getCompanyByPhone(phone);
        mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('Succesfully retrieved company with phone: ' + phone, company);
        return mensaje;
    }
    catch (error) {
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get by phone', error);
        return mensaje;
    }
};
exports.getCompanyByPhone = getCompanyByPhone;
const createCompany = async (companyData) => {
    try {
        const company = await CompanyRepo.createCompany(companyData);
        mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('Succesfully created company', company);
        return mensaje;
    }
    catch (error) {
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'create', error);
        return mensaje;
    }
};
exports.createCompany = createCompany;
const updateCompany = async (id, companyData) => {
    try {
        const company = await CompanyRepo.updateCompany(id, companyData);
        mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('Succesfully updated company with id: ' + id, company);
        return mensaje;
    }
    catch (error) {
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'update', error);
        return mensaje;
    }
};
exports.updateCompany = updateCompany;
const deleteCompany = async (id) => {
    try {
        const company = await CompanyRepo.deleteCompany(id);
        mensaje = (0, mensajeApiUtils_1.buildSuccessResponse)('Succesfully deleted company with id: ' + id, company);
        return mensaje;
    }
    catch (error) {
        mensaje = (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'delete', error);
        return mensaje;
    }
};
exports.deleteCompany = deleteCompany;
const DEFAULT_THEME = {
    brand_color: '#2563eb',
    page_background_color: '#f3f4f6',
    page_background_preset: 'auto',
    cards_elevated: true,
    corner_radius: 'md',
};
function serializeCommerceStore(store) {
    if (!store)
        return null;
    return {
        ...store,
        fixed_delivery_cost: store.fixed_delivery_cost != null ? Number(store.fixed_delivery_cost) : null,
        order_schedule_slots: Array.isArray(store.order_schedule_slots)
            ? store.order_schedule_slots.map((slot) => ({ ...slot }))
            : [],
    };
}
function serializeCommercePointOfSale(pointOfSale) {
    const coordinates = (0, coordinates_1.getValidCoordinates)(pointOfSale.latitude, pointOfSale.longitude);
    return {
        ...pointOfSale,
        opening_time: pointOfSale.opening_time,
        closing_time: pointOfSale.closing_time,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
    };
}
function serializeCommerceProduct(product) {
    return {
        ...product,
        price: product.price != null ? Number(product.price) : null,
        regular_price: product.regular_price != null ? Number(product.regular_price) : null,
        promo_price: product.promo_price != null ? Number(product.promo_price) : null,
    };
}
function serializePublicService(service, promotionsEnabled) {
    const pricing = (0, service_pricing_service_1.resolveEffectiveServicePrice)({
        priceCents: service.price_cents,
        promoPriceCents: service.promo_price_cents ?? null,
        promoStartsAt: service.promo_starts_at ?? null,
        promoEndsAt: service.promo_ends_at ?? null,
        promoLabel: service.promo_label ?? null,
        promotionsEnabled,
    });
    return {
        ...service,
        promo_price_cents: promotionsEnabled ? service.promo_price_cents ?? null : null,
        promo_starts_at: promotionsEnabled ? service.promo_starts_at ?? null : null,
        promo_ends_at: promotionsEnabled ? service.promo_ends_at ?? null : null,
        promo_label: promotionsEnabled ? service.promo_label ?? null : null,
        pricing: {
            regular_price_cents: pricing.regularPriceCents,
            base_price_cents: pricing.basePriceCents,
            final_price_cents: pricing.finalPriceCents,
            promo_applied: pricing.promoApplied,
            promo_label: pricing.promoLabel,
            promo_starts_at: pricing.promoStartsAt,
            promo_ends_at: pricing.promoEndsAt,
        },
    };
}
function filterPublicCategoriesByServices(categories, services) {
    const categoryIds = new Set(services.map((service) => service.category_id));
    return categories.filter((category) => categoryIds.has(category.id));
}
const getCompanyPublicPage = async (slug) => {
    try {
        const companyData = await CompanyRepo.getCompanyPublicPageBySlug(slug);
        if (!companyData) {
            return (0, mensajeApiUtils_1.buildNotFoundResponse)('Company', 'Company not found');
        }
        // Extract company base fields (without relations)
        const { categories, services, staff_profiles, company_settings, config_messages, theme_config, reviews, ...company } = companyData;
        const entitlements = await (0, company_entitlements_service_1.getCompanyEntitlements)(company.id);
        const basePublicFeatures = (0, public_storefront_1.buildPublicStorefrontVisibility)({
            entitlements,
            availability: {
                availableUntil: company.availableUntil,
                is_active: company.is_active,
                deleted_at: company.deleted_at,
            },
            isMarketplaceVisible: company.is_marketplace_visible,
        });
        const canExposeCommerceStore = basePublicFeatures.storefrontEnabled
            && entitlements.productCapabilities.COMMERCE_ACCESS === true;
        const commerceStoreRecord = canExposeCommerceStore
            ? await CommerceRepo.findCommerceStoreByCompanyId(company.id)
            : null;
        const isCommerceStorePubliclyVisible = commerceStoreRecord?.is_active === true;
        const publicFeatures = (0, public_storefront_1.applyCommerceStoreVisibility)(basePublicFeatures, isCommerceStorePubliclyVisible);
        const publicEntitlements = (0, public_storefront_1.buildPublicEntitlementSummary)(entitlements, publicFeatures);
        const defaultLanguage = config_messages?.find((item) => item.key === DEFAULT_LANGUAGE_KEY)?.value?.trim().toLowerCase() ||
            FALLBACK_DEFAULT_LANGUAGE;
        // Calculate review stats
        const reviewCount = reviews.length;
        const reviewAverage = reviewCount > 0
            ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
            : 0;
        // Extract only public settings
        const settings = company_settings
            ? {
                allow_qr_payment: company_settings.allow_qr_payment,
                qr_image_url: company_settings.qr_image_url,
                allow_cash_payment: company_settings.allow_cash_payment,
                require_comprobante_for_qr: company_settings.require_comprobante_for_qr,
                auto_confirm_bookings: company_settings.auto_confirm_bookings,
                booking_time_view_default: company_settings.booking_time_view_default ?? 'hour',
                social_links: company_settings.social_links || {},
                default_language: defaultLanguage,
                max_advance_booking_days: company_settings.max_advance_booking_days ?? null,
                min_advance_booking_minutes: company_settings.min_advance_booking_minutes ?? null,
                custom_tos: company_settings.custom_tos ?? null,
                staff_label: company_settings.staff_label ?? 'Staff',
            }
            : {
                allow_qr_payment: true,
                qr_image_url: null,
                allow_cash_payment: true,
                require_comprobante_for_qr: true,
                auto_confirm_bookings: true,
                booking_time_view_default: 'hour',
                social_links: {},
                default_language: defaultLanguage,
                max_advance_booking_days: null,
                min_advance_booking_minutes: null,
                custom_tos: null,
                staff_label: 'Staff',
            };
        // Restaurant reservations and the restaurant storefront publish the same
        // service-period schedule. Generic company hours remain available for
        // non-restaurant booking and commerce flows, but never contradict the
        // restaurant schedule shown to guests.
        const restaurantHours = company.restaurant_enabled
            ? await (0, restaurant_schedule_service_1.getRestaurantPublicHours)(company.id)
            : [];
        // Apply theme defaults if no config exists
        const rawTheme = theme_config
            ? {
                brand_color: theme_config.brand_color,
                page_background_color: theme_config.page_background_color,
                page_background_preset: theme_config.page_background_preset,
                cards_elevated: theme_config.cards_elevated,
                corner_radius: theme_config.corner_radius,
                font_pairing: theme_config.font_pairing || 'classic',
                hero_variant: theme_config.hero_variant || 'hero-cinematic',
                services_variant: theme_config.services_variant || 'services-grid',
                team_variant: theme_config.team_variant || 'team-cards',
                home_cta_buttons: theme_config.home_cta_buttons ?? null,
                home_section_order: theme_config.home_section_order ?? null,
                footer_config: theme_config.footer_config ?? null,
                announcement_banners: theme_config.announcement_banners ?? null,
            }
            : DEFAULT_THEME;
        const theme = (0, public_storefront_1.sanitizePublicThemeConfig)(rawTheme, publicFeatures);
        const exposeReservasContent = publicFeatures.storefrontEnabled && publicFeatures.servicesVisible;
        const exposeCommerceContent = publicFeatures.storefrontEnabled && publicFeatures.commerceVisible;
        const exposeServicePromotions = exposeReservasContent &&
            entitlements.productCapabilities.RESERVAS_SERVICE_PROMOTIONS === true;
        const [commerceCategories, commerceProducts, commercePointsOfSale] = exposeCommerceContent
            ? await Promise.all([
                CommerceRepo.listPublicCommerceCategories(company.id),
                CommerceRepo.listPublicCommerceProducts(company.id),
                CommerceRepo.listPublicCommercePointsOfSale(company.id),
            ])
            : [[], [], []];
        const publicServices = exposeReservasContent
            ? services.map((service) => serializePublicService(service, exposeServicePromotions))
            : [];
        const publicCategories = exposeReservasContent
            ? filterPublicCategoriesByServices(categories, publicServices)
            : [];
        const responseData = {
            company: {
                ...company,
                capabilities: entitlements,
                entitlements: publicEntitlements,
                public_features: publicFeatures,
            },
            categories: publicCategories,
            services: publicServices,
            staff: exposeReservasContent ? staff_profiles : [],
            commerceStore: exposeCommerceContent && commerceStoreRecord
                ? serializeCommerceStore(commerceStoreRecord)
                : null,
            commercePointsOfSale: exposeCommerceContent
                ? commercePointsOfSale.map(serializeCommercePointOfSale)
                : [],
            commerceCategories: exposeCommerceContent ? commerceCategories : [],
            commerceProducts: exposeCommerceContent ? commerceProducts.map(serializeCommerceProduct) : [],
            settings,
            restaurantHours,
            theme,
            reviewStats: {
                average: Math.round(reviewAverage * 10) / 10, // Round to 1 decimal
                count: reviewCount,
            },
        };
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Company retrieved', responseData);
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get public page', error);
    }
};
exports.getCompanyPublicPage = getCompanyPublicPage;
const getCompanyInviteService = async (slug, inviteToken) => {
    try {
        const inviteService = await ServiceRepo.getPublicInviteServiceByToken(slug, inviteToken);
        if (!inviteService) {
            return (0, mensajeApiUtils_1.buildNotFoundResponse)('Invite service', 'Invite service not found');
        }
        const entitlements = await (0, company_entitlements_service_1.getCompanyEntitlements)(inviteService.company.id);
        const publicFeatures = (0, public_storefront_1.buildPublicStorefrontVisibility)({
            entitlements,
            availability: {
                availableUntil: inviteService.company.availableUntil,
                is_active: inviteService.company.is_active,
                deleted_at: inviteService.company.deleted_at,
            },
            isMarketplaceVisible: inviteService.company.isMarketplaceVisible,
        });
        if (!publicFeatures.bookingsEnabled) {
            return (0, mensajeApiUtils_1.buildNotFoundResponse)('Invite service', 'Invite service not found');
        }
        const promotionsEnabled = entitlements.productCapabilities.RESERVAS_SERVICE_PROMOTIONS === true;
        return (0, mensajeApiUtils_1.buildSuccessResponse)('Invite service retrieved', serializePublicService(inviteService, promotionsEnabled));
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get invite service', error);
    }
};
exports.getCompanyInviteService = getCompanyInviteService;
const getCompanyStatus = async (slug) => {
    try {
        const company = await CompanyRepo.getCompanyBySlug(slug);
        if (!company) {
            return {
                code: 404,
                message: 'Company not found',
                error: true,
            };
        }
        // Get company timezone
        const timezone = company.timezone || 'UTC';
        // Get current time in company's timezone
        const now = new Date();
        const currentTimeInTimezone = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
        const currentMinutes = currentTimeInTimezone.getHours() * 60 + currentTimeInTimezone.getMinutes();
        const currentTimeString = `${currentTimeInTimezone.getHours().toString().padStart(2, '0')}:${currentTimeInTimezone.getMinutes().toString().padStart(2, '0')}`;
        // Restaurant service periods are the public schedule source of truth. The
        // generic company hours remain the schedule for non-restaurant modules.
        const localDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(now);
        const dayOfWeek = (0, restaurant_schedule_service_1.localDayOfWeek)(localDate);
        const restaurantPeriods = company.restaurant_enabled
            ? await (0, restaurant_schedule_service_1.listActiveRestaurantServicePeriods)(company.id, dayOfWeek)
            : null;
        const allTodayHours = restaurantPeriods
            ? restaurantPeriods.map((period) => ({
                open_time: period.start_time,
                close_time: period.end_time,
                is_closed: false,
            }))
            : await CompanyRepo.getAllHoursForDay(company.id, dayOfWeek);
        // Initialize response
        const response = {
            is_open_now: false,
            current_time: currentTimeString,
            today_windows: [],
            next_open_time: null,
            next_open_today: false,
            is_closed_today: true,
        };
        if (allTodayHours.length === 0) {
            // No hours configured for today
            response.is_closed_today = true;
            return {
                code: 200,
                message: 'Company status retrieved',
                error: false,
                data: response,
            };
        }
        // Process each time window
        let isOpenNow = false;
        let nextOpenTime = null;
        for (const hourWindow of allTodayHours) {
            if (hourWindow.is_closed || !hourWindow.open_time || !hourWindow.close_time) {
                continue;
            }
            const [openHour, openMin] = hourWindow.open_time.split(':').map(Number);
            const [closeHour, closeMin] = hourWindow.close_time.split(':').map(Number);
            const openMinutes = openHour * 60 + openMin;
            const closeMinutes = closeHour * 60 + closeMin;
            // Add window to response
            response.today_windows.push({
                open_time: hourWindow.open_time,
                close_time: hourWindow.close_time,
            });
            // Check the restaurant schedule with the same shared period resolver used
            // by public slots and reservation validation.
            if (restaurantPeriods
                ? restaurantPeriods.some((period) => (0, restaurant_schedule_service_1.isServicePeriodOpenAt)(period, currentTimeString))
                : currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
                isOpenNow = true;
            }
            // Find next opening time today
            if (!nextOpenTime && currentMinutes < openMinutes) {
                nextOpenTime = hourWindow.open_time;
            }
        }
        // Set response values
        response.is_open_now = isOpenNow;
        response.next_open_time = nextOpenTime;
        response.next_open_today = nextOpenTime !== null;
        response.is_closed_today = response.today_windows.length === 0;
        return {
            code: 200,
            message: 'Company status retrieved',
            error: false,
            data: response,
        };
    }
    catch (error) {
        return (0, mensajeApiUtils_1.buildServiceErrorResponse)('company', 'get status', error);
    }
};
exports.getCompanyStatus = getCompanyStatus;
