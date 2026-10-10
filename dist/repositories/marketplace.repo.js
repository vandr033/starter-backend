"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMarketplaceCandidates = getMarketplaceCandidates;
exports.getCompanyRatings = getCompanyRatings;
const client_1 = require("../prisma/client");
const marketplace_visibility_1 = require("./marketplace-visibility");
function isMissingCategoryGlobalTypeColumnError(error) {
    const maybe = error;
    if (maybe?.code !== 'P2022')
        return false;
    const column = maybe.meta?.column;
    return typeof column === 'string' && column.includes('category.global_service_type_id');
}
function withTrimmedValue(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}
function buildPrimaryWhere(query) {
    const city = withTrimmedValue(query.city);
    const zone = withTrimmedValue(query.zone);
    const q = withTrimmedValue(query.q);
    const where = (0, marketplace_visibility_1.buildMarketplaceVisibilityWhere)();
    if (query.applyPrimaryAreaFilters) {
        if (query.bounds) {
            where.latitude = { gte: query.bounds.minLat, lte: query.bounds.maxLat };
            where.longitude = { gte: query.bounds.minLng, lte: query.bounds.maxLng };
        }
        else {
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
    }
    else if (q) {
        const qWhere = {
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
function buildServiceFilterWithCategoryFallback(serviceTypeId) {
    return {
        is_active: true,
        deleted_at: null,
        is_invite_only: false,
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
function buildServiceFilterWithoutCategoryFallback(serviceTypeId) {
    return {
        is_active: true,
        deleted_at: null,
        is_invite_only: false,
        global_type_id: serviceTypeId,
    };
}
async function queryCandidates(where, serviceWhere, take) {
    return client_1.prisma.company.findMany({
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
            currency: true,
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
                    name_i18n: true,
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
async function getMarketplaceCandidates(query) {
    const baseWhere = buildPrimaryWhere(query);
    try {
        return await queryCandidates(baseWhere, buildServiceFilterWithCategoryFallback(query.serviceTypeId), query.take);
    }
    catch (error) {
        if (!isMissingCategoryGlobalTypeColumnError(error)) {
            throw error;
        }
        return queryCandidates(baseWhere, buildServiceFilterWithoutCategoryFallback(query.serviceTypeId), query.take);
    }
}
async function getCompanyRatings(companyIds) {
    if (companyIds.length === 0)
        return new Map();
    const aggregated = await client_1.prisma.review.groupBy({
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
    const map = new Map();
    for (const item of aggregated) {
        map.set(item.company_id, {
            rating: item._avg.rating ?? 0,
            reviewCount: item._count.rating ?? 0,
        });
    }
    return map;
}
