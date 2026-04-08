import { Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as ServiceService from '../services/service.service';
import { AuthenticatedRequest } from '../middlewares/requireAuth';

let mensaje: MensajeApi;

/**
 * GET /api/admin/services
 * List all services for the admin's company
 */
export async function listServices(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
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

    const { category_id, name, description, price_cents, duration_minutes, position, global_type_id, required_resource_ids } = req.body;

    // Validate required fields
    if (!category_id || typeof category_id !== 'number') {
        mensaje = {
            code: 400,
            message: 'category_id is required and must be a number',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (!name || typeof name !== 'string') {
        mensaje = {
            code: 400,
            message: 'name is required',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (price_cents === undefined || typeof price_cents !== 'number') {
        mensaje = {
            code: 400,
            message: 'price_cents is required and must be a number',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (duration_minutes === undefined || typeof duration_minutes !== 'number') {
        mensaje = {
            code: 400,
            message: 'duration_minutes is required and must be a number',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await ServiceService.createService(companyId, {
        category_id,
        name,
        description,
        price_cents,
        duration_minutes,
        position,
        global_type_id,
        required_resource_ids: Array.isArray(required_resource_ids) ? required_resource_ids : undefined,
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
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (isNaN(serviceId)) {
        mensaje = {
            code: 400,
            message: 'Invalid service ID',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const { name, description, price_cents, duration_minutes, position, is_active, category_id, global_type_id, required_resource_ids } = req.body;

    const result = await ServiceService.updateService(companyId, serviceId, {
        name,
        description,
        price_cents,
        duration_minutes,
        position,
        is_active,
        category_id,
        global_type_id,
        required_resource_ids: Array.isArray(required_resource_ids) ? required_resource_ids : undefined,
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
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (isNaN(serviceId)) {
        mensaje = {
            code: 400,
            message: 'Invalid service ID',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await ServiceService.deleteService(companyId, serviceId);
    return res.status(result.code).json(result);
}
