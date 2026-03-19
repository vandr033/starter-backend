import { Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import { prisma } from '../prisma/client';
import { logger } from '../config/logger';
import { getCompanySubscriptionHistoryPayload } from '../services/company-subscription-history.service';

let mensaje: MensajeApi;
const DEFAULT_LANGUAGE_KEY = 'default_language';
const SUPPORTED_LANGUAGES = new Set(['es', 'en']);

function normalizeDefaultLanguage(value: unknown): 'es' | 'en' {
    if (typeof value !== 'string') return 'es';
    const normalized = value.trim().toLowerCase();
    if (normalized === 'en') return 'en';
    return 'es';
}

/**
 * GET /api/admin/settings
 * Get company settings
 */
export async function getCompanySettings(req: AuthenticatedRequest, res: Response) {
    try {
        const companyId = (req as any).companyID;

        if (!companyId) {
            mensaje = {
                code: 400,
                message: 'Company context not found',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        const settings = await prisma.companySettings.findUnique({
            where: { company_id: companyId },
        });
        const defaultLanguageConfig = await prisma.configMessage.findUnique({
            where: {
                company_id_key: {
                    company_id: companyId,
                    key: DEFAULT_LANGUAGE_KEY,
                },
            },
            select: { value: true },
        });
        const defaultLanguage = normalizeDefaultLanguage(defaultLanguageConfig?.value);

        if (!settings) {
            // Return default settings if none exist
            const defaultSettings = {
                booking_buffer_minutes: 10,
                booking_time_granularity_minutes: 5,
                cancel_limit_minutes: 120,
                reschedule_limit_minutes: 120,
                auto_approve_staff_time_off: false,
                allow_qr_payment: true,
                qr_image_url: null,
                allow_cash_payment: true,
                send_email_notifications: true,
                send_whatsapp_notifications: false,
            };

            // Create default settings
            const createdSettings = await prisma.companySettings.create({
                data: {
                    company_id: companyId,
                    ...defaultSettings,
                },
            });

            return res.json({
                code: 200,
                error: false,
                message: 'Settings retrieved successfully',
                data: {
                    ...createdSettings,
                    default_language: defaultLanguage,
                },
            });
        }

        return res.json({
            code: 200,
            error: false,
            message: 'Settings retrieved successfully',
            data: {
                ...settings,
                default_language: defaultLanguage,
            },
        });
    } catch (error) {
        logger.error('Error getting company settings:', error as any);
        mensaje = {
            code: 500,
            message: 'Internal server error',
            error: true,
        };
        return res.status(500).json(mensaje);
    }
}

/**
 * GET /api/admin/settings/subscription-history
 * Get current subscription values and change history for the active shop
 */
export async function getCompanySubscriptionHistory(req: AuthenticatedRequest, res: Response) {
    try {
        const companyId = (req as any).companyID;

        if (!companyId) {
            mensaje = {
                code: 400,
                message: 'Company context not found',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        const payload = await getCompanySubscriptionHistoryPayload(companyId);

        if (!payload) {
            mensaje = {
                code: 404,
                message: 'Company not found',
                error: true,
            };
            return res.status(404).json(mensaje);
        }

        return res.json({
            code: 200,
            error: false,
            message: 'Subscription history retrieved successfully',
            data: payload,
        });
    } catch (error) {
        logger.error('Error getting company subscription history:', error as any);
        mensaje = {
            code: 500,
            message: 'Internal server error',
            error: true,
        };
        return res.status(500).json(mensaje);
    }
}

/**
 * PUT /api/admin/settings
 * Update company settings
 */
export async function updateCompanySettings(req: AuthenticatedRequest, res: Response) {
    try {
        const companyId = (req as any).companyID;

        if (!companyId) {
            mensaje = {
                code: 400,
                message: 'Company context not found',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        const {
            booking_buffer_minutes,
            booking_time_granularity_minutes,
            cancel_limit_minutes,
            reschedule_limit_minutes,
            auto_approve_staff_time_off,
            max_advance_booking_days,
            min_advance_booking_hours,
            allow_qr_payment,
            qr_image_url,
            allow_cash_payment,
            send_email_notifications,
            send_whatsapp_notifications,
            social_links,
            default_language,
        } = req.body;

        // Validate numeric fields
        if (booking_buffer_minutes !== undefined && (typeof booking_buffer_minutes !== 'number' || booking_buffer_minutes < 0)) {
            mensaje = {
                code: 400,
                message: 'booking_buffer_minutes must be a non-negative number',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        if (booking_time_granularity_minutes !== undefined && (typeof booking_time_granularity_minutes !== 'number' || booking_time_granularity_minutes < 5)) {
            mensaje = {
                code: 400,
                message: 'booking_time_granularity_minutes must be at least 5',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        if (cancel_limit_minutes !== undefined && (typeof cancel_limit_minutes !== 'number' || cancel_limit_minutes < 0)) {
            mensaje = {
                code: 400,
                message: 'cancel_limit_minutes must be a non-negative number',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        if (reschedule_limit_minutes !== undefined && (typeof reschedule_limit_minutes !== 'number' || reschedule_limit_minutes < 0)) {
            mensaje = {
                code: 400,
                message: 'reschedule_limit_minutes must be a non-negative number',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        // Validate boolean fields
        const booleanFields = [
            'allow_qr_payment',
            'allow_cash_payment',
            'send_email_notifications',
            'send_whatsapp_notifications',
            'auto_approve_staff_time_off',
        ];

        for (const field of booleanFields) {
            if (req.body[field] !== undefined && typeof req.body[field] !== 'boolean') {
                mensaje = {
                    code: 400,
                    message: `${field} must be a boolean`,
                    error: true,
                };
                return res.status(400).json(mensaje);
            }
        }

        // Validate default language if provided
        if (
            default_language !== undefined &&
            (typeof default_language !== 'string' || !SUPPORTED_LANGUAGES.has(default_language.trim().toLowerCase()))
        ) {
            mensaje = {
                code: 400,
                message: 'default_language must be one of: es, en',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        // Validate qr_image_url if provided
        if (qr_image_url !== undefined && qr_image_url !== null && typeof qr_image_url !== 'string') {
            mensaje = {
                code: 400,
                message: 'qr_image_url must be a string or null',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        // Validate social_links if provided
        let normalizedSocialLinks: Record<string, string | null> | undefined;
        if (social_links !== undefined) {
            if (typeof social_links !== 'object' || social_links === null || Array.isArray(social_links)) {
                mensaje = {
                    code: 400,
                    message: 'social_links must be an object',
                    error: true,
                };
                return res.status(400).json(mensaje);
            }

            const allowedKeys = ['instagram', 'facebook', 'tiktok', 'x_twitter', 'youtube', 'whatsapp'];
            const unknownKeys = Object.keys(social_links).filter(k => !allowedKeys.includes(k));
            if (unknownKeys.length > 0) {
                mensaje = {
                    code: 400,
                    message: `Unknown social_links keys: ${unknownKeys.join(', ')}. Allowed: ${allowedKeys.join(', ')}`,
                    error: true,
                };
                return res.status(400).json(mensaje);
            }

            normalizedSocialLinks = {};
            for (const key of allowedKeys) {
                const value = social_links[key];
                if (value === undefined || value === null || value === '') {
                    normalizedSocialLinks[key] = null;
                    continue;
                }
                if (typeof value !== 'string') {
                    mensaje = {
                        code: 400,
                        message: `social_links.${key} must be a string, null, or empty`,
                        error: true,
                    };
                    return res.status(400).json(mensaje);
                }
                if (value.length > 500) {
                    mensaje = {
                        code: 400,
                        message: `social_links.${key} must be 500 characters or fewer`,
                        error: true,
                    };
                    return res.status(400).json(mensaje);
                }
                // WhatsApp normalization: raw digits → wa.me link
                if (key === 'whatsapp' && /^\+?\d+$/.test(value)) {
                    normalizedSocialLinks[key] = `https://wa.me/${value.replace(/^\+/, '')}`;
                    continue;
                }
                // Basic URL validation for non-empty values
                if (!value.startsWith('https://') && !value.startsWith('http://')) {
                    mensaje = {
                        code: 400,
                        message: `social_links.${key} must be a valid URL starting with https://`,
                        error: true,
                    };
                    return res.status(400).json(mensaje);
                }
                normalizedSocialLinks[key] = value;
            }
        }

        // Upsert settings
        const settings = await prisma.companySettings.upsert({
            where: { company_id: companyId },
            update: {
                booking_buffer_minutes,
                booking_time_granularity_minutes,
                cancel_limit_minutes,
                reschedule_limit_minutes,
                auto_approve_staff_time_off,
                max_advance_booking_days: max_advance_booking_days !== undefined ? (max_advance_booking_days || null) : undefined,
                min_advance_booking_hours: min_advance_booking_hours !== undefined ? (min_advance_booking_hours || null) : undefined,
                allow_qr_payment,
                qr_image_url,
                allow_cash_payment,
                send_email_notifications,
                send_whatsapp_notifications,
                ...(normalizedSocialLinks !== undefined && { social_links: normalizedSocialLinks }),
            },
            create: {
                company_id: companyId,
                booking_buffer_minutes: booking_buffer_minutes || 10,
                booking_time_granularity_minutes: booking_time_granularity_minutes || 5,
                cancel_limit_minutes: cancel_limit_minutes || 120,
                reschedule_limit_minutes: reschedule_limit_minutes || 120,
                auto_approve_staff_time_off: auto_approve_staff_time_off !== undefined ? auto_approve_staff_time_off : false,
                max_advance_booking_days: max_advance_booking_days || null,
                min_advance_booking_hours: min_advance_booking_hours || null,
                allow_qr_payment: allow_qr_payment !== undefined ? allow_qr_payment : true,
                qr_image_url: qr_image_url || null,
                allow_cash_payment: allow_cash_payment !== undefined ? allow_cash_payment : true,
                send_email_notifications: send_email_notifications !== undefined ? send_email_notifications : true,
                send_whatsapp_notifications: send_whatsapp_notifications !== undefined ? send_whatsapp_notifications : false,
                social_links: normalizedSocialLinks || {},
            },
        });

        if (default_language !== undefined) {
            await prisma.configMessage.upsert({
                where: {
                    company_id_key: {
                        company_id: companyId,
                        key: DEFAULT_LANGUAGE_KEY,
                    },
                },
                update: {
                    value: normalizeDefaultLanguage(default_language),
                    name: 'Default Language',
                    description: 'Default language for customer communications',
                },
                create: {
                    company_id: companyId,
                    key: DEFAULT_LANGUAGE_KEY,
                    name: 'Default Language',
                    value: normalizeDefaultLanguage(default_language),
                    description: 'Default language for customer communications',
                },
            });
        }

        const persistedDefaultLanguageConfig = await prisma.configMessage.findUnique({
            where: {
                company_id_key: {
                    company_id: companyId,
                    key: DEFAULT_LANGUAGE_KEY,
                },
            },
            select: { value: true },
        });
        const persistedDefaultLanguage = normalizeDefaultLanguage(persistedDefaultLanguageConfig?.value);

        return res.json({
            code: 200,
            error: false,
            message: 'Settings updated successfully',
            data: {
                ...settings,
                default_language: persistedDefaultLanguage,
            },
        });
    } catch (error) {
        logger.error('Error updating company settings:', error as any);
        mensaje = {
            code: 500,
            message: 'Internal server error',
            error: true,
        };
        return res.status(500).json(mensaje);
    }
}

/**
 * DELETE /api/admin/settings
 * Reset company settings to defaults
 */
export async function resetCompanySettings(req: AuthenticatedRequest, res: Response) {
    try {
        const companyId = (req as any).companyID;

        if (!companyId) {
            mensaje = {
                code: 400,
                message: 'Company context not found',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        // Delete existing settings
        await prisma.companySettings.deleteMany({
            where: { company_id: companyId },
        });

        // Create default settings
        const defaultSettings = await prisma.companySettings.create({
            data: {
                company_id: companyId,
                booking_buffer_minutes: 10,
                booking_time_granularity_minutes: 5,
                cancel_limit_minutes: 120,
                reschedule_limit_minutes: 120,
                auto_approve_staff_time_off: false,
                allow_qr_payment: true,
                qr_image_url: null,
                allow_cash_payment: true,
                send_email_notifications: true,
                send_whatsapp_notifications: false,
            },
        });
        await prisma.configMessage.upsert({
            where: {
                company_id_key: {
                    company_id: companyId,
                    key: DEFAULT_LANGUAGE_KEY,
                },
            },
            update: {
                value: 'es',
                name: 'Default Language',
                description: 'Default language for customer communications',
            },
            create: {
                company_id: companyId,
                key: DEFAULT_LANGUAGE_KEY,
                name: 'Default Language',
                value: 'es',
                description: 'Default language for customer communications',
            },
        });

        return res.json({
            code: 200,
            error: false,
            message: 'Settings reset to defaults successfully',
            data: {
                ...defaultSettings,
                default_language: 'es',
            },
        });
    } catch (error) {
        logger.error('Error resetting company settings:', error as any);
        mensaje = {
            code: 500,
            message: 'Internal server error',
            error: true,
        };
        return res.status(500).json(mensaje);
    }
}
