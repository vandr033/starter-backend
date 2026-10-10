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
exports.getHours = getHours;
exports.updateHours = updateHours;
const HoursService = __importStar(require("../services/hours.service"));
let mensaje;
/**
 * GET /api/admin/hours
 * Get all hours for the admin's company
 */
async function getHours(req, res) {
    const companyId = req.companyID;
    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    const result = await HoursService.getHours(companyId);
    return res.status(result.code).json(result);
}
/**
 * PUT /api/admin/hours
 * Batch update all hours for the admin's company
 */
async function updateHours(req, res) {
    const companyId = req.companyID;
    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    const { hours } = req.body;
    // Basic validation
    if (!hours) {
        mensaje = {
            code: 400,
            message: 'hours field is required',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    const result = await HoursService.updateHours(companyId, { hours });
    return res.status(result.code).json(result);
}
