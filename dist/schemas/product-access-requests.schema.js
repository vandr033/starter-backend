"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProductAccessRequestSchema = exports.createProductAccessRequestSchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
exports.createProductAccessRequestSchema = zod_1.z.object({
    productCode: zod_1.z.nativeEnum(client_1.ProductCode),
    tierCode: zod_1.z.nativeEnum(client_1.ProductTierCode),
    capability: zod_1.z.nativeEnum(client_1.ProductCapabilityCode).optional(),
    message: zod_1.z.string().trim().max(500).optional(),
    source: zod_1.z.nativeEnum(client_1.ProductAccessRequestSource),
});
exports.resolveProductAccessRequestSchema = zod_1.z.object({
    internalNote: zod_1.z.string().trim().max(500).optional(),
});
