import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import { adminCommerceCatalogQuerySchema } from '../schemas/commerce.schema';
import * as CommerceComboService from '../services/commerce-combo-admin.service';
import * as CommerceProductService from '../services/commerce-product.service';

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

export async function listAdminCommerceCombos(req: AuthenticatedRequest, res: Response) {
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

    const result = await CommerceComboService.listCommerceCombos(companyId, parsedQuery.data);
    return res.status(result.code).json(result);
}

export async function getAdminCommerceCombo(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const result = await CommerceComboService.getCommerceCombo(
        companyId,
        getRouteParam(req.params.id),
    );
    return res.status(result.code).json(result);
}

export async function createAdminCommerceCombo(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceComboService.createCommerceCombo(companyId, payload);
    return res.status(result.code).json(result);
}

export async function updateAdminCommerceCombo(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceComboService.updateCommerceCombo(
        companyId,
        getRouteParam(req.params.id),
        payload,
    );
    return res.status(result.code).json(result);
}

export async function deleteAdminCommerceCombo(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const result = await CommerceComboService.deleteCommerceCombo(
        companyId,
        getRouteParam(req.params.id),
    );
    return res.status(result.code).json(result);
}

export async function uploadAdminCommerceComboImage(req: AuthenticatedRequest, res: Response) {
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
        'COMBO',
    );

    return res.status(result.code).json(result);
}

export async function setAdminCommerceComboPrimaryImage(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const result = await CommerceProductService.setCommerceProductPrimaryImage(
        companyId,
        getRouteParam(req.params.id),
        getRouteParam(req.params.imageId),
        'COMBO',
    );

    return res.status(result.code).json(result);
}

export async function reorderAdminCommerceComboImages(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceProductService.reorderCommerceProductImages(
        companyId,
        getRouteParam(req.params.id),
        payload.image_ids,
        'COMBO',
    );

    return res.status(result.code).json(result);
}

export async function updateAdminCommerceComboImage(req: AuthenticatedRequest, res: Response) {
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
        'COMBO',
    );

    return res.status(result.code).json(result);
}

export async function deleteAdminCommerceComboImage(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const result = await CommerceProductService.deleteCommerceProductImage(
        companyId,
        getRouteParam(req.params.id),
        getRouteParam(req.params.imageId),
        'COMBO',
    );

    return res.status(result.code).json(result);
}

export async function upsertAdminCommerceComboPromotion(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceProductService.upsertCommerceProductPromotion(
        companyId,
        getRouteParam(req.params.id),
        payload,
        'COMBO',
    );

    return res.status(result.code).json(result);
}

export async function removeAdminCommerceComboPromotion(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req, res);
    if (!companyId) {
        return;
    }

    const result = await CommerceProductService.removeCommerceProductPromotion(
        companyId,
        getRouteParam(req.params.id),
        'COMBO',
    );

    return res.status(result.code).json(result);
}
