import type { Response } from 'express';
import { CommerceFulfillmentType, CommerceOrderStatus, CommerceOrderType, PaymentStatus } from '@prisma/client';
import type { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as CommerceService from '../services/commerce.service';

function toInt(value: unknown): number | null {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isInteger(parsed) ? parsed : null;
}

function toNullableInt(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    return toInt(value);
}

function sendResult(res: Response, payload: { code: number; error: boolean; message: string; data?: unknown }) {
    return res.status(payload.code).json(payload);
}

export async function getPublicStorefront(req: AuthenticatedRequest, res: Response) {
    const slug = typeof req.params.slug === 'string' ? req.params.slug.trim().toLowerCase() : '';
    if (!slug) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid store slug' });
    }

    const access = await CommerceService.resolvePublicCommerceStorefrontAccess(slug);
    if (!access.ok) {
        return sendResult(res, access.payload ?? {
            code: access.code,
            error: true,
            message: access.message,
        });
    }

    const data = await CommerceService.getPublicCommerceStorefront(slug);
    if (!data) {
        return sendResult(res, { code: 404, error: true, message: 'Storefront not found' });
    }

    return sendResult(res, { code: 200, error: false, message: 'Storefront retrieved', data });
}

export async function getPublicStoreAvailability(req: AuthenticatedRequest, res: Response) {
    const slug = typeof req.params.slug === 'string' ? req.params.slug.trim().toLowerCase() : '';
    if (!slug) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid store slug' });
    }

    const access = await CommerceService.resolvePublicCommerceStorefrontAccess(slug);
    if (!access.ok) {
        return sendResult(res, access.payload ?? {
            code: access.code,
            error: true,
            message: access.message,
        });
    }

    const data = await CommerceService.getPublicCommerceAvailability(slug);
    if (!data) {
        return sendResult(res, { code: 404, error: true, message: 'Storefront not found' });
    }

    return sendResult(res, { code: 200, error: false, message: 'Availability retrieved', data });
}

export async function getPublicProduct(req: AuthenticatedRequest, res: Response) {
    const slug = typeof req.params.slug === 'string' ? req.params.slug.trim().toLowerCase() : '';
    const productId = toInt(req.params.productId);

    if (!slug || !productId) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid product request' });
    }

    const access = await CommerceService.resolvePublicCommerceStorefrontAccess(slug);
    if (!access.ok) {
        return sendResult(res, access.payload ?? {
            code: access.code,
            error: true,
            message: access.message,
        });
    }

    const data = await CommerceService.getPublicCommerceProduct(slug, productId);
    if (!data) {
        return sendResult(res, { code: 404, error: true, message: 'Product not found' });
    }

    return sendResult(res, { code: 200, error: false, message: 'Product retrieved', data });
}

export async function createPublicOrder(req: AuthenticatedRequest, res: Response) {
    const slug = typeof req.params.slug === 'string' ? req.params.slug.trim().toLowerCase() : '';
    if (!slug) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid store slug' });
    }

    const body = req.body ?? {};
    const payload = await CommerceService.createPublicCommerceOrder(
        slug,
        {
            guest_name: body.guest_name,
            guest_phone_prefix: body.guest_phone_prefix,
            guest_phone: body.guest_phone,
            guest_email: body.guest_email,
            fulfillment_type: body.fulfillment_type as CommerceFulfillmentType,
            order_type: body.order_type as CommerceOrderType,
            point_of_sale_id: toNullableInt(body.point_of_sale_id),
            scheduled_date: typeof body.scheduled_date === 'string' ? body.scheduled_date : null,
            scheduled_timeframe: typeof body.scheduled_timeframe === 'string' ? body.scheduled_timeframe : null,
            delivery_address: typeof body.delivery_address === 'string' ? body.delivery_address : null,
            delivery_instructions: typeof body.delivery_instructions === 'string' ? body.delivery_instructions : null,
            qr_proof_image_url: typeof body.qr_proof_image_url === 'string' ? body.qr_proof_image_url : null,
            notes: typeof body.notes === 'string' ? body.notes : null,
            items: Array.isArray(body.items)
                ? body.items.map((item: any) => ({
                      product_id: Number(item?.product_id),
                      quantity: Number(item?.quantity),
                  }))
                : [],
        },
        req.authUser,
    );

    return sendResult(res, payload);
}

export async function listMyCommerceOrders(req: AuthenticatedRequest, res: Response) {
    const userId = req.authUser?.id;
    if (!userId) {
        return sendResult(res, { code: 401, error: true, message: 'Unauthorized' });
    }

    try {
        const data = await CommerceService.listCustomerCommerceOrders(userId);
        return sendResult(res, { code: 200, error: false, message: 'Customer store orders retrieved', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to load customer store orders',
        });
    }
}

export async function getAdminCommerceBootstrap(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return sendResult(res, { code: 400, error: true, message: 'Company context not found' });
    }

    const data = await CommerceService.getAdminCommerceBootstrap(companyId);
    return sendResult(res, { code: 200, error: false, message: 'Commerce bootstrap retrieved', data });
}

export async function updateAdminCommerceSettings(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return sendResult(res, { code: 400, error: true, message: 'Company context not found' });
    }

    const data = await CommerceService.updateCommerceSettings(companyId, req.body ?? {});
    return sendResult(res, { code: 200, error: false, message: 'Commerce settings updated', data });
}

export async function listAdminCommerceCategories(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return sendResult(res, { code: 400, error: true, message: 'Company context not found' });
    }

    const data = await CommerceService.listCommerceCategories(companyId);
    return sendResult(res, { code: 200, error: false, message: 'Categories retrieved', data });
}

export async function createAdminCommerceCategory(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return sendResult(res, { code: 400, error: true, message: 'Company context not found' });
    }

    try {
        const data = await CommerceService.createCommerceCategory(companyId, req.body ?? {});
        return sendResult(res, { code: 201, error: false, message: 'Category created', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to create category',
        });
    }
}

export async function updateAdminCommerceCategory(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const categoryId = toInt(req.params.categoryId);
    if (!companyId || !categoryId) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid category request' });
    }

    try {
        const data = await CommerceService.updateCommerceCategory(companyId, categoryId, req.body ?? {});
        return sendResult(res, { code: 200, error: false, message: 'Category updated', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to update category',
        });
    }
}

export async function moveAdminCommerceCategory(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const categoryId = toInt(req.params.categoryId);
    const direction =
        req.body?.direction === 'up' || req.body?.direction === 'down'
            ? req.body.direction
            : null;

    if (!companyId || !categoryId || !direction) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid category move request' });
    }

    try {
        const data = await CommerceService.moveCommerceCategory(companyId, categoryId, direction);
        return sendResult(res, { code: 200, error: false, message: 'Category reordered', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to reorder category',
        });
    }
}

export async function deleteAdminCommerceCategory(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const categoryId = toInt(req.params.categoryId);
    if (!companyId || !categoryId) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid category request' });
    }

    try {
        await CommerceService.deleteCommerceCategory(companyId, categoryId);
        return sendResult(res, { code: 200, error: false, message: 'Category deleted' });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to delete category',
        });
    }
}

export async function listAdminCommerceProducts(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return sendResult(res, { code: 400, error: true, message: 'Company context not found' });
    }

    const data = await CommerceService.listCommerceProducts(companyId);
    return sendResult(res, { code: 200, error: false, message: 'Products retrieved', data });
}

export async function createAdminCommerceProduct(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return sendResult(res, { code: 400, error: true, message: 'Company context not found' });
    }

    try {
        const data = await CommerceService.createCommerceProduct(companyId, req.body ?? {});
        return sendResult(res, { code: 201, error: false, message: 'Product created', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to create product',
        });
    }
}

export async function updateAdminCommerceProduct(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const productId = toInt(req.params.productId);
    if (!companyId || !productId) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid product request' });
    }

    try {
        const data = await CommerceService.updateCommerceProduct(companyId, productId, req.body ?? {});
        return sendResult(res, { code: 200, error: false, message: 'Product updated', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to update product',
        });
    }
}

export async function deleteAdminCommerceProduct(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const productId = toInt(req.params.productId);
    if (!companyId || !productId) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid product request' });
    }

    try {
        await CommerceService.deleteCommerceProduct(companyId, productId);
        return sendResult(res, { code: 200, error: false, message: 'Product deleted' });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to delete product',
        });
    }
}

export async function listAdminCommercePointsOfSale(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return sendResult(res, { code: 400, error: true, message: 'Company context not found' });
    }

    const data = await CommerceService.listCommercePointsOfSale(companyId);
    return sendResult(res, { code: 200, error: false, message: 'Points of sale retrieved', data });
}

export async function createAdminCommercePointOfSale(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return sendResult(res, { code: 400, error: true, message: 'Company context not found' });
    }

    try {
        const data = await CommerceService.createCommercePointOfSale(companyId, req.body ?? {});
        return sendResult(res, { code: 201, error: false, message: 'Point of sale created', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to create point of sale',
        });
    }
}

export async function updateAdminCommercePointOfSale(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const pointId = toInt(req.params.pointId);
    if (!companyId || !pointId) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid point of sale request' });
    }

    try {
        const data = await CommerceService.updateCommercePointOfSale(companyId, pointId, req.body ?? {});
        return sendResult(res, { code: 200, error: false, message: 'Point of sale updated', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to update point of sale',
        });
    }
}

export async function deleteAdminCommercePointOfSale(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const pointId = toInt(req.params.pointId);
    if (!companyId || !pointId) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid point of sale request' });
    }

    try {
        await CommerceService.deleteCommercePointOfSale(companyId, pointId);
        return sendResult(res, { code: 200, error: false, message: 'Point of sale deleted' });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to delete point of sale',
        });
    }
}

export async function getAdminCommerceDeliveryRules(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return sendResult(res, { code: 400, error: true, message: 'Company context not found' });
    }

    const data = await CommerceService.getCommerceDeliveryRules(companyId);
    return sendResult(res, { code: 200, error: false, message: 'Delivery rules retrieved', data });
}

export async function updateAdminCommerceDeliveryRules(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return sendResult(res, { code: 400, error: true, message: 'Company context not found' });
    }

    try {
        const data = await CommerceService.upsertCommerceDeliveryRules(
            companyId,
            Array.isArray(req.body?.rules) ? req.body.rules : [],
        );
        return sendResult(res, { code: 200, error: false, message: 'Delivery rules updated', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to update delivery rules',
        });
    }
}

export async function listAdminCommerceOrders(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId) {
        return sendResult(res, { code: 400, error: true, message: 'Company context not found' });
    }

    try {
        const data = await CommerceService.listCommerceOrders({
            companyId,
            status: typeof req.query.status === 'string' ? req.query.status : null,
            date: typeof req.query.date === 'string' ? req.query.date : null,
            point_of_sale_id: toNullableInt(req.query.point_of_sale_id),
            fulfillment_type: typeof req.query.fulfillment_type === 'string' ? req.query.fulfillment_type : null,
            assigned_staff_id: toNullableInt(req.query.assigned_staff_id),
            scope: 'admin',
        });
        return sendResult(res, { code: 200, error: false, message: 'Orders retrieved', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to retrieve orders',
        });
    }
}

export async function getAdminCommerceOrderDetail(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const orderId = toInt(req.params.orderId);
    if (!companyId || !orderId) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid order request' });
    }

    try {
        const data = await CommerceService.getCommerceOrderDetail({
            companyId,
            orderId,
            scope: 'admin',
        });
        if (!data) {
            return sendResult(res, { code: 404, error: true, message: 'Order not found' });
        }
        return sendResult(res, { code: 200, error: false, message: 'Order retrieved', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to retrieve order',
        });
    }
}

export async function assignAdminCommerceOrder(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const orderId = toInt(req.params.orderId);
    const staffId = toInt(req.body?.staff_id);
    if (!companyId || !orderId || !staffId) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid assignment request' });
    }

    try {
        const data = await CommerceService.assignCommerceOrder(companyId, orderId, staffId);
        return sendResult(res, { code: 200, error: false, message: 'Order assigned', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to assign order',
        });
    }
}

export async function updateAdminCommerceOrderStatus(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const orderId = toInt(req.params.orderId);
    const status = typeof req.body?.status === 'string' ? req.body.status : '';
    if (!companyId || !orderId || !status) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid status update request' });
    }

    try {
        const data = await CommerceService.updateCommerceOrderStatus({
            companyId,
            orderId,
            nextStatus: status as CommerceOrderStatus,
            scope: 'admin',
            userId: req.authUser?.id,
            trackingLink: typeof req.body?.tracking_link === 'string' ? req.body.tracking_link : null,
        });
        return sendResult(res, { code: 200, error: false, message: 'Order status updated', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to update order status',
        });
    }
}

export async function updateAdminCommerceTrackingLink(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const orderId = toInt(req.params.orderId);
    const trackingLink = typeof req.body?.tracking_link === 'string' ? req.body.tracking_link : '';
    if (!companyId || !orderId || !trackingLink.trim()) {
        return sendResult(res, { code: 400, error: true, message: 'tracking_link is required' });
    }

    try {
        const data = await CommerceService.setCommerceOrderTrackingLink(companyId, orderId, trackingLink);
        return sendResult(res, { code: 200, error: false, message: 'Tracking link updated', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to update tracking link',
        });
    }
}

export async function updateAdminCommercePaymentStatus(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const orderId = toInt(req.params.orderId);
    const paymentStatus = typeof req.body?.payment_status === 'string' ? req.body.payment_status : '';

    if (!companyId || !orderId || !paymentStatus) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid payment update request' });
    }

    if (!Object.values(PaymentStatus).includes(paymentStatus as PaymentStatus)) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid payment status' });
    }

    try {
        const data = await CommerceService.setCommerceOrderPaymentStatus({
            companyId,
            orderId,
            nextPaymentStatus: paymentStatus as PaymentStatus,
        });
        return sendResult(res, { code: 200, error: false, message: 'Payment status updated', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to update payment status',
        });
    }
}

export async function listStaffCommerceOrders(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    if (!companyId || !req.authUser?.id) {
        return sendResult(res, { code: 400, error: true, message: 'Company context not found' });
    }

    try {
        const data = await CommerceService.listCommerceOrders({
            companyId,
            status: typeof req.query.status === 'string' ? req.query.status : null,
            date: typeof req.query.date === 'string' ? req.query.date : null,
            point_of_sale_id: toNullableInt(req.query.point_of_sale_id),
            fulfillment_type: typeof req.query.fulfillment_type === 'string' ? req.query.fulfillment_type : null,
            assigned_staff_id: null,
            scope: 'staff',
            userId: req.authUser.id,
        });
        return sendResult(res, { code: 200, error: false, message: 'Assigned orders retrieved', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to retrieve staff orders',
        });
    }
}

export async function getStaffCommerceOrderDetail(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const orderId = toInt(req.params.orderId);
    if (!companyId || !orderId || !req.authUser?.id) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid order request' });
    }

    try {
        const data = await CommerceService.getCommerceOrderDetail({
            companyId,
            orderId,
            scope: 'staff',
            userId: req.authUser.id,
        });
        if (!data) {
            return sendResult(res, { code: 404, error: true, message: 'Order not found' });
        }
        return sendResult(res, { code: 200, error: false, message: 'Assigned order retrieved', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to retrieve staff order',
        });
    }
}

export async function updateStaffCommerceOrderStatus(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID as number | undefined;
    const orderId = toInt(req.params.orderId);
    const status = typeof req.body?.status === 'string' ? req.body.status : '';
    if (!companyId || !orderId || !status || !req.authUser?.id) {
        return sendResult(res, { code: 400, error: true, message: 'Invalid status update request' });
    }

    try {
        const data = await CommerceService.updateCommerceOrderStatus({
            companyId,
            orderId,
            nextStatus: status as CommerceOrderStatus,
            scope: 'staff',
            userId: req.authUser.id,
            trackingLink: typeof req.body?.tracking_link === 'string' ? req.body.tracking_link : null,
        });
        return sendResult(res, { code: 200, error: false, message: 'Order status updated', data });
    } catch (error) {
        return sendResult(res, {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to update staff order status',
        });
    }
}
