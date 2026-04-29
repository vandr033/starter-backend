import type { Response } from 'express';
import type { ProductAccessRequestStatus, ProductCode } from '@prisma/client';
import type { AuthenticatedRequest } from '../middlewares/requireAuth';
import {
    createAdminProductAccessRequest,
    listAdminProductAccessRequests,
} from '../services/product-access-requests.service';

function firstQueryString(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return undefined;
}

export async function createProductAccessRequest(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const requestedByUserId = req.authUser?.id;

    if (!companyId || !requestedByUserId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'Company context not found',
        });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await createAdminProductAccessRequest({
        companyId,
        requestedByUserId,
        productCode: payload.productCode,
        tierCode: payload.tierCode,
        capability: payload.capability,
        message: payload.message,
        source: payload.source,
    });

    return res.status(result.code).json(result);
}

export async function getProductAccessRequests(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;

    if (!companyId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'Company context not found',
        });
    }

    const status = firstQueryString(req.query.status) as ProductAccessRequestStatus | undefined;
    const productCode = firstQueryString(req.query.productCode) as ProductCode | undefined;

    const result = await listAdminProductAccessRequests({
        companyId,
        status,
        productCode,
    });

    return res.status(result.code).json(result);
}
