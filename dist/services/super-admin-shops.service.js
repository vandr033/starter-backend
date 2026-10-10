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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncCompanyProducts = syncCompanyProducts;
exports.getAllShops = getAllShops;
exports.searchUsersForOwner = searchUsersForOwner;
exports.getShopById = getShopById;
exports.getShopSubscriptionHistory = getShopSubscriptionHistory;
exports.createShop = createShop;
exports.updateShop = updateShop;
exports.deleteShop = deleteShop;
exports.getShopUsers = getShopUsers;
exports.addUserToShop = addUserToShop;
exports.updateUserRoleInShop = updateUserRoleInShop;
exports.resendPendingUserInvite = resendPendingUserInvite;
exports.removeUserFromShop = removeUserFromShop;
exports.getCompanyTypes = getCompanyTypes;
exports.impersonateShop = impersonateShop;
const client_1 = require("../prisma/client");
const client_2 = require("@prisma/client");
const auth_1 = require("../config/auth");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const sendEmail_1 = require("../utils/sendEmail");
const StaffService = __importStar(require("./staff.service"));
const plan_enforcement_service_1 = require("./plan-enforcement.service");
const company_subscription_history_service_1 = require("./company-subscription-history.service");
const super_admin_shop_commercial_service_1 = require("./super-admin-shop-commercial.service");
const company_product_history_service_1 = require("./company-product-history.service");
const auth_constants_1 = require("../config/auth-constants");
const company_provisioning_service_1 = require("./company-provisioning.service");
const staff_availability_defaults_service_1 = require("./staff-availability-defaults.service");
const user_repo_1 = require("../repositories/user.repo");
const demo_operator_membership_service_1 = require("./demo-operator-membership.service");
/**
 * Generate a URL-friendly slug from a string
 */
function generateSlug(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(/[^\w\-]+/g, '') // Remove all non-word chars
        .replace(/\-\-+/g, '-') // Replace multiple - with single -
        .replace(/^-+/, '') // Trim - from start of text
        .replace(/-+$/, ''); // Trim - from end of text
}
function hasRestaurantModuleEntitlement(products) {
    return products.some((product) => product.tierCode === client_2.ProductTierCode.RESTAURANTE_PRO);
}
function normalizeOptionalText(value) {
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function normalizeRequiredText(value) {
    return value.trim();
}
function normalizeCurrency(value) {
    if (typeof value !== 'string')
        return undefined;
    const normalized = value.trim();
    if (normalized.length === 0 || normalized.length > 3)
        return undefined;
    return normalized;
}
function parseDateTime(value) {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed;
}
function normalizePricePaid(value) {
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    if (!Number.isFinite(value) || value < 0)
        return undefined;
    return Number(value.toFixed(2));
}
function decimalLikeToString(value) {
    if (value === null || value === undefined)
        return null;
    return value.toString();
}
function decimalLikeToNumber(value) {
    if (value === null || value === undefined)
        return null;
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
}
async function syncCompanyProducts(params) {
    const normalizedCommercialConfig = (0, super_admin_shop_commercial_service_1.normalizeCommercialConfiguration)({
        activeProducts: params.activeProducts,
        requestedProducts: params.requestedProducts,
        legacyPlan: params.legacyPlan,
        companyBillingCycle: params.companyBillingCycle,
        companyPricePaid: params.companyPricePaid,
        companyCurrency: params.companyCurrency,
        companyAvailableUntil: params.companyAvailableUntil,
    });
    const nextProducts = normalizedCommercialConfig.activeProducts;
    const existingSubscriptions = await params.tx.companyProductSubscription.findMany({
        where: {
            companyId: params.companyId,
        },
        include: {
            product: {
                select: {
                    code: true,
                },
            },
            productTier: {
                select: {
                    code: true,
                },
            },
        },
    });
    const tierCodes = nextProducts.map((product) => product.tierCode);
    const tierRows = await params.tx.productTier.findMany({
        where: {
            code: { in: tierCodes },
        },
        include: {
            product: {
                select: {
                    code: true,
                },
            },
        },
    });
    const tierByCode = new Map(tierRows.map((tier) => [tier.code, tier]));
    const existingByProductCode = new Map(existingSubscriptions.map((subscription) => [subscription.product.code, subscription]));
    const currentActiveProducts = existingSubscriptions
        .filter((subscription) => subscription.status === client_2.CompanyProductSubscriptionStatus.ACTIVE ||
        subscription.status === client_2.CompanyProductSubscriptionStatus.TRIALING)
        .map((subscription) => ({
        id: subscription.id,
        productCode: subscription.product.code,
        productTierCode: subscription.productTier.code,
        billingCycle: subscription.billingCycle,
        pricePaid: subscription.pricePaid,
        currency: subscription.currency,
        availableUntil: subscription.availableUntil,
        startsAt: subscription.startsAt,
        cancelledAt: subscription.cancelledAt,
        status: subscription.status,
    }));
    const productChanges = (0, super_admin_shop_commercial_service_1.diffActiveProducts)(currentActiveProducts, nextProducts);
    const subscriptionStatus = params.subscriptionStatus ?? client_2.CompanyProductSubscriptionStatus.ACTIVE;
    for (const nextProduct of nextProducts) {
        const tierRow = tierByCode.get(nextProduct.tierCode);
        if (!tierRow) {
            throw new Error(`Missing product tier catalog row for ${nextProduct.tierCode}.`);
        }
        const existingSubscription = existingByProductCode.get(nextProduct.productCode);
        if (existingSubscription) {
            await params.tx.companyProductSubscription.update({
                where: { id: existingSubscription.id },
                data: {
                    productId: tierRow.productId,
                    productTierId: tierRow.id,
                    status: subscriptionStatus,
                    billingCycle: nextProduct.billingCycle,
                    pricePaid: nextProduct.pricePaid,
                    currency: nextProduct.currency,
                    availableUntil: nextProduct.availableUntil,
                    cancelledAt: null,
                },
            });
        }
        else {
            await params.tx.companyProductSubscription.create({
                data: {
                    companyId: params.companyId,
                    productId: tierRow.productId,
                    productTierId: tierRow.id,
                    status: subscriptionStatus,
                    billingCycle: nextProduct.billingCycle,
                    pricePaid: nextProduct.pricePaid,
                    currency: nextProduct.currency,
                    availableUntil: nextProduct.availableUntil,
                },
            });
        }
    }
    const nextProductCodes = new Set(nextProducts.map((product) => product.productCode));
    for (const existingSubscription of existingSubscriptions) {
        if (nextProductCodes.has(existingSubscription.product.code))
            continue;
        if (existingSubscription.status === client_2.CompanyProductSubscriptionStatus.CANCELLED)
            continue;
        await params.tx.companyProductSubscription.update({
            where: { id: existingSubscription.id },
            data: {
                status: client_2.CompanyProductSubscriptionStatus.CANCELLED,
                cancelledAt: new Date(),
            },
        });
    }
    for (const change of productChanges) {
        await (0, company_product_history_service_1.recordCompanyProductHistory)({
            db: params.tx,
            companyId: params.companyId,
            action: change.action,
            previousValue: change.previousValue,
            newValue: change.newValue,
            actorUserId: params.actorUserId,
            source: params.source ?? null,
            note: params.note,
        });
    }
    const latestRequestedSnapshot = await params.tx.companyProductHistory.findFirst({
        where: {
            companyId: params.companyId,
            action: 'REQUESTED_PRODUCTS_SET',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const nextRequestedSnapshot = (0, super_admin_shop_commercial_service_1.serializeRequestedProductsSnapshot)(normalizedCommercialConfig.requestedProducts);
    const previousRequestedProducts = (0, super_admin_shop_commercial_service_1.parseRequestedProductsSnapshot)(latestRequestedSnapshot?.newValue);
    const nextRequestedProductsJson = JSON.stringify(nextRequestedSnapshot.requestedProducts);
    const previousRequestedProductsJson = JSON.stringify(previousRequestedProducts);
    if (nextRequestedProductsJson !== previousRequestedProductsJson) {
        await (0, company_product_history_service_1.recordCompanyProductHistory)({
            db: params.tx,
            companyId: params.companyId,
            action: 'REQUESTED_PRODUCTS_SET',
            previousValue: (0, super_admin_shop_commercial_service_1.serializeRequestedProductsSnapshot)(previousRequestedProducts),
            newValue: nextRequestedSnapshot,
            actorUserId: params.actorUserId,
            source: params.source ?? null,
            note: params.note,
        });
    }
    return normalizedCommercialConfig;
}
/**
 * Get all shops with pagination and search
 */
async function getAllShops(options) {
    try {
        const { search, page, limit } = options;
        const skip = (page - 1) * limit;
        const where = {
            deleted_at: null
        };
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { slug: { contains: search } }
            ];
        }
        const [shops, total] = await Promise.all([
            client_1.prisma.company.findMany({
                where,
                skip,
                take: limit,
                include: {
                    company_type: {
                        select: {
                            id: true,
                            name: true,
                            name_i18n: true
                        }
                    },
                    _count: {
                        select: {
                            company_users: true
                        }
                    }
                },
                orderBy: {
                    created_at: 'desc'
                }
            }),
            client_1.prisma.company.count({ where })
        ]);
        const totalPages = Math.ceil(total / limit);
        return {
            code: 200,
            error: false,
            message: 'Shops retrieved successfully',
            data: {
                shops: shops.map(shop => ({
                    id: shop.id,
                    slug: shop.slug,
                    name: shop.name,
                    currency: shop.currency,
                    city: shop.city,
                    is_active: shop.is_active,
                    plan: shop.plan,
                    billingCycle: shop.billingCycle,
                    pricePaid: shop.pricePaid,
                    availableUntil: shop.availableUntil,
                    isMarketplaceVisible: shop.isMarketplaceVisible,
                    created_at: shop.created_at,
                    company_type: shop.company_type,
                    user_count: shop._count.company_users
                })),
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages
                }
            }
        };
    }
    catch (error) {
        console.error('Error getting shops:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to retrieve shops'
        };
    }
}
/**
 * Search existing users to assign as owner during shop creation
 */
async function searchUsersForOwner(query, limit = 20) {
    try {
        const trimmedQuery = query?.trim() || '';
        const normalizedLimit = Math.max(1, Math.min(limit, 50));
        const where = {
            deleted_at: null,
        };
        if (trimmedQuery.length > 0) {
            where.OR = [
                { email: { contains: trimmedQuery } },
                { name: { contains: trimmedQuery } },
                { first_name: { contains: trimmedQuery } },
                { last_name: { contains: trimmedQuery } },
                { phoneNumber: { contains: trimmedQuery } },
            ];
        }
        const users = await client_1.prisma.user.findMany({
            where,
            take: normalizedLimit,
            orderBy: {
                updatedAt: 'desc',
            },
            select: {
                id: true,
                email: true,
                name: true,
                first_name: true,
                last_name: true,
                phone_prefix: true,
                phoneNumber: true,
                is_active: true,
                company_users: {
                    where: {
                        deleted_at: null,
                    },
                    select: {
                        role: true,
                        company: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                            },
                        },
                    },
                    orderBy: {
                        updated_at: 'desc',
                    },
                    take: 5,
                },
            },
        });
        return {
            code: 200,
            error: false,
            message: 'Users retrieved successfully',
            data: users.map((user) => ({
                id: user.id,
                email: user.email,
                name: user.name,
                first_name: user.first_name,
                last_name: user.last_name,
                phone_prefix: user.phone_prefix,
                phone: user.phoneNumber,
                is_active: user.is_active,
                memberships: user.company_users.map((membership) => ({
                    role: membership.role,
                    company: membership.company,
                })),
            })),
        };
    }
    catch (error) {
        console.error('Error searching users for owner assignment:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to search users',
        };
    }
}
/**
 * Get a single shop by ID
 */
async function getShopById(id) {
    try {
        const shop = await client_1.prisma.company.findUnique({
            where: {
                id,
                deleted_at: null
            },
            include: {
                company_type: {
                    select: {
                        id: true,
                        name: true,
                        name_i18n: true,
                        key: true
                    }
                }
            }
        });
        if (!shop) {
            return {
                code: 404,
                error: true,
                message: 'Shop not found'
            };
        }
        const commercialPayload = await (0, company_subscription_history_service_1.getCompanySubscriptionHistoryPayload)(id);
        return {
            code: 200,
            error: false,
            message: 'Shop retrieved successfully',
            data: {
                id: shop.id,
                slug: shop.slug,
                name: shop.name,
                address: shop.address,
                phone_prefix: shop.phone_prefix,
                phone: shop.phone,
                email: shop.email,
                city: shop.city,
                state: shop.state,
                country_code: shop.country_code,
                timezone: shop.timezone,
                currency: shop.currency,
                latitude: shop.latitude,
                longitude: shop.longitude,
                is_active: shop.is_active,
                plan: shop.plan,
                billingCycle: shop.billingCycle,
                pricePaid: shop.pricePaid,
                availableUntil: shop.availableUntil,
                isMarketplaceVisible: shop.isMarketplaceVisible,
                restaurant_enabled: shop.restaurant_enabled,
                company_type_id: shop.company_type_id,
                created_at: shop.created_at,
                updated_at: shop.updated_at,
                company_type: shop.company_type,
                activeProducts: commercialPayload?.company.activeProducts ?? [],
                requestedProducts: commercialPayload?.company.requestedProducts ?? [],
                legacyPlanCompatibility: commercialPayload?.company.legacyPlanCompatibility ?? shop.plan,
            }
        };
    }
    catch (error) {
        console.error('Error getting shop:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to retrieve shop'
        };
    }
}
/**
 * Get subscription history for a specific shop
 */
async function getShopSubscriptionHistory(id) {
    try {
        const payload = await (0, company_subscription_history_service_1.getCompanySubscriptionHistoryPayload)(id);
        if (!payload) {
            return {
                code: 404,
                error: true,
                message: 'Shop not found',
            };
        }
        return {
            code: 200,
            error: false,
            message: 'Shop subscription history retrieved successfully',
            data: payload,
        };
    }
    catch (error) {
        console.error('Error getting shop subscription history:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to retrieve shop subscription history',
        };
    }
}
/**
 * Create a new shop
 */
async function createShop(data, changedByUserId) {
    try {
        const normalizedName = normalizeRequiredText(data.name);
        const normalizedPhone = normalizeRequiredText(data.phone);
        const normalizedCurrency = normalizeCurrency(data.currency);
        const normalizedAvailableUntil = parseDateTime(data.availableUntil);
        const normalizedPricePaid = normalizePricePaid(data.pricePaid);
        if (!normalizedCurrency) {
            return {
                code: 400,
                error: true,
                message: 'currency is required',
            };
        }
        if (!normalizedAvailableUntil) {
            return {
                code: 400,
                error: true,
                message: 'availableUntil must be a valid datetime',
            };
        }
        if (data.pricePaid !== undefined && normalizedPricePaid === undefined) {
            return {
                code: 400,
                error: true,
                message: 'pricePaid must be a non-negative number',
            };
        }
        let normalizedCommercialConfig;
        try {
            normalizedCommercialConfig = (0, super_admin_shop_commercial_service_1.normalizeCommercialConfiguration)({
                activeProducts: data.activeProducts,
                requestedProducts: data.requestedProducts,
                legacyPlan: data.plan,
                companyBillingCycle: data.billingCycle,
                companyPricePaid: normalizedPricePaid ?? null,
                companyCurrency: normalizedCurrency,
                companyAvailableUntil: normalizedAvailableUntil,
            });
        }
        catch (error) {
            return {
                code: 400,
                error: true,
                message: error instanceof Error ? error.message : 'Invalid product configuration',
            };
        }
        if (data.restaurantEnabled &&
            !hasRestaurantModuleEntitlement(normalizedCommercialConfig.activeProducts)) {
            return {
                code: 400,
                error: true,
                message: 'Restaurant Lite requires an active Restaurante product',
            };
        }
        // Generate slug if not provided
        const slug = data.slug?.trim() || generateSlug(normalizedName);
        // Check if slug is unique
        const existingShop = await client_1.prisma.company.findFirst({
            where: {
                slug,
                deleted_at: null
            }
        });
        if (existingShop) {
            return {
                code: 400,
                error: true,
                message: 'Slug already exists'
            };
        }
        const ownerInput = data.owner;
        const ownerExistingUserId = ownerInput?.existingUserId?.trim() || '';
        const useExistingOwner = ownerExistingUserId.length > 0;
        const ownerEmail = ownerInput?.email?.trim().toLowerCase() || '';
        const ownerPassword = ownerInput?.password?.trim() || '';
        const ownerPhone = (ownerInput?.phone || '').replace(/\D/g, '');
        const ownerPhonePrefix = (ownerInput?.phone_prefix || '591').replace(/\D/g, '') || '591';
        if (!ownerInput) {
            return {
                code: 400,
                error: true,
                message: 'Owner profile is required when creating a shop'
            };
        }
        if (!useExistingOwner) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!ownerEmail) {
                return {
                    code: 400,
                    error: true,
                    message: 'Owner email is required'
                };
            }
            if (!emailRegex.test(ownerEmail)) {
                return {
                    code: 400,
                    error: true,
                    message: 'Invalid owner email format'
                };
            }
            if (!ownerPassword || ownerPassword.length < 8) {
                return {
                    code: 400,
                    error: true,
                    message: 'Owner password must be at least 8 characters'
                };
            }
            if (!ownerPhone) {
                return {
                    code: 400,
                    error: true,
                    message: 'Owner phone number is required'
                };
            }
        }
        const result = await client_1.prisma.$transaction(async (tx) => {
            const shop = await (0, company_provisioning_service_1.createCompanyWithDefaults)({
                tx,
                data: {
                    name: normalizedName,
                    slug,
                    address: normalizeOptionalText(data.address),
                    phone_prefix: normalizeOptionalText(data.phone_prefix) || '591',
                    phone: normalizedPhone,
                    email: normalizeOptionalText(data.email),
                    city: normalizeOptionalText(data.city),
                    state: normalizeOptionalText(data.state),
                    country_code: normalizeOptionalText(data.country_code),
                    timezone: normalizeOptionalText(data.timezone) || 'America/La_Paz',
                    currency: normalizedCurrency,
                    latitude: data.latitude ?? null,
                    longitude: data.longitude ?? null,
                    company_type_id: data.company_type_id,
                    plan: normalizedCommercialConfig.legacyPlan,
                    billingCycle: data.billingCycle,
                    pricePaid: normalizedPricePaid ?? null,
                    availableUntil: normalizedAvailableUntil,
                    isMarketplaceVisible: data.isMarketplaceVisible,
                },
            });
            const syncedCommercialConfig = await syncCompanyProducts({
                tx,
                companyId: shop.id,
                activeProducts: normalizedCommercialConfig.activeProducts.map((product) => ({
                    productCode: product.productCode,
                    tierCode: product.tierCode,
                    billingCycle: product.billingCycle,
                    pricePaid: product.pricePaid,
                    currency: product.currency,
                    availableUntil: product.availableUntil,
                })),
                requestedProducts: normalizedCommercialConfig.requestedProducts.map((product) => ({
                    productCode: product.productCode,
                    tierCode: product.tierCode,
                })),
                companyBillingCycle: data.billingCycle,
                companyPricePaid: normalizedPricePaid ?? null,
                companyCurrency: normalizedCurrency,
                companyAvailableUntil: normalizedAvailableUntil,
                legacyPlan: normalizedCommercialConfig.legacyPlan,
                actorUserId: changedByUserId,
                source: 'SUPER_ADMIN_CREATE_SHOP',
                note: data.note?.trim() || 'Shop created via super-admin',
            });
            if (data.restaurantEnabled) {
                await tx.company.update({
                    where: { id: shop.id },
                    data: { restaurant_enabled: true },
                });
                await tx.restaurantSettings.upsert({
                    where: { company_id: shop.id },
                    create: { company_id: shop.id },
                    update: {},
                });
            }
            await tx.companySubscriptionHistory.create({
                data: {
                    companyId: shop.id,
                    previousPlan: null,
                    newPlan: shop.plan,
                    previousBillingCycle: null,
                    newBillingCycle: shop.billingCycle,
                    previousPricePaid: null,
                    newPricePaid: shop.pricePaid,
                    previousAvailableUntil: null,
                    newAvailableUntil: shop.availableUntil,
                    previousMarketplaceVisible: null,
                    newMarketplaceVisible: shop.isMarketplaceVisible,
                    changedByUserId: changedByUserId ?? null,
                    note: data.note?.trim() || 'Shop created via super-admin',
                },
            });
            let ownerSummary = null;
            if (ownerInput) {
                let ownerUser = null;
                let ownerDisplayName = '';
                if (useExistingOwner) {
                    ownerUser = await tx.user.findFirst({
                        where: {
                            id: ownerExistingUserId,
                            deleted_at: null,
                        },
                        select: {
                            id: true,
                            email: true,
                            name: true,
                            first_name: true,
                            last_name: true,
                            phoneNumber: true,
                        },
                    });
                    if (!ownerUser) {
                        return {
                            error: true,
                            code: 404,
                            message: 'Selected owner user was not found',
                        };
                    }
                    const ownerNameFromUser = `${ownerUser.first_name ?? ''} ${ownerUser.last_name ?? ''}`.trim();
                    ownerDisplayName =
                        ownerInput.display_name?.trim() ||
                            ownerNameFromUser ||
                            ownerUser.name?.trim() ||
                            ownerUser.email.split('@')[0];
                }
                else {
                    const ownerPhoneCandidates = ownerPhone
                        ? (0, user_repo_1.buildPhoneLookupCandidates)(ownerPhone, ownerPhonePrefix)
                        : [];
                    const existingUserByPhone = ownerPhoneCandidates.length > 0
                        ? await tx.user.findFirst({
                            where: {
                                deleted_at: null,
                                phoneNumber: { in: ownerPhoneCandidates },
                            },
                        })
                        : null;
                    let ownerUserByEmail = await tx.user.findFirst({
                        where: {
                            email: ownerEmail,
                            deleted_at: null
                        }
                    });
                    if (!ownerUserByEmail && existingUserByPhone) {
                        return {
                            error: true,
                            code: 400,
                            message: 'Owner phone number is already in use by another user'
                        };
                    }
                    const ownerFirstName = ownerInput.first_name?.trim() || '';
                    const ownerLastName = ownerInput.last_name?.trim() || '';
                    const ownerNameFromParts = `${ownerFirstName} ${ownerLastName}`.trim();
                    ownerDisplayName =
                        ownerInput.display_name?.trim() ||
                            ownerNameFromParts ||
                            ownerEmail.split('@')[0];
                    if (!ownerUserByEmail) {
                        ownerUserByEmail = await tx.user.create({
                            data: {
                                email: ownerEmail,
                                first_name: ownerFirstName || null,
                                last_name: ownerLastName || null,
                                name: ownerDisplayName,
                                phone_prefix: ownerPhonePrefix,
                                phoneNumber: ownerPhone,
                                is_active: true,
                                emailVerified: true,
                                must_change_password: true
                            }
                        });
                    }
                    else {
                        if (ownerPhone &&
                            ownerUserByEmail.phoneNumber &&
                            !ownerPhoneCandidates.includes(ownerUserByEmail.phoneNumber)) {
                            return {
                                error: true,
                                code: 400,
                                message: 'Owner phone number is already configured on a different account'
                            };
                        }
                        if (existingUserByPhone && existingUserByPhone.id !== ownerUserByEmail.id) {
                            return {
                                error: true,
                                code: 400,
                                message: 'Owner phone number is already in use by another user'
                            };
                        }
                        ownerUserByEmail = await tx.user.update({
                            where: { id: ownerUserByEmail.id },
                            data: {
                                ...(ownerFirstName ? { first_name: ownerFirstName } : {}),
                                ...(ownerLastName ? { last_name: ownerLastName } : {}),
                                ...(ownerDisplayName ? { name: ownerDisplayName } : {}),
                                ...(!ownerUserByEmail.phoneNumber
                                    ? { phoneNumber: ownerPhone, phone_prefix: ownerPhonePrefix }
                                    : {})
                            }
                        });
                    }
                    const hashedOwnerPassword = await bcryptjs_1.default.hash(ownerPassword, 10);
                    const ownerAccounts = await tx.account.findMany({
                        where: {
                            providerId: { in: [...auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
                            accountId: ownerEmail
                        },
                        orderBy: { createdAt: 'asc' }
                    });
                    const ownerPrimaryAccount = ownerAccounts.find((a) => a.providerId === auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID) || ownerAccounts[0] || null;
                    if (ownerPrimaryAccount) {
                        await tx.account.update({
                            where: { id: ownerPrimaryAccount.id },
                            data: {
                                providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
                                accountId: ownerEmail,
                                userId: ownerUserByEmail.id,
                                password: hashedOwnerPassword
                            }
                        });
                        if (ownerAccounts.length > 1) {
                            await tx.account.deleteMany({
                                where: {
                                    providerId: { in: [...auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
                                    accountId: ownerEmail,
                                    id: { not: ownerPrimaryAccount.id }
                                }
                            });
                        }
                    }
                    else {
                        await tx.account.create({
                            data: {
                                providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
                                accountId: ownerEmail,
                                userId: ownerUserByEmail.id,
                                password: hashedOwnerPassword
                            }
                        });
                    }
                    await tx.user.update({
                        where: { id: ownerUserByEmail.id },
                        data: {
                            must_change_password: true,
                        },
                    });
                    ownerUser = {
                        id: ownerUserByEmail.id,
                        email: ownerUserByEmail.email,
                        name: ownerUserByEmail.name,
                        first_name: ownerUserByEmail.first_name,
                        last_name: ownerUserByEmail.last_name,
                        phoneNumber: ownerUserByEmail.phoneNumber,
                    };
                }
                if (!ownerUser) {
                    return {
                        error: true,
                        code: 400,
                        message: 'Owner profile could not be resolved',
                    };
                }
                const ownerAssignment = await (0, company_provisioning_service_1.assignOwnerToCompany)({
                    tx,
                    companyId: shop.id,
                    userId: ownerUser.id,
                    displayName: ownerDisplayName,
                    isBookable: ownerInput.is_bookable ?? false,
                });
                ownerSummary = {
                    company_user_id: ownerAssignment.companyUser.id,
                    user_id: ownerUser.id,
                    email: ownerUser.email,
                    role: ownerAssignment.companyUser.role
                };
            }
            return {
                error: false,
                shop,
                ownerSummary,
                commercialConfiguration: syncedCommercialConfig,
            };
        });
        if (result.error) {
            return {
                code: result.code,
                error: true,
                message: result.message
            };
        }
        const shop = result.shop;
        let ownerInviteStatus = null;
        if (!useExistingOwner) {
            ownerInviteStatus = await (0, sendEmail_1.sendAdminTempPasswordInviteEmail)({
                email: ownerEmail,
                temporaryPassword: ownerPassword,
                companyName: shop.name,
                companyId: shop.id,
                loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/login`,
            });
            if (ownerInviteStatus !== 1) {
                console.error(`Failed to send owner temp password invite to ${ownerEmail}`);
            }
        }
        return {
            code: 201,
            error: false,
            message: ownerInviteStatus === null || ownerInviteStatus === 1
                ? 'Shop created successfully'
                : 'Shop created successfully, but invite email could not be sent',
            data: {
                id: shop.id,
                slug: shop.slug,
                name: shop.name,
                address: shop.address,
                phone_prefix: shop.phone_prefix,
                phone: shop.phone,
                email: shop.email,
                city: shop.city,
                state: shop.state,
                country_code: shop.country_code,
                timezone: shop.timezone,
                currency: shop.currency,
                latitude: shop.latitude,
                longitude: shop.longitude,
                is_active: shop.is_active,
                plan: shop.plan,
                billingCycle: shop.billingCycle,
                pricePaid: shop.pricePaid,
                availableUntil: shop.availableUntil,
                isMarketplaceVisible: shop.isMarketplaceVisible,
                restaurant_enabled: Boolean(data.restaurantEnabled),
                company_type_id: shop.company_type_id,
                created_at: shop.created_at,
                updated_at: shop.updated_at,
                company_type: shop.company_type,
                owner: result.ownerSummary || undefined,
                activeProducts: result.commercialConfiguration.activeProducts.map((product) => (0, super_admin_shop_commercial_service_1.buildActiveProductSnapshot)(product)),
                requestedProducts: result.commercialConfiguration.requestedProducts,
                publicUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/shop/${shop.slug}`,
                adminUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/login`,
                ownerInviteSent: ownerInviteStatus === null ? useExistingOwner : ownerInviteStatus === 1,
            }
        };
    }
    catch (error) {
        console.error('Error creating shop:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to create shop'
        };
    }
}
/**
 * Update an existing shop
 */
async function updateShop(id, data, changedByUserId) {
    try {
        // Check if shop exists
        const existingShop = await client_1.prisma.company.findUnique({
            where: {
                id,
                deleted_at: null
            }
        });
        if (!existingShop) {
            return {
                code: 404,
                error: true,
                message: 'Shop not found'
            };
        }
        // If updating slug, check uniqueness
        if (data.slug && data.slug !== existingShop.slug) {
            const slugExists = await client_1.prisma.company.findFirst({
                where: {
                    slug: data.slug,
                    deleted_at: null,
                    NOT: {
                        id
                    }
                }
            });
            if (slugExists) {
                return {
                    code: 400,
                    error: true,
                    message: 'Slug already exists'
                };
            }
        }
        const normalizedAvailableUntil = data.availableUntil !== undefined
            ? parseDateTime(data.availableUntil)
            : undefined;
        if (data.availableUntil !== undefined && !normalizedAvailableUntil) {
            return {
                code: 400,
                error: true,
                message: 'availableUntil must be a valid datetime',
            };
        }
        const normalizedPricePaid = normalizePricePaid(data.pricePaid);
        if (data.pricePaid !== undefined && normalizedPricePaid === undefined) {
            return {
                code: 400,
                error: true,
                message: 'pricePaid must be a non-negative number',
            };
        }
        const normalizedCurrency = data.currency !== undefined ? normalizeCurrency(data.currency) : undefined;
        if (data.currency !== undefined && !normalizedCurrency) {
            return {
                code: 400,
                error: true,
                message: 'currency must be a non-empty string up to 3 characters',
            };
        }
        const nextBillingCycle = data.billingCycle ?? existingShop.billingCycle;
        const nextAvailableUntil = normalizedAvailableUntil ?? existingShop.availableUntil;
        const nextMarketplaceVisible = data.isMarketplaceVisible ?? existingShop.isMarketplaceVisible;
        const nextPricePaid = data.pricePaid !== undefined ? normalizedPricePaid ?? null : existingShop.pricePaid;
        const nextCurrency = normalizedCurrency ?? existingShop.currency;
        let normalizedCommercialConfig = null;
        if (data.activeProducts !== undefined) {
            try {
                normalizedCommercialConfig = (0, super_admin_shop_commercial_service_1.normalizeCommercialConfiguration)({
                    activeProducts: data.activeProducts,
                    requestedProducts: data.requestedProducts,
                    legacyPlan: data.plan ?? existingShop.plan,
                    companyBillingCycle: nextBillingCycle,
                    companyPricePaid: decimalLikeToNumber(nextPricePaid),
                    companyCurrency: nextCurrency,
                    companyAvailableUntil: nextAvailableUntil,
                });
            }
            catch (error) {
                return {
                    code: 400,
                    error: true,
                    message: error instanceof Error ? error.message : 'Invalid product configuration',
                };
            }
        }
        const nextRestaurantEnabled = data.restaurantEnabled ?? existingShop.restaurant_enabled;
        const restaurantEntitled = normalizedCommercialConfig
            ? hasRestaurantModuleEntitlement(normalizedCommercialConfig.activeProducts)
            : await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(id, 'RESTAURANT_MODULE');
        if (nextRestaurantEnabled && !restaurantEntitled) {
            return {
                code: 400,
                error: true,
                message: 'Restaurant Lite requires an active Restaurante product',
            };
        }
        // Generate slug if name is being updated and no slug provided
        const updateData = {};
        if (data.name !== undefined) {
            const normalizedName = normalizeRequiredText(data.name);
            updateData.name = normalizedName;
            if (data.slug === undefined) {
                updateData.slug = generateSlug(normalizedName);
            }
        }
        if (data.slug !== undefined) {
            updateData.slug = data.slug.trim();
        }
        if (data.address !== undefined)
            updateData.address = normalizeOptionalText(data.address);
        if (data.phone_prefix !== undefined)
            updateData.phone_prefix = normalizeOptionalText(data.phone_prefix) || '591';
        if (data.phone !== undefined)
            updateData.phone = normalizeRequiredText(data.phone);
        if (data.email !== undefined)
            updateData.email = normalizeOptionalText(data.email);
        if (data.city !== undefined)
            updateData.city = normalizeOptionalText(data.city);
        if (data.state !== undefined)
            updateData.state = normalizeOptionalText(data.state);
        if (data.country_code !== undefined)
            updateData.country_code = normalizeOptionalText(data.country_code);
        if (data.timezone !== undefined)
            updateData.timezone = normalizeOptionalText(data.timezone) || 'America/La_Paz';
        if (data.currency !== undefined && normalizedCurrency)
            updateData.currency = normalizedCurrency;
        if (data.latitude !== undefined)
            updateData.latitude = data.latitude;
        if (data.longitude !== undefined)
            updateData.longitude = data.longitude;
        if (data.company_type_id !== undefined)
            updateData.company_type_id = data.company_type_id;
        if (data.is_active !== undefined)
            updateData.is_active = data.is_active;
        if (normalizedCommercialConfig) {
            updateData.plan = normalizedCommercialConfig.legacyPlan;
        }
        else if (data.plan !== undefined) {
            updateData.plan = data.plan;
        }
        if (data.billingCycle !== undefined)
            updateData.billingCycle = data.billingCycle;
        if (data.availableUntil !== undefined && normalizedAvailableUntil) {
            updateData.availableUntil = normalizedAvailableUntil;
        }
        if (data.pricePaid !== undefined)
            updateData.pricePaid = normalizedPricePaid;
        if (data.isMarketplaceVisible !== undefined)
            updateData.isMarketplaceVisible = data.isMarketplaceVisible;
        if (data.restaurantEnabled !== undefined)
            updateData.restaurant_enabled = data.restaurantEnabled;
        const nextPlan = normalizedCommercialConfig?.legacyPlan ?? data.plan ?? existingShop.plan;
        const planChanged = nextPlan !== existingShop.plan;
        const billingCycleChanged = nextBillingCycle !== existingShop.billingCycle;
        const availableUntilChanged = nextAvailableUntil.getTime() !== existingShop.availableUntil.getTime();
        const marketplaceVisibilityChanged = nextMarketplaceVisible !== existingShop.isMarketplaceVisible;
        const pricePaidChanged = decimalLikeToString(nextPricePaid) !== decimalLikeToString(existingShop.pricePaid);
        const subscriptionFieldsChanged = planChanged ||
            billingCycleChanged ||
            availableUntilChanged ||
            marketplaceVisibilityChanged ||
            pricePaidChanged;
        const shop = await client_1.prisma.$transaction(async (tx) => {
            const updatedShop = await tx.company.update({
                where: { id },
                data: updateData,
                include: {
                    company_type: {
                        select: {
                            id: true,
                            name: true,
                            name_i18n: true
                        }
                    }
                }
            });
            let syncedCommercialConfiguration = normalizedCommercialConfig;
            if (normalizedCommercialConfig) {
                syncedCommercialConfiguration = await syncCompanyProducts({
                    tx,
                    companyId: updatedShop.id,
                    activeProducts: normalizedCommercialConfig.activeProducts.map((product) => ({
                        productCode: product.productCode,
                        tierCode: product.tierCode,
                        billingCycle: product.billingCycle,
                        pricePaid: product.pricePaid,
                        currency: product.currency,
                        availableUntil: product.availableUntil,
                    })),
                    requestedProducts: normalizedCommercialConfig.requestedProducts.map((product) => ({
                        productCode: product.productCode,
                        tierCode: product.tierCode,
                    })),
                    companyBillingCycle: updatedShop.billingCycle,
                    companyPricePaid: decimalLikeToNumber(updatedShop.pricePaid),
                    companyCurrency: updatedShop.currency,
                    companyAvailableUntil: updatedShop.availableUntil,
                    legacyPlan: normalizedCommercialConfig.legacyPlan,
                    actorUserId: changedByUserId,
                    source: 'SUPER_ADMIN_SHOP_EDIT',
                    note: data.note?.trim() || 'Updated via super-admin shop edit',
                });
            }
            if (data.restaurantEnabled) {
                await tx.restaurantSettings.upsert({
                    where: { company_id: updatedShop.id },
                    create: { company_id: updatedShop.id },
                    update: {},
                });
            }
            if (subscriptionFieldsChanged) {
                await tx.companySubscriptionHistory.create({
                    data: {
                        companyId: updatedShop.id,
                        previousPlan: existingShop.plan,
                        newPlan: updatedShop.plan,
                        previousBillingCycle: existingShop.billingCycle,
                        newBillingCycle: updatedShop.billingCycle,
                        previousPricePaid: existingShop.pricePaid,
                        newPricePaid: updatedShop.pricePaid,
                        previousAvailableUntil: existingShop.availableUntil,
                        newAvailableUntil: updatedShop.availableUntil,
                        previousMarketplaceVisible: existingShop.isMarketplaceVisible,
                        newMarketplaceVisible: updatedShop.isMarketplaceVisible,
                        changedByUserId: changedByUserId ?? null,
                        note: data.note?.trim() || 'Updated via super-admin shop edit',
                    }
                });
            }
            return {
                shop: updatedShop,
                commercialConfiguration: syncedCommercialConfiguration,
            };
        });
        return {
            code: 200,
            error: false,
            message: 'Shop updated successfully',
            data: {
                id: shop.shop.id,
                slug: shop.shop.slug,
                name: shop.shop.name,
                address: shop.shop.address,
                phone_prefix: shop.shop.phone_prefix,
                phone: shop.shop.phone,
                email: shop.shop.email,
                city: shop.shop.city,
                state: shop.shop.state,
                country_code: shop.shop.country_code,
                timezone: shop.shop.timezone,
                currency: shop.shop.currency,
                latitude: shop.shop.latitude,
                longitude: shop.shop.longitude,
                is_active: shop.shop.is_active,
                plan: shop.shop.plan,
                billingCycle: shop.shop.billingCycle,
                pricePaid: shop.shop.pricePaid,
                availableUntil: shop.shop.availableUntil,
                isMarketplaceVisible: shop.shop.isMarketplaceVisible,
                restaurant_enabled: shop.shop.restaurant_enabled,
                company_type_id: shop.shop.company_type_id,
                created_at: shop.shop.created_at,
                updated_at: shop.shop.updated_at,
                company_type: shop.shop.company_type,
                activeProducts: shop.commercialConfiguration?.activeProducts.map((product) => (0, super_admin_shop_commercial_service_1.buildActiveProductSnapshot)(product)) ?? undefined,
                requestedProducts: shop.commercialConfiguration?.requestedProducts ?? undefined,
            }
        };
    }
    catch (error) {
        console.error('Error updating shop:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to update shop'
        };
    }
}
/**
 * Soft delete a shop
 */
async function deleteShop(id) {
    try {
        const shop = await client_1.prisma.company.findUnique({
            where: {
                id,
                deleted_at: null
            }
        });
        if (!shop) {
            return {
                code: 404,
                error: true,
                message: 'Shop not found'
            };
        }
        await client_1.prisma.company.update({
            where: { id },
            data: {
                deleted_at: new Date()
            }
        });
        return {
            code: 200,
            error: false,
            message: 'Shop deleted successfully'
        };
    }
    catch (error) {
        console.error('Error deleting shop:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to delete shop'
        };
    }
}
/**
 * Get all users for a specific shop
 */
async function getShopUsers(shopId) {
    try {
        const companyUsers = await client_1.prisma.companyUser.findMany({
            where: {
                company_id: shopId,
                deleted_at: null
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        first_name: true,
                        last_name: true,
                        is_active: true,
                        createdAt: true
                    }
                }
            },
            orderBy: {
                created_at: 'desc'
            }
        });
        // Get staff profiles separately for each user
        const staffProfiles = await client_1.prisma.staffProfile.findMany({
            where: {
                company_id: shopId,
                deleted_at: null,
                user_id: {
                    in: companyUsers.map(cu => cu.user_id)
                }
            },
            select: {
                id: true,
                user_id: true,
                display_name: true,
                image_url: true,
                is_bookable: true,
                status: true,
                invite_token: true,
            }
        });
        // Map staff profiles to users
        const staffProfileMap = new Map(staffProfiles.map(sp => [sp.user_id, sp]));
        return {
            code: 200,
            error: false,
            message: 'Users retrieved successfully',
            data: companyUsers.map(cu => ({
                company_user_id: cu.id,
                role: cu.role,
                user: cu.user,
                staff_profile: staffProfileMap.get(cu.user_id) || null
            }))
        };
    }
    catch (error) {
        console.error('Error getting shop users:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to retrieve users'
        };
    }
}
/**
 * Add a user to a shop (create new or assign existing)
 */
async function addUserToShop(shopId, data) {
    try {
        const normalizedEmail = (data.email || '').trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const cleanPhone = (data.phone || '').replace(/\D/g, '');
        const cleanPhonePrefix = (data.phone_prefix || '591').replace(/\D/g, '') || '591';
        if (!normalizedEmail && !cleanPhone) {
            return {
                code: 400,
                error: true,
                message: 'At least one contact method is required (email or phone)'
            };
        }
        // Admin/staff panel users currently authenticate with email/password.
        if (!normalizedEmail) {
            return {
                code: 400,
                error: true,
                message: 'Email is required for shop users with panel access'
            };
        }
        if (!emailRegex.test(normalizedEmail)) {
            return {
                code: 400,
                error: true,
                message: 'Invalid email format'
            };
        }
        // Check if shop exists
        const shop = await client_1.prisma.company.findUnique({
            where: {
                id: shopId,
                deleted_at: null
            }
        });
        if (!shop) {
            return {
                code: 404,
                error: true,
                message: 'Shop not found'
            };
        }
        const isStaffSeatRole = data.role === client_2.CompanyUserRole.OWNER ||
            data.role === client_2.CompanyUserRole.ADMIN ||
            data.role === client_2.CompanyUserRole.STAFF;
        if (isStaffSeatRole) {
            const seatUsage = await (0, plan_enforcement_service_1.getStaffSeatUsageForCompany)(shopId);
            const canUseRolesPermissions = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(shopId, 'ROLES_PERMISSIONS');
            if (!canUseRolesPermissions && data.role !== client_2.CompanyUserRole.STAFF) {
                return {
                    code: 403,
                    error: true,
                    message: 'Available on the Business plan',
                };
            }
            if (seatUsage.maxStaffMembers !== null &&
                seatUsage.currentStaffMembers >= seatUsage.maxStaffMembers) {
                return {
                    code: 403,
                    error: true,
                    message: (0, plan_enforcement_service_1.buildStaffLimitReachedMessage)(),
                    data: {
                        currentPlan: seatUsage.currentPlan,
                        currentStaffMembers: seatUsage.currentStaffMembers,
                        maxStaffMembers: seatUsage.maxStaffMembers,
                    },
                };
            }
        }
        let user = await client_1.prisma.user.findFirst({
            where: {
                email: normalizedEmail,
                deleted_at: null
            }
        });
        const cleanPhoneCandidates = cleanPhone
            ? (0, user_repo_1.buildPhoneLookupCandidates)(cleanPhone, cleanPhonePrefix)
            : [];
        const userWithPhone = cleanPhone
            ? await client_1.prisma.user.findFirst({
                where: {
                    deleted_at: null,
                    phoneNumber: { in: cleanPhoneCandidates },
                }
            })
            : null;
        if (!user && userWithPhone) {
            return {
                code: 400,
                error: true,
                message: 'Phone number is already in use by another user'
            };
        }
        let tempPasswordForInvite = null;
        // Create user if doesn't exist
        if (!user) {
            if (!data.password) {
                return {
                    code: 400,
                    error: true,
                    message: 'Password is required for new users'
                };
            }
            const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
            tempPasswordForInvite = data.password;
            user = await client_1.prisma.user.create({
                data: {
                    email: normalizedEmail,
                    first_name: data.first_name || '',
                    last_name: data.last_name || '',
                    name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
                    phone_prefix: cleanPhone ? cleanPhonePrefix : undefined,
                    phoneNumber: cleanPhone || undefined,
                    must_change_password: true,
                }
            });
            // Create Account record for Better Auth email/password login
            await client_1.prisma.account.create({
                data: {
                    userId: user.id,
                    providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
                    accountId: normalizedEmail,
                    password: hashedPassword,
                }
            });
        }
        else if (data.password) {
            const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
            tempPasswordForInvite = data.password;
            const existingCredentialAccount = await client_1.prisma.account.findFirst({
                where: {
                    userId: user.id,
                    providerId: { in: [...auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_IDS] },
                },
                orderBy: {
                    createdAt: 'asc',
                },
            });
            if (existingCredentialAccount) {
                await client_1.prisma.account.update({
                    where: { id: existingCredentialAccount.id },
                    data: {
                        providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
                        accountId: normalizedEmail,
                        password: hashedPassword,
                    },
                });
            }
            else {
                await client_1.prisma.account.create({
                    data: {
                        userId: user.id,
                        providerId: auth_constants_1.BETTER_AUTH_CREDENTIAL_PROVIDER_ID,
                        accountId: normalizedEmail,
                        password: hashedPassword,
                    },
                });
            }
            await client_1.prisma.user.update({
                where: { id: user.id },
                data: {
                    must_change_password: true,
                },
            });
        }
        else if (cleanPhone && !user.phoneNumber) {
            if (userWithPhone && userWithPhone.id !== user.id) {
                return {
                    code: 400,
                    error: true,
                    message: 'Phone number is already in use by another user'
                };
            }
            user = await client_1.prisma.user.update({
                where: { id: user.id },
                data: {
                    phone_prefix: cleanPhonePrefix,
                    phoneNumber: cleanPhone
                }
            });
        }
        // Check if user is already assigned to this shop
        const existingAssignment = await client_1.prisma.companyUser.findFirst({
            where: {
                company_id: shopId,
                user_id: user.id,
                deleted_at: null
            }
        });
        if (existingAssignment) {
            return {
                code: 400,
                error: true,
                message: 'User is already assigned to this shop'
            };
        }
        // Create CompanyUser assignment
        await (0, demo_operator_membership_service_1.assertDemoOperatorMayJoinCompany)(client_1.prisma, user.id, shopId);
        const companyUser = await client_1.prisma.companyUser.create({
            data: {
                company_id: shopId,
                user_id: user.id,
                role: data.role
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        first_name: true,
                        last_name: true
                    }
                }
            }
        });
        // Create StaffProfile if role is OWNER, ADMIN, or STAFF
        if (isStaffSeatRole) {
            const staffProfile = await client_1.prisma.staffProfile.create({
                data: {
                    company_id: shopId,
                    user_id: user.id,
                    display_name: data.display_name || user.name,
                    is_bookable: data.is_bookable ?? true
                }
            });
            await (0, staff_availability_defaults_service_1.ensureDefaultStaffAvailabilityFromCompanyHours)({
                companyId: shopId,
                staffId: staffProfile.id,
            });
        }
        if (tempPasswordForInvite) {
            const inviteStatus = await (0, sendEmail_1.sendAdminTempPasswordInviteEmail)({
                email: normalizedEmail,
                temporaryPassword: tempPasswordForInvite,
                companyName: shop.name,
                companyId: shopId,
                loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/login`,
            });
            if (inviteStatus !== 1) {
                console.error(`Failed to send temp password invite to ${normalizedEmail}`);
            }
        }
        return {
            code: 201,
            error: false,
            message: 'User added to shop successfully',
            data: {
                company_user_id: companyUser.id,
                role: companyUser.role,
                user_id: user.id,
                user: companyUser.user
            }
        };
    }
    catch (error) {
        console.error('Error adding user to shop:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to add user to shop'
        };
    }
}
/**
 * Update user role in a shop
 */
async function updateUserRoleInShop(companyUserId, role) {
    try {
        const companyUser = await client_1.prisma.companyUser.findUnique({
            where: {
                id: companyUserId,
                deleted_at: null
            }
        });
        if (!companyUser) {
            return {
                code: 404,
                error: true,
                message: 'User assignment not found'
            };
        }
        const targetIsStaffSeat = role === client_2.CompanyUserRole.OWNER ||
            role === client_2.CompanyUserRole.ADMIN ||
            role === client_2.CompanyUserRole.STAFF;
        const currentIsStaffSeat = companyUser.role === client_2.CompanyUserRole.OWNER ||
            companyUser.role === client_2.CompanyUserRole.ADMIN ||
            companyUser.role === client_2.CompanyUserRole.STAFF;
        if (targetIsStaffSeat) {
            const seatUsage = await (0, plan_enforcement_service_1.getStaffSeatUsageForCompany)(companyUser.company_id);
            const canUseRolesPermissions = await (0, plan_enforcement_service_1.isFeatureEnabledForCompany)(companyUser.company_id, 'ROLES_PERMISSIONS');
            if (!canUseRolesPermissions && role !== client_2.CompanyUserRole.STAFF) {
                return {
                    code: 403,
                    error: true,
                    message: 'Available on the Business plan',
                };
            }
            if (!currentIsStaffSeat &&
                seatUsage.maxStaffMembers !== null &&
                seatUsage.currentStaffMembers >= seatUsage.maxStaffMembers) {
                return {
                    code: 403,
                    error: true,
                    message: (0, plan_enforcement_service_1.buildStaffLimitReachedMessage)(),
                    data: {
                        currentPlan: seatUsage.currentPlan,
                        currentStaffMembers: seatUsage.currentStaffMembers,
                        maxStaffMembers: seatUsage.maxStaffMembers,
                    },
                };
            }
        }
        const updated = await client_1.prisma.companyUser.update({
            where: { id: companyUserId },
            data: { role }
        });
        return {
            code: 200,
            error: false,
            message: 'User role updated successfully',
            data: {
                company_user_id: updated.id,
                role: updated.role
            }
        };
    }
    catch (error) {
        console.error('Error updating user role:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to update user role'
        };
    }
}
/**
 * Resend invitation email for a pending shop user
 */
async function resendPendingUserInvite(shopId, companyUserId) {
    try {
        const assignment = await client_1.prisma.companyUser.findFirst({
            where: {
                id: companyUserId,
                company_id: shopId,
                deleted_at: null,
            },
            select: {
                id: true,
                company_id: true,
                user_id: true,
            },
        });
        if (!assignment) {
            return {
                code: 404,
                error: true,
                message: 'User assignment not found',
            };
        }
        const staffProfile = await client_1.prisma.staffProfile.findFirst({
            where: {
                company_id: shopId,
                user_id: assignment.user_id,
                deleted_at: null,
            },
            select: {
                id: true,
            },
        });
        if (!staffProfile) {
            return {
                code: 400,
                error: true,
                message: 'This user does not have a staff invitation to resend',
            };
        }
        return await StaffService.resendStaffInvite(shopId, staffProfile.id);
    }
    catch (error) {
        console.error('Error resending pending user invite:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to resend invite',
        };
    }
}
/**
 * Remove user from a shop
 */
async function removeUserFromShop(companyUserId) {
    try {
        const companyUser = await client_1.prisma.companyUser.findUnique({
            where: {
                id: companyUserId,
                deleted_at: null
            }
        });
        if (!companyUser) {
            return {
                code: 404,
                error: true,
                message: 'User assignment not found'
            };
        }
        // Check if user has a staff profile
        const staffProfile = await client_1.prisma.staffProfile.findFirst({
            where: {
                company_id: companyUser.company_id,
                user_id: companyUser.user_id,
                deleted_at: null
            }
        });
        // Soft delete StaffProfile if exists
        if (staffProfile) {
            await client_1.prisma.staffProfile.update({
                where: { id: staffProfile.id },
                data: { deleted_at: new Date() }
            });
        }
        // Delete CompanyUser record
        await client_1.prisma.companyUser.update({
            where: { id: companyUserId },
            data: { deleted_at: new Date() }
        });
        return {
            code: 200,
            error: false,
            message: 'User removed from shop successfully'
        };
    }
    catch (error) {
        console.error('Error removing user from shop:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to remove user from shop'
        };
    }
}
/**
 * Get all company types
 */
async function getCompanyTypes() {
    try {
        const companyTypes = await client_1.prisma.companyType.findMany({
            where: {
                is_active: true
            },
            select: {
                id: true,
                key: true,
                name: true,
                name_i18n: true
            },
            orderBy: {
                name: 'asc'
            }
        });
        return {
            code: 200,
            error: false,
            message: 'Company types retrieved successfully',
            data: companyTypes
        };
    }
    catch (error) {
        console.error('Error getting company types:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to retrieve company types'
        };
    }
}
/**
 * Allow super admin to impersonate a shop
 */
async function impersonateShop(shopId, superAdminUser, headers) {
    try {
        const auth = await (0, auth_1.getAuth)();
        // Check if shop exists
        const shop = await client_1.prisma.company.findUnique({
            where: {
                id: shopId,
                deleted_at: null
            }
        });
        if (!shop) {
            return {
                code: 404,
                error: true,
                message: 'Shop not found'
            };
        }
        // Create or update a temporary CompanyUser record for impersonation
        await (0, demo_operator_membership_service_1.assertDemoOperatorMayJoinCompany)(client_1.prisma, superAdminUser.id, shopId);
        const companyUser = await client_1.prisma.companyUser.upsert({
            where: {
                company_id_user_id_role: {
                    company_id: shopId,
                    user_id: superAdminUser.id,
                    role: client_2.CompanyUserRole.OWNER
                }
            },
            update: {
                deleted_at: null
            },
            create: {
                company_id: shopId,
                user_id: superAdminUser.id,
                role: client_2.CompanyUserRole.OWNER
            },
            include: {
                company: {
                    select: {
                        id: true,
                        slug: true,
                        name: true
                    }
                }
            }
        });
        // Create a new session for the impersonated user
        const session = await auth.api.getSession({
            headers: headers
        });
        if (!session) {
            return {
                code: 401,
                error: true,
                message: 'No active session found'
            };
        }
        // The existing session is already valid, we just need to return the company user info
        return {
            code: 200,
            error: false,
            message: 'Impersonation session created',
            data: {
                user: superAdminUser,
                companyUser: companyUser
            }
        };
    }
    catch (error) {
        console.error('Error impersonating shop:', error);
        return {
            code: 500,
            error: true,
            message: 'Failed to create impersonation session'
        };
    }
}
