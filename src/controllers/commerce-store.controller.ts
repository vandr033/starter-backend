import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as CommerceStoreService from '../services/commerce-store.service';

export async function getAdminCommerceStore(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'No encontramos el contexto de la empresa.',
        });
    }

    const result = await CommerceStoreService.getAdminCommerceStore(companyId);
    return res.status(result.code).json(result);
}

export async function upsertAdminCommerceStore(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'No encontramos el contexto de la empresa.',
        });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceStoreService.upsertAdminCommerceStore(companyId, payload);
    return res.status(result.code).json(result);
}
