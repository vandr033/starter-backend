import { prisma } from '../prisma/client';
import { sendGenericEmail } from '../utils/sendEmail';
import { sendWhatsappText } from '../utils/whatsappSender';
import crypto from 'crypto';

function buildOrderPublicUrl(companySlug: string, orderNumber: string, accessToken: string): string {
    const base =
        process.env.FRONTEND_URL ||
        process.env.NEXT_PUBLIC_FRONTEND_URL ||
        'http://localhost:3000';
    const query = new URLSearchParams({ token: accessToken }).toString();
    return `${base.replace(/\/$/, '')}/shop/${encodeURIComponent(companySlug)}/store/orders/${encodeURIComponent(orderNumber)}?${query}`;
}

export async function notifyCommerceOrderCustomer(params: {
    companyId: number;
    orderId: string;
    message: string;
    emailSubject?: string;
}): Promise<void> {
    const order = await prisma.commerceOrder.findUnique({
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

    if (!order?.company) return;

    const publicAccessToken = order.public_access_token
        ?? (
            await prisma.commerceOrder.update({
                where: { id: order.id },
                data: {
                    public_access_token: crypto.randomBytes(24).toString('base64url'),
                },
                select: {
                    public_access_token: true,
                },
            })
        ).public_access_token;

    const orderUrl = buildOrderPublicUrl(order.company.slug, order.order_number, publicAccessToken);
    const text = `${params.message.trim()}\n\nSeguimiento: ${orderUrl}`;

    if (order.customer_email) {
        await sendGenericEmail(
            order.customer_email,
            params.emailSubject ?? `Actualización de tu pedido ${order.order_number}`,
            `
                <p>${params.message}</p>
                <p><a href="${orderUrl}">Ver estado del pedido</a></p>
            `,
            {
                companyId: params.companyId,
                branding: { companyName: order.company.name },
            },
        ).catch(() => undefined);
    }

    if (order.customer_phone) {
        await sendWhatsappText(order.customer_phone, text, {
            companyId: params.companyId,
            branding: { companyName: order.company.name },
        }).catch(() => undefined);
    }
}
