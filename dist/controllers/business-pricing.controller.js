"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicPricing = getPublicPricing;
exports.getSuperAdminPricing = getSuperAdminPricing;
exports.getSuperAdminFeatures = getSuperAdminFeatures;
exports.updateSuperAdminProductPricing = updateSuperAdminProductPricing;
exports.updateSuperAdminDiscountPricing = updateSuperAdminDiscountPricing;
exports.updateSuperAdminPricingSettings = updateSuperAdminPricingSettings;
const business_pricing_schema_1 = require("../schemas/business-pricing.schema");
const business_pricing_service_1 = require("../services/business-pricing.service");
function validationErrorResponse(res, message, errors) {
    return res.status(400).json({
        code: 400,
        error: true,
        message,
        errors,
    });
}
function unknownErrorResponse(res, error, fallbackMessage) {
    console.error(fallbackMessage, error);
    return res.status(500).json({
        code: 500,
        error: true,
        message: fallbackMessage,
    });
}
async function getPublicPricing(_req, res) {
    try {
        const data = await (0, business_pricing_service_1.getPublicBusinessPricing)();
        return res.status(200).json(data);
    }
    catch (error) {
        return unknownErrorResponse(res, error, 'No pudimos cargar la configuración pública de precios.');
    }
}
async function getSuperAdminPricing(_req, res) {
    try {
        const data = await (0, business_pricing_service_1.getSuperAdminBusinessPricing)();
        return res.status(200).json({
            code: 200,
            error: false,
            data,
        });
    }
    catch (error) {
        return unknownErrorResponse(res, error, 'No pudimos cargar la configuración de precios.');
    }
}
async function getSuperAdminFeatures(_req, res) {
    try {
        const data = await (0, business_pricing_service_1.getSuperAdminProductFeatures)();
        return res.status(200).json({
            code: 200,
            error: false,
            data,
        });
    }
    catch (error) {
        return unknownErrorResponse(res, error, 'No pudimos cargar las funciones por producto.');
    }
}
async function updateSuperAdminProductPricing(req, res) {
    const parsedKey = business_pricing_schema_1.businessPricingProductKeySchema.safeParse(req.params.productKey);
    if (!parsedKey.success) {
        return validationErrorResponse(res, 'Producto inválido.', parsedKey.error.flatten());
    }
    const parsedBody = business_pricing_schema_1.updateBusinessPricingProductSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return validationErrorResponse(res, 'Revisá los datos del producto.', parsedBody.error.flatten());
    }
    try {
        const data = await (0, business_pricing_service_1.updateBusinessPricingProduct)(parsedKey.data, parsedBody.data);
        return res.status(200).json({
            code: 200,
            error: false,
            message: 'Precios actualizados',
            data,
        });
    }
    catch (error) {
        return unknownErrorResponse(res, error, 'No pudimos actualizar el producto.');
    }
}
async function updateSuperAdminDiscountPricing(req, res) {
    const parsedBody = business_pricing_schema_1.updateBusinessPricingDiscountsSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return validationErrorResponse(res, 'Revisá la configuración de descuentos y prueba gratis.', parsedBody.error.flatten());
    }
    try {
        const data = await (0, business_pricing_service_1.updateBusinessPricingDiscounts)(parsedBody.data);
        return res.status(200).json({
            code: 200,
            error: false,
            message: 'Precios actualizados',
            data,
        });
    }
    catch (error) {
        return unknownErrorResponse(res, error, 'No pudimos actualizar los descuentos por combo.');
    }
}
async function updateSuperAdminPricingSettings(req, res) {
    const parsedBody = business_pricing_schema_1.updateBusinessPricingSettingsSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return validationErrorResponse(res, 'Revisá la configuración anual y de prueba gratis.', parsedBody.error.flatten());
    }
    try {
        const data = await (0, business_pricing_service_1.updateBusinessPricingSettings)(parsedBody.data);
        return res.status(200).json({
            code: 200,
            error: false,
            message: 'Precios actualizados',
            data,
        });
    }
    catch (error) {
        return unknownErrorResponse(res, error, 'No pudimos actualizar la configuración anual y de prueba.');
    }
}
