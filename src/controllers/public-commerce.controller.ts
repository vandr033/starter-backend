import { Request, Response } from 'express';
import * as CommerceOrderService from '../services/commerce-order.service';
import * as CommerceGuestCheckoutService from '../services/commerce-guest-checkout.service';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import { StorageService } from '../services/storage.service';

function getRouteParam(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

function getAccessToken(req: Request): string | undefined {
    const queryToken = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
    const queryAccessToken = Array.isArray(req.query.accessToken) ? req.query.accessToken[0] : req.query.accessToken;
    const bodyToken = typeof req.body?.token === 'string' ? req.body.token : undefined;
    const bodyAccessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken : undefined;

    const value = queryToken ?? queryAccessToken ?? bodyToken ?? bodyAccessToken;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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
    const authReq = req as AuthenticatedRequest;
    const result = await CommerceOrderService.getPublicCommerceOrder(
        getRouteParam(req.params.slug),
        getRouteParam(req.params.orderNumber),
        {
            accessToken: getAccessToken(req),
            authUserId: authReq.authUser?.id,
        },
    );
    return res.status(result.code).json(result);
}

export async function submitPublicCommercePaymentProof(req: Request, res: Response) {
    const payload = (req as any).validated ?? req.body;
    const authReq = req as AuthenticatedRequest;
    const result = await CommerceOrderService.submitPublicCommercePaymentProof(
        getRouteParam(req.params.slug),
        getRouteParam(req.params.orderNumber),
        payload.paymentProofUrl,
        {
            accessToken: getAccessToken(req),
            authUserId: authReq.authUser?.id,
        },
    );
    return res.status(result.code).json(result);
}

export async function uploadCheckoutPaymentProof(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    const result = await CommerceOrderService.uploadCheckoutPaymentProof({
        slug: getRouteParam(req.params.slug),
        authUserId: authReq.authUser?.id ?? null,
        file: req.file,
        uploadIntent: typeof req.body?.uploadIntent === 'string' ? req.body.uploadIntent : null,
    });
    return res.status(result.code).json(result);
}

export async function uploadPublicCommercePaymentProof(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    const result = await CommerceOrderService.uploadPublicCommercePaymentProof({
        slug: getRouteParam(req.params.slug),
        orderNumber: getRouteParam(req.params.orderNumber),
        accessToken: getAccessToken(req),
        authUserId: authReq.authUser?.id ?? null,
        file: req.file,
        uploadIntent: typeof req.body?.uploadIntent === 'string' ? req.body.uploadIntent : null,
    });
    return res.status(result.code).json(result);
}

export async function deletePublicCommercePaymentProof(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    const result = await CommerceOrderService.deletePublicCommercePaymentProof({
        slug: getRouteParam(req.params.slug),
        orderNumber: getRouteParam(req.params.orderNumber),
        accessToken: getAccessToken(req),
        authUserId: authReq.authUser?.id ?? null,
        deleteToken: typeof req.body?.deleteToken === 'string' ? req.body.deleteToken.trim() : null,
    });
    return res.status(result.code).json(result);
}

export async function servePublicCommercePaymentProof(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    const result = await CommerceOrderService.resolvePublicCommercePaymentProofFile({
        slug: getRouteParam(req.params.slug),
        orderNumber: getRouteParam(req.params.orderNumber),
        accessToken: getAccessToken(req),
        authUserId: authReq.authUser?.id ?? null,
    });

    if (result.error || !result.data?.relativePath) {
        return res.status(result.code).json(result);
    }

    const filePath = await StorageService.getFilePath(result.data.relativePath);
    return res.sendFile(filePath);
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

export async function serveMyCommercePaymentProof(req: Request, res: Response) {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.authUser) {
        return res.status(401).json({ code: 401, error: true, message: 'Unauthorized' });
    }

    const result = await CommerceOrderService.resolveMyCommercePaymentProofFile({
        slug: getRouteParam(req.params.slug),
        orderNumber: getRouteParam(req.params.orderNumber),
        userId: authReq.authUser.id,
    });

    if (result.error || !result.data?.relativePath) {
        return res.status(result.code).json(result);
    }

    const filePath = await StorageService.getFilePath(result.data.relativePath);
    return res.sendFile(filePath);
}
