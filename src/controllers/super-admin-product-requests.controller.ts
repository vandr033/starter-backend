import type { Response } from 'express';
import type {
    ProductAccessRequestStatus,
    ProductCode,
} from '@prisma/client';
import type { AuthenticatedRequest } from '../middlewares/requireAuth';
import {
    approveProductAccessRequest,
    cancelProductAccessRequest,
    listSuperAdminProductAccessRequests,
    rejectProductAccessRequest,
} from '../services/product-access-requests.service';

function firstQueryString(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return undefined;
}

function parsePositiveInt(value: unknown): number | undefined {
    const raw = firstQueryString(value);
    if (!raw) return undefined;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseRouteId(value: string | string[] | undefined): number {
    const raw = Array.isArray(value) ? value[0] : value;
    return Number.parseInt(raw ?? '', 10);
}

export async function getProductAccessRequests(req: AuthenticatedRequest, res: Response) {
    const result = await listSuperAdminProductAccessRequests({
        companyId: parsePositiveInt(req.query.companyId),
        status: firstQueryString(req.query.status) as ProductAccessRequestStatus | undefined,
        productCode: firstQueryString(req.query.productCode) as ProductCode | undefined,
        search: firstQueryString(req.query.search),
        page: parsePositiveInt(req.query.page),
        limit: parsePositiveInt(req.query.limit),
    });

    return res.status(result.code).json(result);
}

export async function approveRequest(req: AuthenticatedRequest, res: Response) {
    const requestId = parseRouteId(req.params.id);
    const resolvedByUserId = req.authUser?.id;

    if (!Number.isInteger(requestId) || requestId <= 0 || !resolvedByUserId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'Invalid request id',
        });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await approveProductAccessRequest({
        requestId,
        resolvedByUserId,
        internalNote: payload?.internalNote,
    });

    return res.status(result.code).json(result);
}

export async function rejectRequest(req: AuthenticatedRequest, res: Response) {
    const requestId = parseRouteId(req.params.id);
    const resolvedByUserId = req.authUser?.id;

    if (!Number.isInteger(requestId) || requestId <= 0 || !resolvedByUserId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'Invalid request id',
        });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await rejectProductAccessRequest({
        requestId,
        resolvedByUserId,
        internalNote: payload?.internalNote,
    });

    return res.status(result.code).json(result);
}

export async function cancelRequest(req: AuthenticatedRequest, res: Response) {
    const requestId = parseRouteId(req.params.id);
    const resolvedByUserId = req.authUser?.id;

    if (!Number.isInteger(requestId) || requestId <= 0 || !resolvedByUserId) {
        return res.status(400).json({
            code: 400,
            error: true,
            message: 'Invalid request id',
        });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await cancelProductAccessRequest({
        requestId,
        resolvedByUserId,
        internalNote: payload?.internalNote,
    });

    return res.status(result.code).json(result);
}
