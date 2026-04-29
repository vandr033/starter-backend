import type { Request, Response } from 'express';
import {
    businessPricingProductKeySchema,
    updateBusinessPricingDiscountsSchema,
    updateBusinessPricingProductSchema,
    updateBusinessPricingSettingsSchema,
} from '../schemas/business-pricing.schema';
import {
    getPublicBusinessPricing,
    getSuperAdminBusinessPricing,
    getSuperAdminProductFeatures,
    updateBusinessPricingDiscounts,
    updateBusinessPricingProduct,
    updateBusinessPricingSettings,
} from '../services/business-pricing.service';

function validationErrorResponse(res: Response, message: string, errors: unknown) {
    return res.status(400).json({
        code: 400,
        error: true,
        message,
        errors,
    });
}

function unknownErrorResponse(res: Response, error: unknown, fallbackMessage: string) {
    console.error(fallbackMessage, error);
    return res.status(500).json({
        code: 500,
        error: true,
        message: fallbackMessage,
    });
}

export async function getPublicPricing(_req: Request, res: Response) {
    try {
        const data = await getPublicBusinessPricing();
        return res.status(200).json(data);
    } catch (error) {
        return unknownErrorResponse(
            res,
            error,
            'No pudimos cargar la configuración pública de precios.',
        );
    }
}

export async function getSuperAdminPricing(_req: Request, res: Response) {
    try {
        const data = await getSuperAdminBusinessPricing();
        return res.status(200).json({
            code: 200,
            error: false,
            data,
        });
    } catch (error) {
        return unknownErrorResponse(
            res,
            error,
            'No pudimos cargar la configuración de precios.',
        );
    }
}

export async function getSuperAdminFeatures(_req: Request, res: Response) {
    try {
        const data = await getSuperAdminProductFeatures();
        return res.status(200).json({
            code: 200,
            error: false,
            data,
        });
    } catch (error) {
        return unknownErrorResponse(
            res,
            error,
            'No pudimos cargar las funciones por producto.',
        );
    }
}

export async function updateSuperAdminProductPricing(req: Request, res: Response) {
    const parsedKey = businessPricingProductKeySchema.safeParse(req.params.productKey);
    if (!parsedKey.success) {
        return validationErrorResponse(
            res,
            'Producto inválido.',
            parsedKey.error.flatten(),
        );
    }

    const parsedBody = updateBusinessPricingProductSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return validationErrorResponse(
            res,
            'Revisá los datos del producto.',
            parsedBody.error.flatten(),
        );
    }

    try {
        const data = await updateBusinessPricingProduct(parsedKey.data, parsedBody.data);
        return res.status(200).json({
            code: 200,
            error: false,
            message: 'Precios actualizados',
            data,
        });
    } catch (error) {
        return unknownErrorResponse(
            res,
            error,
            'No pudimos actualizar el producto.',
        );
    }
}

export async function updateSuperAdminDiscountPricing(req: Request, res: Response) {
    const parsedBody = updateBusinessPricingDiscountsSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return validationErrorResponse(
            res,
            'Revisá la configuración de descuentos y prueba gratis.',
            parsedBody.error.flatten(),
        );
    }

    try {
        const data = await updateBusinessPricingDiscounts(parsedBody.data);
        return res.status(200).json({
            code: 200,
            error: false,
            message: 'Precios actualizados',
            data,
        });
    } catch (error) {
        return unknownErrorResponse(
            res,
            error,
            'No pudimos actualizar los descuentos por combo.',
        );
    }
}

export async function updateSuperAdminPricingSettings(req: Request, res: Response) {
    const parsedBody = updateBusinessPricingSettingsSchema.safeParse(req.body);
    if (!parsedBody.success) {
        return validationErrorResponse(
            res,
            'Revisá la configuración anual y de prueba gratis.',
            parsedBody.error.flatten(),
        );
    }

    try {
        const data = await updateBusinessPricingSettings(parsedBody.data);
        return res.status(200).json({
            code: 200,
            error: false,
            message: 'Precios actualizados',
            data,
        });
    } catch (error) {
        return unknownErrorResponse(
            res,
            error,
            'No pudimos actualizar la configuración anual y de prueba.',
        );
    }
}
