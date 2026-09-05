import { MensajeApi } from '../types/MensajeApi';
import * as ServiceRepo from '../repositories/service.repo';
import { companyHasCapability } from './company-entitlements.service';
import crypto from 'node:crypto';
import {
    resolveEffectiveServicePrice,
    validateServicePromoWindow,
} from './service-pricing.service';

interface ServiceResult extends MensajeApi {
    data?: any;
}

type MultiSessionConfig = {
    duration_minutes: number;
    is_multi_session: boolean;
    session_count: number | null;
    session_duration_minutes: number | null;
};

type ServicePromotionConfig = {
    promo_price_cents?: number | null;
    promo_starts_at?: Date | null;
    promo_ends_at?: Date | null;
    promo_label?: string | null;
};

type InviteOnlyConfig = {
    is_invite_only?: boolean;
    invite_token?: string | null;
};

type NotificationAudienceConfig = {
    notify_customer?: boolean;
    notify_assigned_staff?: boolean;
    notify_management?: boolean;
};

async function normalizeNotificationAudienceInput(
    companyId: number,
    input: NotificationAudienceConfig,
): Promise<NotificationAudienceConfig | ServiceResult> {
    const hasAudienceField =
        input.notify_customer !== undefined ||
        input.notify_assigned_staff !== undefined ||
        input.notify_management !== undefined;

    if (!hasAudienceField) return {};

    const hasMessagingPro = await companyHasCapability(companyId, 'MENSAJERIA_PRO');
    if (!hasMessagingPro) {
        return {
            code: 403,
            message: 'La personalización de destinatarios requiere Mensajería Pro.',
            error: true,
        };
    }

    return {
        ...(input.notify_customer !== undefined
            ? { notify_customer: input.notify_customer }
            : {}),
        ...(input.notify_assigned_staff !== undefined
            ? { notify_assigned_staff: input.notify_assigned_staff }
            : {}),
        ...(input.notify_management !== undefined
            ? { notify_management: input.notify_management }
            : {}),
    };
}

function serializeServiceWithPricing(
    service: {
        price_cents: number;
        promo_price_cents?: number | null;
        promo_starts_at?: Date | null;
        promo_ends_at?: Date | null;
        promo_label?: string | null;
        [key: string]: any;
    },
    promotionsEnabled: boolean,
) {
    const pricing = resolveEffectiveServicePrice({
        priceCents: service.price_cents,
        promoPriceCents: service.promo_price_cents ?? null,
        promoStartsAt: service.promo_starts_at ?? null,
        promoEndsAt: service.promo_ends_at ?? null,
        promoLabel: service.promo_label ?? null,
        promotionsEnabled,
    });

    return {
        ...service,
        pricing: {
            regular_price_cents: pricing.regularPriceCents,
            base_price_cents: pricing.basePriceCents,
            final_price_cents: pricing.finalPriceCents,
            promo_applied: pricing.promoApplied,
            promo_label: pricing.promoLabel,
            promo_starts_at: pricing.promoStartsAt,
            promo_ends_at: pricing.promoEndsAt,
        },
    };
}

function normalizeInviteOnlyInput(
    input: {
        is_invite_only?: boolean;
    },
    existingInviteToken?: string | null,
): InviteOnlyConfig {
    if (input.is_invite_only === undefined) {
        return {};
    }

    if (!input.is_invite_only) {
        return {
            is_invite_only: false,
        };
    }

    return {
        is_invite_only: true,
        invite_token:
            existingInviteToken?.trim() ||
            crypto.randomBytes(24).toString('base64url'),
    };
}

async function normalizeMultiSessionInput(
    companyId: number,
    input: {
        duration_minutes?: number;
        is_multi_session?: boolean;
        session_count?: number | null;
        session_duration_minutes?: number | null;
    },
    existingDurationMinutes?: number,
    options?: {
        allowLockedExisting?: boolean;
    },
): Promise<MultiSessionConfig | ServiceResult> {
    const isMultiSession = input.is_multi_session === true;
    const durationMinutes =
        input.duration_minutes ?? existingDurationMinutes ?? 0;

    if (!isMultiSession) {
        return {
            duration_minutes: durationMinutes,
            is_multi_session: false,
            session_count: null,
            session_duration_minutes: null,
        };
    }

    const hasReservasPro = await companyHasCapability(companyId, 'RESERVAS_PRO');
    if (!hasReservasPro) {
        if (options?.allowLockedExisting) {
            return {
                duration_minutes: durationMinutes,
                is_multi_session: true,
                session_count: input.session_count ?? null,
                session_duration_minutes: input.session_duration_minutes ?? null,
            };
        }

        return {
            code: 403,
            message: 'Requiere Reservas Pro.',
            error: true,
        };
    }

    const sessionCount = input.session_count ?? null;
    const sessionDurationMinutes = input.session_duration_minutes ?? null;

    if (!sessionCount || sessionCount <= 1) {
        return {
            code: 400,
            message: 'El número de sesiones debe ser mayor a 1.',
            error: true,
        };
    }

    if (!sessionDurationMinutes || sessionDurationMinutes <= 0) {
        return {
            code: 400,
            message: 'La duración por sesión debe ser mayor a 0 minutos.',
            error: true,
        };
    }

    return {
        duration_minutes: sessionCount * sessionDurationMinutes,
        is_multi_session: true,
        session_count: sessionCount,
        session_duration_minutes: sessionDurationMinutes,
    };
}

function hasPromoField(input: {
    promo_price_cents?: number | null;
    promo_starts_at?: Date | null;
    promo_ends_at?: Date | null;
    promo_label?: string | null;
}): boolean {
    return (
        input.promo_price_cents !== undefined ||
        input.promo_starts_at !== undefined ||
        input.promo_ends_at !== undefined ||
        input.promo_label !== undefined
    );
}

async function normalizeServicePromotionInput(
    companyId: number,
    input: {
        price_cents?: number;
        promo_price_cents?: number | null;
        promo_starts_at?: Date | null;
        promo_ends_at?: Date | null;
        promo_label?: string | null;
    },
    existingPriceCents?: number,
): Promise<ServicePromotionConfig | ServiceResult> {
    if (!hasPromoField(input)) {
        return {};
    }

    const hasPromoCapability = await companyHasCapability(
        companyId,
        'RESERVAS_SERVICE_PROMOTIONS',
    );

    if (!hasPromoCapability) {
        return {
            code: 403,
            message: 'Requiere Reservas Pro.',
            error: true,
        };
    }

    const priceCents = input.price_cents ?? existingPriceCents;
    if (priceCents == null) {
        return {
            code: 400,
            message: 'El precio base del servicio es obligatorio para configurar promociones.',
            error: true,
        };
    }

    if (input.promo_price_cents == null) {
        return {
            promo_price_cents: null,
            promo_starts_at: null,
            promo_ends_at: null,
            promo_label: null,
        };
    }

    const validationError = validateServicePromoWindow({
        priceCents,
        promoPriceCents: input.promo_price_cents,
        promoStartsAt: input.promo_starts_at ?? null,
        promoEndsAt: input.promo_ends_at ?? null,
    });

    if (validationError) {
        return {
            code: 400,
            message: validationError,
            error: true,
        };
    }

    return {
        promo_price_cents: input.promo_price_cents,
        promo_starts_at: input.promo_starts_at ?? null,
        promo_ends_at: input.promo_ends_at ?? null,
        promo_label: input.promo_label?.trim() || null,
    };
}

/**
 * List all services for a company
 */
export async function listServices(companyId: number): Promise<ServiceResult> {
    try {
        const [services, promotionsEnabled] = await Promise.all([
            ServiceRepo.getServicesByCompany(companyId),
            companyHasCapability(companyId, 'RESERVAS_SERVICE_PROMOTIONS'),
        ]);

        return {
            code: 200,
            message: 'Services retrieved successfully',
            error: false,
            data: services.map((service) =>
                serializeServiceWithPricing(service, promotionsEnabled),
            ),
        };
    } catch (error: any) {
        console.error('Error listing services:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Create a new service
 */
export interface CreateServiceInput {
    category_id: number;
    name: string;
    description?: string;
    price_cents: number;
    promo_price_cents?: number | null;
    promo_starts_at?: Date | null;
    promo_ends_at?: Date | null;
    promo_label?: string | null;
    duration_minutes: number;
    is_multi_session?: boolean;
    session_count?: number | null;
    session_duration_minutes?: number | null;
    position?: number;
    global_type_id?: number;
    required_resource_ids?: number[];
    is_invite_only?: boolean;
    notify_customer?: boolean;
    notify_assigned_staff?: boolean;
    notify_management?: boolean;
}

export async function createService(
    companyId: number,
    input: CreateServiceInput
): Promise<ServiceResult> {
    try {
        // Validate category belongs to same company
        const category = await ServiceRepo.getCategoryById(input.category_id, companyId);
        if (!category) {
            return {
                code: 400,
                message: 'La categoría no existe o no pertenece a tu empresa.',
                error: true,
            };
        }

        // Auto-set position if not provided
        let position = input.position;
        if (position === undefined) {
            position = await ServiceRepo.getNextPosition(input.category_id);
        }

        const multiSessionConfig = await normalizeMultiSessionInput(companyId, input);
        if ('error' in multiSessionConfig) {
            return multiSessionConfig;
        }

        const promotionConfig = await normalizeServicePromotionInput(companyId, input);
        if ('error' in promotionConfig) {
            return promotionConfig;
        }
        const inviteOnlyConfig = normalizeInviteOnlyInput(input);
        const notificationAudienceConfig = await normalizeNotificationAudienceInput(companyId, input);
        if ('error' in notificationAudienceConfig) {
            return notificationAudienceConfig;
        }

        const service = await ServiceRepo.createService({
            company_id: companyId,
            category_id: input.category_id,
            name: input.name,
            description: input.description,
            price_cents: input.price_cents,
            ...promotionConfig,
            duration_minutes: multiSessionConfig.duration_minutes,
            is_multi_session: multiSessionConfig.is_multi_session,
            session_count: multiSessionConfig.session_count,
            session_duration_minutes: multiSessionConfig.session_duration_minutes,
            position,
            global_type_id: input.global_type_id,
            ...inviteOnlyConfig,
            ...notificationAudienceConfig,
        });

        if (input.required_resource_ids && input.required_resource_ids.length > 0) {
            await ServiceRepo.setServiceRequiredResources(service!.id, companyId, input.required_resource_ids);
        }

        const updated = await ServiceRepo.getUpdatedService(service!.id, companyId);
        const promotionsEnabled = await companyHasCapability(
            companyId,
            'RESERVAS_SERVICE_PROMOTIONS',
        );

        return {
            code: 201,
            message: 'Servicio creado correctamente.',
            error: false,
            data: updated
                ? serializeServiceWithPricing(updated, promotionsEnabled)
                : updated,
        };
    } catch (error: any) {
        console.error('Error creating service:', error);
        return {
            code: 500,
            message: 'No pudimos crear el servicio.',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Update a service
 */
export interface UpdateServiceInput {
    name?: string;
    description?: string;
    price_cents?: number;
    promo_price_cents?: number | null;
    promo_starts_at?: Date | null;
    promo_ends_at?: Date | null;
    promo_label?: string | null;
    duration_minutes?: number;
    is_multi_session?: boolean;
    session_count?: number | null;
    session_duration_minutes?: number | null;
    position?: number;
    is_active?: boolean;
    category_id?: number;
    global_type_id?: number;
    required_resource_ids?: number[];
    is_invite_only?: boolean;
    notify_customer?: boolean;
    notify_assigned_staff?: boolean;
    notify_management?: boolean;
}

export async function updateService(
    companyId: number,
    serviceId: number,
    input: UpdateServiceInput
): Promise<ServiceResult> {
    try {
        // Check if service exists and belongs to company
        const existing = await ServiceRepo.getServiceById(serviceId, companyId);
        if (!existing) {
            return {
                code: 404,
                message: 'No encontramos el servicio.',
                error: true,
            };
        }

        // If changing category, validate new category belongs to company
        if (input.category_id && input.category_id !== existing.category.id) {
            const category = await ServiceRepo.getCategoryById(input.category_id, companyId);
            if (!category) {
                return {
                    code: 400,
                    message: 'La categoría no existe o no pertenece a tu empresa.',
                    error: true,
                };
            }
        }

        const multiSessionConfig = await normalizeMultiSessionInput(
            companyId,
            input,
            existing.duration_minutes,
            {
                allowLockedExisting: existing.is_multi_session === true,
            },
        );
        if ('error' in multiSessionConfig) {
            return multiSessionConfig;
        }

        const promotionConfig = await normalizeServicePromotionInput(
            companyId,
            input,
            existing.price_cents,
        );
        if ('error' in promotionConfig) {
            return promotionConfig;
        }
        const inviteOnlyConfig = normalizeInviteOnlyInput(
            input,
            (existing as { invite_token?: string | null }).invite_token ?? null,
        );
        const notificationAudienceConfig = await normalizeNotificationAudienceInput(companyId, input);
        if ('error' in notificationAudienceConfig) {
            return notificationAudienceConfig;
        }

        const {
            required_resource_ids,
            is_multi_session: _isMultiSession,
            session_count: _sessionCount,
            session_duration_minutes: _sessionDurationMinutes,
            promo_price_cents: _promoPriceCents,
            promo_starts_at: _promoStartsAt,
            promo_ends_at: _promoEndsAt,
            promo_label: _promoLabel,
            is_invite_only: _isInviteOnly,
            notify_customer: _notifyCustomer,
            notify_assigned_staff: _notifyAssignedStaff,
            notify_management: _notifyManagement,
            ...coreInput
        } = input;
        await ServiceRepo.updateService(serviceId, companyId, coreInput);
        await ServiceRepo.updateService(serviceId, companyId, multiSessionConfig);
        if (Object.keys(promotionConfig).length > 0) {
            await ServiceRepo.updateService(serviceId, companyId, promotionConfig);
        }
        if (Object.keys(inviteOnlyConfig).length > 0) {
            await ServiceRepo.updateService(serviceId, companyId, inviteOnlyConfig);
        }
        if (Object.keys(notificationAudienceConfig).length > 0) {
            await ServiceRepo.updateService(serviceId, companyId, notificationAudienceConfig);
        }

        if (required_resource_ids !== undefined) {
            await ServiceRepo.setServiceRequiredResources(serviceId, companyId, required_resource_ids);
        }

        const updated = await ServiceRepo.getUpdatedService(serviceId, companyId);
        const promotionsEnabled = await companyHasCapability(
            companyId,
            'RESERVAS_SERVICE_PROMOTIONS',
        );

        return {
            code: 200,
            message: 'Servicio actualizado correctamente.',
            error: false,
            data: updated
                ? serializeServiceWithPricing(updated, promotionsEnabled)
                : updated,
        };
    } catch (error: any) {
        console.error('Error updating service:', error);
        return {
            code: 500,
            message: 'No pudimos actualizar el servicio.',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

/**
 * Soft delete a service
 */
export async function deleteService(
    companyId: number,
    serviceId: number
): Promise<ServiceResult> {
    try {
        // Check if service exists
        const existing = await ServiceRepo.getServiceById(serviceId, companyId);
        if (!existing) {
            return {
                code: 404,
                message: 'No encontramos el servicio.',
                error: true,
            };
        }

        const result = await ServiceRepo.softDeleteService(serviceId, companyId);

        if (result.count === 0) {
            return {
                code: 404,
                message: 'No encontramos el servicio o ya fue eliminado.',
                error: true,
            };
        }

        return {
            code: 200,
            message: 'Servicio eliminado correctamente.',
            error: false,
        };
    } catch (error: any) {
        console.error('Error deleting service:', error);
        return {
            code: 500,
            message: 'No pudimos eliminar el servicio.',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
