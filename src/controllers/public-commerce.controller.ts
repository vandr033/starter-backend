import { Request, Response } from 'express';
import * as CommerceOrderService from '../services/commerce-order.service';
import * as CommerceGuestCheckoutService from '../services/commerce-guest-checkout.service';
import { AuthenticatedRequest } from '../middlewares/requireAuth';

function getRouteParam(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

export async function getPublicCommerceStore(req: Request, res: Response) {
    const result = await CommerceOrderService.getPublicCommerceStore(getRouteParam(req.params.slug));
    return res.status(result.code).json(result);
}

export async function listPublicCommerceCategories(req: Request, res: Response) {
    const result = await CommerceOrderService.listPublicCommerceCategories(getRouteParam(req.params.slug));
    return res.status(result.code).json(result);
}

export async function listPublicCommerceProducts(req: Request, res: Response) {
    const result = await CommerceOrderService.listPublicCommerceProducts(getRouteParam(req.params.slug));
    return res.status(result.code).json(result);
}

export async function getPublicCommerceProduct(req: Request, res: Response) {
    const result = await CommerceOrderService.getPublicCommerceProduct(
        getRouteParam(req.params.slug),
        getRouteParam(req.params.productSlug),
    );
    return res.status(result.code).json(result);
}

export async function createPublicCommerceOrder(req: Request, res: Response) {
    const payload = (req as any).validated ?? req.body;
    const authReq = req as AuthenticatedRequest;
    const result = await CommerceOrderService.createPublicCommerceOrder(
        getRouteParam(req.params.slug),
        payload,
        authReq.authUser?.id,
    );
    return res.status(result.code).json(result);
}

export async function startPublicCommerceGuestCheckout(req: Request, res: Response) {
    const payload = (req as any).validated ?? req.body;
    const result = await CommerceGuestCheckoutService.startCommerceGuestCheckout(getRouteParam(req.params.slug), payload);
    return res.status(result.code).json(result);
}

export async function resendPublicCommerceGuestCheckout(req: Request, res: Response) {
    const payload = (req as any).validated ?? req.body;
    const sessionId = typeof payload.checkout_session_id === 'string' ? payload.checkout_session_id.trim() : '';
    const result = await CommerceGuestCheckoutService.resendCommerceGuestCheckoutCode(
        getRouteParam(req.params.slug),
        sessionId,
    );
    return res.status(result.code).json(result);
}

export async function verifyPublicCommerceGuestCheckout(req: Request, res: Response) {
    const payload = (req as any).validated ?? req.body;
    const sessionId = typeof payload.checkout_session_id === 'string' ? payload.checkout_session_id.trim() : '';
    const code = typeof payload.code === 'string' ? payload.code : '';
    const result = await CommerceGuestCheckoutService.verifyCommerceGuestCheckout(
        getRouteParam(req.params.slug),
        sessionId,
        code,
        req.headers as HeadersInit,
    );

    if (result.cookies && result.cookies.length > 0) {
        res.setHeader('Set-Cookie', result.cookies);
    }

    return res.status(result.code).json(result);
}

export async function getPublicCommerceOrder(req: Request, res: Response) {
    const result = await CommerceOrderService.getPublicCommerceOrder(
        getRouteParam(req.params.slug),
        getRouteParam(req.params.orderNumber),
    );
    return res.status(result.code).json(result);
}

export async function submitPublicCommercePaymentProof(req: Request, res: Response) {
    const payload = (req as any).validated ?? req.body;
    const result = await CommerceOrderService.submitPublicCommercePaymentProof(
        getRouteParam(req.params.slug),
        getRouteParam(req.params.orderNumber),
        payload.paymentProofUrl,
    );
    return res.status(result.code).json(result);
}

export async function listMyCommerceOrders(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.authUser) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const result = await CommerceOrderService.listMyCommerceOrders(
        getRouteParam(req.params.slug),
        authReq.authUser.id,
    );
    return res.status(result.code).json(result);
}

export async function getMyCommerceOrder(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.authUser) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }
    const result = await CommerceOrderService.getMyCommerceOrder(
        getRouteParam(req.params.slug),
        getRouteParam(req.params.orderNumber),
        authReq.authUser.id,
    );
    return res.status(result.code).json(result);
}
