import { Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as ServiceService from '../services/service.service';
import { AuthenticatedRequest } from '../middlewares/requireAuth';

let mensaje: MensajeApi;

function parseOptionalDate(value: unknown): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;

    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
        return undefined;
    }

    return parsed;
}

/**
 * GET /api/admin/services
 * List all services for the admin's company
 */
export async function listServices(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'No encontramos el contexto de la empresa.',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await ServiceService.listServices(companyId);
    return res.status(result.code).json(result);
}

/**
 * POST /api/admin/services
 * Create a new service
 */
export async function createService(req: AuthenticatedRequest, res: Response) {
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
        category_id,
        name,
        description,
        price_cents,
        promo_price_cents,
        promo_starts_at,
        promo_ends_at,
        promo_label,
        duration_minutes,
        is_multi_session,
        session_count,
        session_duration_minutes,
        position,
        global_type_id,
        required_resource_ids,
        is_invite_only,
    } = req.body;

    // Validate required fields
    if (!category_id || typeof category_id !== 'number') {
        mensaje = {
            code: 400,
            message: 'category_id es obligatorio y debe ser numérico.',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (!name || typeof name !== 'string') {
        mensaje = {
            code: 400,
            message: 'El nombre es obligatorio.',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (price_cents === undefined || typeof price_cents !== 'number') {
        mensaje = {
            code: 400,
            message: 'price_cents es obligatorio y debe ser numérico.',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (duration_minutes === undefined || typeof duration_minutes !== 'number') {
        mensaje = {
            code: 400,
            message: 'duration_minutes es obligatorio y debe ser numérico.',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const parsedPromoStartsAt = parseOptionalDate(promo_starts_at);
    if (promo_starts_at !== undefined && parsedPromoStartsAt === undefined) {
        return res.status(400).json({
            code: 400,
            message: 'promo_starts_at no tiene un formato válido.',
            error: true,
        });
    }

    const parsedPromoEndsAt = parseOptionalDate(promo_ends_at);
    if (promo_ends_at !== undefined && parsedPromoEndsAt === undefined) {
        return res.status(400).json({
            code: 400,
            message: 'promo_ends_at no tiene un formato válido.',
            error: true,
        });
    }

    const result = await ServiceService.createService(companyId, {
        category_id,
        name,
        description,
        price_cents,
        promo_price_cents:
            promo_price_cents === null || promo_price_cents === undefined
                ? promo_price_cents
                : Number(promo_price_cents),
        promo_starts_at: parsedPromoStartsAt,
        promo_ends_at: parsedPromoEndsAt,
        promo_label: typeof promo_label === 'string' ? promo_label : undefined,
        duration_minutes,
        is_multi_session: typeof is_multi_session === 'boolean' ? is_multi_session : undefined,
        session_count: typeof session_count === 'number' ? session_count : undefined,
        session_duration_minutes:
            typeof session_duration_minutes === 'number'
                ? session_duration_minutes
                : undefined,
        position,
        global_type_id,
        required_resource_ids: Array.isArray(required_resource_ids) ? required_resource_ids : undefined,
        is_invite_only: typeof is_invite_only === 'boolean' ? is_invite_only : undefined,
    });

    return res.status(result.code).json(result);
}

/**
 * PUT /api/admin/services/:id
 * Update a service
 */
export async function updateService(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const serviceId = parseInt(req.params.id as string, 10);

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'No encontramos el contexto de la empresa.',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (isNaN(serviceId)) {
        mensaje = {
            code: 400,
            message: 'El ID del servicio no es válido.',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const {
        name,
        description,
        price_cents,
        promo_price_cents,
        promo_starts_at,
        promo_ends_at,
        promo_label,
        duration_minutes,
        is_multi_session,
        session_count,
        session_duration_minutes,
        position,
        is_active,
        category_id,
        global_type_id,
        required_resource_ids,
        is_invite_only,
    } = req.body;

    const parsedPromoStartsAt = parseOptionalDate(promo_starts_at);
    if (promo_starts_at !== undefined && parsedPromoStartsAt === undefined) {
        return res.status(400).json({
            code: 400,
            message: 'promo_starts_at no tiene un formato válido.',
            error: true,
        });
    }

    const parsedPromoEndsAt = parseOptionalDate(promo_ends_at);
    if (promo_ends_at !== undefined && parsedPromoEndsAt === undefined) {
        return res.status(400).json({
            code: 400,
            message: 'promo_ends_at no tiene un formato válido.',
            error: true,
        });
    }

    const result = await ServiceService.updateService(companyId, serviceId, {
        name,
        description,
        price_cents,
        promo_price_cents:
            promo_price_cents === null || promo_price_cents === undefined
                ? promo_price_cents
                : Number(promo_price_cents),
        promo_starts_at: parsedPromoStartsAt,
        promo_ends_at: parsedPromoEndsAt,
        promo_label: typeof promo_label === 'string' ? promo_label : undefined,
        duration_minutes,
        is_multi_session: typeof is_multi_session === 'boolean' ? is_multi_session : undefined,
        session_count: typeof session_count === 'number' ? session_count : undefined,
        session_duration_minutes:
            typeof session_duration_minutes === 'number'
                ? session_duration_minutes
                : undefined,
        position,
        is_active,
        category_id,
        global_type_id,
        required_resource_ids: Array.isArray(required_resource_ids) ? required_resource_ids : undefined,
        is_invite_only: typeof is_invite_only === 'boolean' ? is_invite_only : undefined,
    });

    return res.status(result.code).json(result);
}

/**
 * DELETE /api/admin/services/:id
 * Soft delete a service
 */
export async function deleteService(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const serviceId = parseInt(req.params.id as string, 10);

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'No encontramos el contexto de la empresa.',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (isNaN(serviceId)) {
        mensaje = {
            code: 400,
            message: 'El ID del servicio no es válido.',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await ServiceService.deleteService(companyId, serviceId);
    return res.status(result.code).json(result);
}
