"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyCommerceOrderCustomer = notifyCommerceOrderCustomer;
const client_1 = require("../prisma/client");
const sendEmail_1 = require("../utils/sendEmail");
const whatsappSender_1 = require("../utils/whatsappSender");
const crypto_1 = __importDefault(require("crypto"));
const notificationBranding_1 = require("../utils/notificationBranding");
const logger_1 = require("../config/logger");
const notification_provider_service_1 = require("./notification-provider.service");
function buildOrderPublicUrl(companySlug, orderNumber, accessToken) {
    const base = process.env.FRONTEND_URL ||
        process.env.NEXT_PUBLIC_FRONTEND_URL ||
        'http://localhost:3000';
    const query = new URLSearchParams({ token: accessToken }).toString();
    return `${base.replace(/\/$/, '')}/shop/${encodeURIComponent(companySlug)}/store/orders/${encodeURIComponent(orderNumber)}?${query}`;
}
async function notifyCommerceOrderCustomer(params) {
    const order = await client_1.prisma.commerceOrder.findUnique({
        where: { id: params.orderId },
        include: {
            company: {
                select: {
                    name: true,
                    slug: true,
                },
            },
        },
    });
    if (!order?.company)
        return;
    const publicAccessToken = order.public_access_token
        ?? (await client_1.prisma.commerceOrder.update({
            where: { id: order.id },
            data: {
                public_access_token: crypto_1.default.randomBytes(24).toString('base64url'),
            },
            select: {
                public_access_token: true,
            },
        })).public_access_token;
    const orderUrl = buildOrderPublicUrl(order.company.slug, order.order_number, publicAccessToken);
    const text = `${params.message.trim()}\n\nSeguimiento: ${orderUrl}`;
    if (order.customer_email) {
        const result = await (0, sendEmail_1.sendGenericEmail)(order.customer_email, params.emailSubject ?? `Actualización de tu pedido ${order.order_number}`, `
                <p>${params.message}</p>
                <p><a href="${orderUrl}">Ver estado del pedido</a></p>
            `, {
            companyId: params.companyId,
            branding: { companyName: order.company.name },
        });
        if (!(0, notification_provider_service_1.isEmailDeliverySuccessful)(result)) {
            logger_1.logger.warn({ orderId: order.id, reason: result.reason }, 'Commerce order email was not delivered');
        }
    }
    const fullCustomerPhone = (0, notificationBranding_1.buildFullPhone)(order.customer_phone_prefix, order.customer_phone);
    if (fullCustomerPhone) {
        const result = await (0, whatsappSender_1.queueWhatsappText)(fullCustomerPhone, text, {
            companyId: params.companyId,
            branding: { companyName: order.company.name },
            sourceType: 'COMMERCE_ORDER_NOTIFICATION',
            sourceId: order.id,
            dedupeKey: `commerce-order:${order.id}:${params.emailSubject ?? params.message}`,
        });
        if (!(0, whatsappSender_1.isWhatsappEnqueueAccepted)(result)) {
            logger_1.logger.warn({ orderId: order.id, reason: result.reason ?? 'WHATSAPP_ENQUEUE_FAILED' }, 'Commerce order WhatsApp was not queued');
        }
    }
}
