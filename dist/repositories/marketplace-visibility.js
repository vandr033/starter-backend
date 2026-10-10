"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMarketplaceVisibilityWhere = buildMarketplaceVisibilityWhere;
exports.withMarketplaceVisibilityWhere = withMarketplaceVisibilityWhere;
/**
 * Canonical marketplace discovery visibility filter.
 * A shop must be active, not deleted, visible in marketplace, and not expired.
 */
function buildMarketplaceVisibilityWhere(now = new Date()) {
    return {
        is_active: true,
        deleted_at: null,
        isMarketplaceVisible: true,
        availableUntil: { gte: now },
    };
}
/**
 * Combine the marketplace visibility filter with additional company conditions.
 */
function withMarketplaceVisibilityWhere(where, now = new Date()) {
    return {
        AND: [buildMarketplaceVisibilityWhere(now), where],
    };
}
