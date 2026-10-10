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
exports.getWahaStatus = getWahaStatus;
exports.getWahaQr = getWahaQr;
exports.startWahaSession = startWahaSession;
exports.restartWahaSession = restartWahaSession;
exports.logoutWahaSession = logoutWahaSession;
const WahaAdminService = __importStar(require("../services/waha-admin.service"));
async function getWahaStatus(_req, res) {
    try {
        const result = await WahaAdminService.getSessionStatus();
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in getWahaStatus:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error',
        });
    }
}
async function getWahaQr(_req, res) {
    try {
        const result = await WahaAdminService.getQRCode();
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in getWahaQr:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error',
        });
    }
}
async function startWahaSession(_req, res) {
    try {
        const result = await WahaAdminService.startSession();
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in startWahaSession:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error',
        });
    }
}
async function restartWahaSession(_req, res) {
    try {
        const result = await WahaAdminService.restartSession();
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in restartWahaSession:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error',
        });
    }
}
async function logoutWahaSession(_req, res) {
    try {
        const result = await WahaAdminService.logoutSession();
        return res.status(result.code).json(result);
    }
    catch (error) {
        console.error('Error in logoutWahaSession:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error',
        });
    }
}
