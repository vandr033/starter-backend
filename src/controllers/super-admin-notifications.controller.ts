import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as SuperAdminNotificationsService from '../services/super-admin-notifications.service';

type NotificationRequestBody = Record<string, unknown>;

function getOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function resolveRequestedBy(req: AuthenticatedRequest) {
    return {
        id: typeof req.authUser?.id === 'string' ? req.authUser.id : undefined,
        name: typeof req.authUser?.name === 'string' ? req.authUser.name : null,
        email: typeof req.authUser?.email === 'string' ? req.authUser.email : null,
    };
}

/**
 * POST /api/super-admin/notifications/test/email
 * Send a test email to validate outbound delivery.
 */
export async function sendTestEmailNotification(req: AuthenticatedRequest, res: Response) {
    try {
        const body = (req.body && typeof req.body === 'object' ? req.body : {}) as NotificationRequestBody;
        const result = await SuperAdminNotificationsService.sendTestEmailNotification({
            email: getOptionalString(body.email),
            subject: getOptionalString(body.subject),
            message: getOptionalString(body.message),
            requestedBy: resolveRequestedBy(req),
        });

        return res.status(result.code).json(result);
    } catch (error) {
        console.error('Error in sendTestEmailNotification:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error',
        });
    }
}

/**
 * POST /api/super-admin/notifications/test/whatsapp
 * Send a test WhatsApp message to validate outbound delivery.
 */
export async function sendTestWhatsappNotification(req: AuthenticatedRequest, res: Response) {
    try {
        const body = (req.body && typeof req.body === 'object' ? req.body : {}) as NotificationRequestBody;
        const result = await SuperAdminNotificationsService.sendTestWhatsappNotification({
            phoneNumber: getOptionalString(body.phoneNumber) ?? getOptionalString(body.number),
            message: getOptionalString(body.message),
            requestedBy: resolveRequestedBy(req),
        });

        return res.status(result.code).json(result);
    } catch (error) {
        console.error('Error in sendTestWhatsappNotification:', error);
        return res.status(500).json({
            code: 500,
            error: true,
            message: 'Internal server error',
        });
    }
}
