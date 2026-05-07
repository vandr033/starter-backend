import { Response } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as CommerceOrderService from '../services/commerce-order.service';
import { StorageService } from '../services/storage.service';

function getRouteParam(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

export async function listAdminCommerceOrders(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const companyUser = (req as any).companyUser as { role?: CompanyUserRole } | undefined;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }

    const result = await CommerceOrderService.getAdminCommerceOrders({
        companyId,
        actorRole: companyUser?.role ?? null,
        actorUserId: req.authUser?.id ?? null,
    });
    return res.status(result.code).json(result);
}

export async function getAdminCommerceOrder(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const companyUser = (req as any).companyUser as { role?: CompanyUserRole } | undefined;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }

    const result = await CommerceOrderService.getAdminCommerceOrder({
        companyId,
        orderId: getRouteParam(req.params.id),
        actorRole: companyUser?.role ?? null,
        actorUserId: req.authUser?.id ?? null,
    });
    return res.status(result.code).json(result);
}

export async function updateAdminCommerceOrderStatus(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceOrderService.updateAdminCommerceOrderStatus({
        companyId,
        orderId: getRouteParam(req.params.id),
        changedByUserId: req.authUser?.id ?? null,
        paymentStatus: payload.payment_status,
        fulfillmentStatus: payload.fulfillment_status,
        note: payload.note,
    });
    return res.status(result.code).json(result);
}

export async function updateAdminCommerceOrderDeliveryCost(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceOrderService.updateAdminCommerceOrderDeliveryCost({
        companyId,
        orderId: getRouteParam(req.params.id),
        changedByUserId: req.authUser?.id ?? null,
        deliveryCost: payload.deliveryCost,
        note: payload.note,
    });
    return res.status(result.code).json(result);
}

export async function updateAdminCommerceOrderAssignment(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceOrderService.updateAdminCommerceOrderAssignment({
        companyId,
        orderId: getRouteParam(req.params.id),
        changedByUserId: req.authUser?.id ?? null,
        assignedStaffId: payload.assignedStaffId,
        note: payload.note,
    });
    return res.status(result.code).json(result);
}

export async function updateAdminCommerceOrderNotes(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }

    const payload = (req as any).validated ?? req.body;
    const result = await CommerceOrderService.updateAdminCommerceOrderNotes({
        companyId,
        orderId: getRouteParam(req.params.id),
        internalNotes: payload.internal_notes,
    });
    return res.status(result.code).json(result);
}

export async function getAdminCommerceMetrics(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }

    const result = await CommerceOrderService.getAdminCommerceMetrics(companyId);
    return res.status(result.code).json(result);
}

export async function getAdminCommerceAssignableStaff(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }

    const result = await CommerceOrderService.getAdminCommerceAssignableStaff(companyId);
    return res.status(result.code).json(result);
}

export async function serveAdminCommercePaymentProof(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const companyUser = (req as any).companyUser as { role?: CompanyUserRole } | undefined;
    if (!companyId) {
        return res.status(400).json({ code: 400, error: true, message: 'No encontramos el contexto de la empresa.' });
    }

    const result = await CommerceOrderService.resolveAdminCommercePaymentProofFile({
        companyId,
        orderId: getRouteParam(req.params.id),
        actorRole: companyUser?.role ?? null,
        actorUserId: req.authUser?.id ?? null,
    });

    if (result.error || !result.data?.relativePath) {
        return res.status(result.code).json(result);
    }

    const filePath = await StorageService.getFilePath(result.data.relativePath);
    return res.sendFile(filePath);
}
