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
exports.getAllShops = getAllShops;
exports.getShopById = getShopById;
exports.searchUsersForOwner = searchUsersForOwner;
exports.getShopSubscriptionHistory = getShopSubscriptionHistory;
exports.createShop = createShop;
exports.updateShop = updateShop;
exports.deleteShop = deleteShop;
exports.getShopUsers = getShopUsers;
exports.addUserToShop = addUserToShop;
exports.updateUserRoleInShop = updateUserRoleInShop;
exports.removeUserFromShop = removeUserFromShop;
exports.resendPendingUserInvite = resendPendingUserInvite;
exports.getCompanyTypes = getCompanyTypes;
exports.impersonateShop = impersonateShop;
const SuperAdminShopsService = __importStar(require("../services/super-admin-shops.service"));
const active_shop_cookie_1 = require("../utils/active-shop-cookie");
let mensaje;
function firstQueryString(value) {
    if (typeof value === 'string')
        return value;
    if (Array.isArray(value) && typeof value[0] === 'string')
        return value[0];
    return undefined;
}
/**
 * GET /api/super-admin/shops
 * Get all shops with pagination and search
 */
async function getAllShops(req, res) {
    try {
        const { search, page, limit } = req.query;
        const searchValue = firstQueryString(search);
        const pageValue = firstQueryString(page) ?? '1';
        const limitValue = firstQueryString(limit) ?? '20';
        const result = await SuperAdminShopsService.getAllShops({
            search: searchValue,
            page: parseInt(pageValue),
            limit: parseInt(limitValue)
        });
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in getAllShops:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error'
        });
    }
}
/**
 * GET /api/super-admin/shops/:id
 * Get single shop by ID
 */
async function getShopById(req, res) {
    try {
        const { id } = req.params;
        const result = await SuperAdminShopsService.getShopById(parseInt(Array.isArray(id) ? id[0] : id));
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in getShopById:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error'
        });
    }
}
/**
 * GET /api/super-admin/users/search
 * Search existing users to assign as owner during shop creation
 */
async function searchUsersForOwner(req, res) {
    try {
        const query = firstQueryString(req.query.q);
        const limitRaw = firstQueryString(req.query.limit) ?? '20';
        const limit = Number.parseInt(limitRaw, 10);
        const result = await SuperAdminShopsService.searchUsersForOwner(query, Number.isInteger(limit) ? limit : 20);
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in searchUsersForOwner:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error',
        });
    }
}
/**
 * GET /api/super-admin/shops/:id/subscription-history
 * Get subscription history for a specific shop
 */
async function getShopSubscriptionHistory(req, res) {
    try {
        const { id } = req.params;
        const result = await SuperAdminShopsService.getShopSubscriptionHistory(parseInt(Array.isArray(id) ? id[0] : id));
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in getShopSubscriptionHistory:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error',
        });
    }
}
/**
 * POST /api/super-admin/shops
 * Create a new shop
 */
async function createShop(req, res) {
    try {
        const shopData = req.validated || req.body;
        const changedByUserId = req.authUser?.id;
        const result = await SuperAdminShopsService.createShop(shopData, changedByUserId);
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in createShop:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error'
        });
    }
}
/**
 * PUT /api/super-admin/shops/:id
 * Update an existing shop
 */
async function updateShop(req, res) {
    try {
        const { id } = req.params;
        const updateData = req.validated || req.body;
        const changedByUserId = req.authUser?.id;
        const result = await SuperAdminShopsService.updateShop(parseInt(Array.isArray(id) ? id[0] : id), updateData, changedByUserId);
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in updateShop:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error'
        });
    }
}
/**
 * DELETE /api/super-admin/shops/:id
 * Soft delete a shop
 */
async function deleteShop(req, res) {
    try {
        const { id } = req.params;
        const result = await SuperAdminShopsService.deleteShop(parseInt(Array.isArray(id) ? id[0] : id));
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in deleteShop:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error'
        });
    }
}
/**
 * GET /api/super-admin/shops/:id/users
 * Get all users for a specific shop
 */
async function getShopUsers(req, res) {
    try {
        const { id } = req.params;
        const result = await SuperAdminShopsService.getShopUsers(parseInt(Array.isArray(id) ? id[0] : id));
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in getShopUsers:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error'
        });
    }
}
/**
 * POST /api/super-admin/shops/:id/users
 * Add a user to a shop (create new user or assign existing)
 */
async function addUserToShop(req, res) {
    try {
        const { id } = req.params;
        const userData = req.body;
        const result = await SuperAdminShopsService.addUserToShop(parseInt(Array.isArray(id) ? id[0] : id), userData);
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in addUserToShop:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error'
        });
    }
}
/**
 * PUT /api/super-admin/shops/:shopId/users/:companyUserId
 * Update user role in a shop
 */
async function updateUserRoleInShop(req, res) {
    try {
        const { shopId, companyUserId } = req.params;
        const { role } = req.body;
        const result = await SuperAdminShopsService.updateUserRoleInShop(parseInt(Array.isArray(companyUserId) ? companyUserId[0] : companyUserId), role);
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in updateUserRoleInShop:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error'
        });
    }
}
/**
 * DELETE /api/super-admin/shops/:shopId/users/:companyUserId
 * Remove user from a shop
 */
async function removeUserFromShop(req, res) {
    try {
        const { shopId, companyUserId } = req.params;
        const result = await SuperAdminShopsService.removeUserFromShop(parseInt(Array.isArray(companyUserId) ? companyUserId[0] : companyUserId));
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in removeUserFromShop:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error'
        });
    }
}
/**
 * POST /api/super-admin/shops/:shopId/users/:companyUserId/resend-invite
 * Resend invitation email for a pending shop user
 */
async function resendPendingUserInvite(req, res) {
    try {
        const { shopId, companyUserId } = req.params;
        const parsedShopId = parseInt(Array.isArray(shopId) ? shopId[0] : shopId);
        const parsedCompanyUserId = parseInt(Array.isArray(companyUserId) ? companyUserId[0] : companyUserId);
        if (Number.isNaN(parsedShopId) || Number.isNaN(parsedCompanyUserId)) {
            return res.status(400).json({
                code: 400,
                error: true,
                message: 'Invalid shop or user assignment id',
            });
        }
        const result = await SuperAdminShopsService.resendPendingUserInvite(parsedShopId, parsedCompanyUserId);
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in resendPendingUserInvite:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error'
        });
    }
}
/**
 * GET /api/super-admin/company-types
 * Get all company types
 */
async function getCompanyTypes(req, res) {
    try {
        const result = await SuperAdminShopsService.getCompanyTypes();
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in getCompanyTypes:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error'
        });
    }
}
/**
 * POST /api/super-admin/impersonate/:shopId
 * Allow super admin to impersonate a shop
 */
async function impersonateShop(req, res) {
    try {
        const { shopId } = req.params;
        const superAdminUser = req.authUser;
        if (!superAdminUser) {
            return res.status(401).json({
                code: 401,
                error: true,
                message: 'Unauthorized'
            });
        }
        const parsedShopId = parseInt(Array.isArray(shopId) ? shopId[0] : shopId);
        const result = await SuperAdminShopsService.impersonateShop(parsedShopId, superAdminUser, req.headers);
        // Set the active company cookie so the dashboard loads the correct shop
        if (!result.error) {
            (0, active_shop_cookie_1.setActiveCompanyCookie)(res, parsedShopId);
        }
        return res.status(result.code).json({
            code: result.code,
            error: result.error,
            message: result.message,
            data: result.data
        });
    }
    catch (error) {
        console.error('Error in impersonateShop:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error'
        });
    }
}
