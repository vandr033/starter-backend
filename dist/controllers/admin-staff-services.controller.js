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
exports.getStaffServices = getStaffServices;
exports.updateStaffServices = updateStaffServices;
const StaffService = __importStar(require("../services/staff.service"));
let mensaje;
/**
 * GET /api/admin/staff/:id/services
 * Get services assigned to a staff member
 */
async function getStaffServices(req, res) {
    const companyId = req.companyID;
    const staffId = parseInt(req.params.id, 10);
    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    if (isNaN(staffId)) {
        mensaje = {
            code: 400,
            message: 'Invalid staff ID',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    const result = await StaffService.getStaffServices(companyId, staffId);
    return res.status(result.code).json(result);
}
/**
 * PUT /api/admin/staff/:id/services
 * Update services assigned to a staff member
 */
async function updateStaffServices(req, res) {
    const companyId = req.companyID;
    const staffId = parseInt(req.params.id, 10);
    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    if (isNaN(staffId)) {
        mensaje = {
            code: 400,
            message: 'Invalid staff ID',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    const { service_ids } = req.body;
    // Validate service_ids
    if (!Array.isArray(service_ids)) {
        mensaje = {
            code: 400,
            message: 'service_ids must be an array',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    // Check all items are numbers
    const nonNumberIds = service_ids.filter((id) => typeof id !== 'number' || isNaN(id));
    if (nonNumberIds.length > 0) {
        mensaje = {
            code: 400,
            message: 'All service_ids must be numbers',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    const result = await StaffService.updateStaffServices(companyId, staffId, service_ids);
    return res.status(result.code).json(result);
}
