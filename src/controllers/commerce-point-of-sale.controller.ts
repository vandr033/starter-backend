import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as CommercePointOfSaleService from '../services/commerce-point-of-sale.service';

function getRouteParam(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

function getCompanyId(req: AuthenticatedRequest): number | undefined {
    return (req as any).companyID as number | undefined;
}

export async function listAdminCommercePointsOfSale(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req);
    if (!companyId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'No encontramos el contexto de la empresa.',
        });
    }

    const result = await CommercePointOfSaleService.listAdminCommercePointsOfSale(companyId);
    return res.status(result.code).json(result);
}

export async function createAdminCommercePointOfSale(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req);
    if (!companyId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'No encontramos el contexto de la empresa.',
        });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommercePointOfSaleService.createAdminCommercePointOfSale(companyId, payload);
    return res.status(result.code).json(result);
}

export async function updateAdminCommercePointOfSale(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req);
    if (!companyId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'No encontramos el contexto de la empresa.',
        });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommercePointOfSaleService.updateAdminCommercePointOfSale(
        companyId,
        getRouteParam(req.params.id),
        payload,
    );
    return res.status(result.code).json(result);
}

export async function deleteAdminCommercePointOfSale(req: AuthenticatedRequest, res: Response) {
    const companyId = getCompanyId(req);
    if (!companyId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'No encontramos el contexto de la empresa.',
        });
    }

    const result = await CommercePointOfSaleService.deleteAdminCommercePointOfSale(
        companyId,
        getRouteParam(req.params.id),
    );
    return res.status(result.code).json(result);
}
