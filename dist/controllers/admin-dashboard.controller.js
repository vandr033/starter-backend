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
exports.getMetrics = void 0;
const DashboardService = __importStar(require("../services/dashboard.service"));
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const getMetrics = async (req, res) => {
    const companyId = req.companyID;
    const companyUser = req.companyUser;
    const userId = req.authUser?.id;
    let staffId;
    if (companyUser?.role === client_1.CompanyUserRole.STAFF) {
        if (!userId) {
            return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
        }
        const staffProfile = await client_2.prisma.staffProfile.findFirst({
            where: {
                company_id: companyId,
                user_id: userId,
                deleted_at: null,
            },
            select: { id: true },
        });
        if (!staffProfile) {
            return res.status(403).json({ code: 403, error: true, message: 'Staff profile not found in this company' });
        }
        staffId = staffProfile.id;
    }
    const result = await DashboardService.getDashboardMetrics(companyId, staffId);
    res.status(result.code).json(result);
};
exports.getMetrics = getMetrics;
