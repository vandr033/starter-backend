import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as CommerceProductService from '../services/commerce-product.service';
import { adminCommerceCatalogQuerySchema } from '../schemas/commerce.schema';

function getRouteParam(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

function getCompanyId(req: AuthenticatedRequest, res: Response): number | null {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        res.status(400).json({
            code: 400,
            error: true,
            message: 'No encontramos el contexto de la empresa.',
        });
        return null;
    }

    return companyId;
}

export async function listAdminCommerceProducts(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const parsedQuery = adminCommerceCatalogQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'Validation failed',
            errors: parsedQuery.error.flatten(),
        });
    }

    const result = await CommerceProductService.listCommerceProducts(companyId, parsedQuery.data);
    return res.status(result.code).json(result);
}

export async function getAdminCommerceProduct(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const result = await CommerceProductService.getCommerceProduct(companyId, getRouteParam(req.params.id));
    return res.status(result.code).json(result);
}

export async function createAdminCommerceProduct(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceProductService.createCommerceProduct(companyId, payload);
    return res.status(result.code).json(result);
}

export async function updateAdminCommerceProduct(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceProductService.updateCommerceProduct(companyId, getRouteParam(req.params.id), payload);
    return res.status(result.code).json(result);
}

export async function deleteAdminCommerceProduct(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const result = await CommerceProductService.deleteCommerceProduct(companyId, getRouteParam(req.params.id));
    return res.status(result.code).json(result);
}

export async function reorderAdminCommerceProducts(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceProductService.reorderCommerceProducts(companyId, payload.ids);
    return res.status(result.code).json(result);
}

export async function uploadAdminCommerceProductImage(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const result = await CommerceProductService.uploadCommerceProductImage(
        companyId,
        getRouteParam(req.params.id),
        req.file,
        {
            alt_text: typeof req.body?.alt_text === 'string' ? req.body.alt_text : undefined,
            sort_order: req.body?.sort_order,
            is_primary: req.body?.is_primary,
        },
    );

    return res.status(result.code).json(result);
}

export async function setAdminCommerceProductPrimaryImage(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const result = await CommerceProductService.setCommerceProductPrimaryImage(
        companyId,
        getRouteParam(req.params.id),
        getRouteParam(req.params.imageId),
    );

    return res.status(result.code).json(result);
}

export async function reorderAdminCommerceProductImages(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceProductService.reorderCommerceProductImages(
        companyId,
        getRouteParam(req.params.id),
        payload.image_ids,
    );

    return res.status(result.code).json(result);
}

export async function updateAdminCommerceProductImage(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceProductService.updateCommerceProductImage(
        companyId,
        getRouteParam(req.params.id),
        getRouteParam(req.params.imageId),
        payload,
    );

    return res.status(result.code).json(result);
}

export async function deleteAdminCommerceProductImage(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const result = await CommerceProductService.deleteCommerceProductImage(
        companyId,
        getRouteParam(req.params.id),
        getRouteParam(req.params.imageId),
    );

    return res.status(result.code).json(result);
}

export async function upsertAdminCommerceProductPromotion(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceProductService.upsertCommerceProductPromotion(
        companyId,
        getRouteParam(req.params.id),
        payload,
    );

    return res.status(result.code).json(result);
}

export async function removeAdminCommerceProductPromotion(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const result = await CommerceProductService.removeCommerceProductPromotion(
        companyId,
        getRouteParam(req.params.id),
    );

    return res.status(result.code).json(result);
}
