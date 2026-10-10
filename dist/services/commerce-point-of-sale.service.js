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
exports.listAdminCommercePointsOfSale = listAdminCommercePointsOfSale;
exports.createAdminCommercePointOfSale = createAdminCommercePointOfSale;
exports.updateAdminCommercePointOfSale = updateAdminCommercePointOfSale;
exports.deleteAdminCommercePointOfSale = deleteAdminCommercePointOfSale;
const client_1 = require("../prisma/client");
const CommerceRepo = __importStar(require("../repositories/commerce.repo"));
const coordinates_1 = require("../utils/coordinates");
function serializePointOfSale(pointOfSale) {
    const coordinates = (0, coordinates_1.getValidCoordinates)(pointOfSale.latitude, pointOfSale.longitude);
    return {
        ...pointOfSale,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
    };
}
async function listAdminCommercePointsOfSale(companyId) {
    const points = await CommerceRepo.listAdminCommercePointsOfSale(companyId);
    return {
        code: 200,
        error: false,
        message: 'Puntos de venta obtenidos correctamente.',
        data: points.map(serializePointOfSale),
    };
}
async function createAdminCommercePointOfSale(companyId, input) {
    const store = await CommerceRepo.getOrCreateCommerceStore(companyId);
    const created = await client_1.prisma.commercePointOfSale.create({
        data: {
            company_id: companyId,
            store_id: store.id,
            name: input.name.trim(),
            address: input.address.trim(),
            opening_time: input.opening_time.trim(),
            closing_time: input.closing_time.trim(),
            latitude: input.latitude,
            longitude: input.longitude,
            google_maps_url: input.google_maps_url.trim(),
            notes: input.notes?.trim() || null,
            is_active: input.is_active ?? true,
            sort_order: input.sort_order ?? 0,
        },
    });
    return {
        code: 201,
        error: false,
        message: 'Punto de venta creado correctamente.',
        data: serializePointOfSale(created),
    };
}
async function updateAdminCommercePointOfSale(companyId, pointOfSaleId, input) {
    const existing = await CommerceRepo.getAdminCommercePointOfSale(companyId, pointOfSaleId);
    if (!existing) {
        return { code: 404, error: true, message: 'No encontramos el punto de venta.' };
    }
    const updated = await client_1.prisma.commercePointOfSale.update({
        where: { id: existing.id },
        data: {
            name: input.name?.trim(),
            address: input.address?.trim(),
            opening_time: input.opening_time?.trim(),
            closing_time: input.closing_time?.trim(),
            latitude: input.latitude,
            longitude: input.longitude,
            google_maps_url: input.google_maps_url?.trim(),
            notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
            is_active: input.is_active,
            sort_order: input.sort_order,
        },
    });
    return {
        code: 200,
        error: false,
        message: 'Punto de venta actualizado correctamente.',
        data: serializePointOfSale(updated),
    };
}
async function deleteAdminCommercePointOfSale(companyId, pointOfSaleId) {
    const existing = await CommerceRepo.getAdminCommercePointOfSale(companyId, pointOfSaleId);
    if (!existing) {
        return { code: 404, error: true, message: 'No encontramos el punto de venta.' };
    }
    await client_1.prisma.commercePointOfSale.delete({
        where: { id: existing.id },
    });
    return {
        code: 200,
        error: false,
        message: 'Punto de venta eliminado correctamente.',
        data: { id: existing.id },
    };
}
