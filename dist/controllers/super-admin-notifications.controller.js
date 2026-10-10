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
exports.sendTestEmailNotification = sendTestEmailNotification;
exports.sendTestWhatsappNotification = sendTestWhatsappNotification;
const SuperAdminNotificationsService = __importStar(require("../services/super-admin-notifications.service"));
function getOptionalString(value) {
    return typeof value === 'string' ? value : undefined;
}
function resolveRequestedBy(req) {
    return {
        id: typeof req.authUser?.id === 'string' ? req.authUser.id : undefined,
        name: typeof req.authUser?.name === 'string' ? req.authUser.name : null,
        email: typeof req.authUser?.email === 'string' ? req.authUser.email : null,
    };
}
/**
 * POST /api/super-admin/notifications/test/email
 * Send a test email to validate outbound delivery.
 */
async function sendTestEmailNotification(req, res) {
    try {
        const body = (req.body && typeof req.body === 'object' ? req.body : {});
        const result = await SuperAdminNotificationsService.sendTestEmailNotification({
            email: getOptionalString(body.email),
            subject: getOptionalString(body.subject),
            message: getOptionalString(body.message),
            requestedBy: resolveRequestedBy(req),
        });
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in sendTestEmailNotification:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error',
        });
    }
}
/**
 * POST /api/super-admin/notifications/test/whatsapp
 * Send a test WhatsApp message to validate outbound delivery.
 */
async function sendTestWhatsappNotification(req, res) {
    try {
        const body = (req.body && typeof req.body === 'object' ? req.body : {});
        const result = await SuperAdminNotificationsService.sendTestWhatsappNotification({
            phoneNumber: getOptionalString(body.phoneNumber) ?? getOptionalString(body.number),
            message: getOptionalString(body.message),
            requestedBy: resolveRequestedBy(req),
        });
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in sendTestWhatsappNotification:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error',
        });
    }
}
