import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as CommerceCategoryService from '../services/commerce-category.service';

function getRouteParam(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

export async function listAdminCommerceCategories(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }

    const result = await CommerceCategoryService.listCommerceCategories(companyId);
    return res.status(result.code).json(result);
}

export async function createAdminCommerceCategory(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceCategoryService.createCommerceCategory(companyId, payload);
    return res.status(result.code).json(result);
}

export async function updateAdminCommerceCategory(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceCategoryService.updateCommerceCategory(companyId, getRouteParam(req.params.id), payload);
    return res.status(result.code).json(result);
}

export async function deleteAdminCommerceCategory(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }

    const result = await CommerceCategoryService.deleteCommerceCategory(companyId, getRouteParam(req.params.id));
    return res.status(result.code).json(result);
}

export async function reorderAdminCommerceCategories(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceCategoryService.reorderCommerceCategories(companyId, payload.ids);
    return res.status(result.code).json(result);
}
