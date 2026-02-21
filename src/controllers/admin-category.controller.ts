import { Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as CategoryService from '../services/category.service';
import { AuthenticatedRequest } from '../middlewares/requireAuth';

// Force recompilation
let mensaje: MensajeApi;

/**
 * GET /api/admin/categories
 * List all categories for the admin's company
 */
export async function getCategories(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await CategoryService.listCategories(companyId);
    return res.status(result.code).json(result);
}

/**
 * POST /api/admin/categories
 * Create a new category
 */
export async function createCategory(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const { name, description, position, global_service_type_id } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
        mensaje = {
            code: 400,
            message: 'name is required and must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (description && typeof description !== 'string') {
        mensaje = {
            code: 400,
            message: 'description must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (position !== undefined && (typeof position !== 'number' || position < 0)) {
        mensaje = {
            code: 400,
            message: 'position must be a non-negative number',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (global_service_type_id !== undefined && (typeof global_service_type_id !== 'number' || global_service_type_id < 1)) {
        mensaje = {
            code: 400,
            message: 'global_service_type_id must be a positive number',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await CategoryService.createCategory(companyId, {
        name,
        description,
        position,
        global_service_type_id,
    });

    return res.status(result.code).json(result);
}

/**
 * PUT /api/admin/categories/:id
 * Update a category
 */
export async function updateCategory(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const categoryId = parseInt(req.params.id as string, 10);

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (isNaN(categoryId)) {
        mensaje = {
            code: 400,
            message: 'Invalid category ID',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const { name, description, position, is_active, global_service_type_id } = req.body;

    // Validate fields if provided
    if (name !== undefined) {
        if (typeof name !== 'string') {
            mensaje = {
                code: 400,
                message: 'name must be a string',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
    }

    if (description !== undefined && typeof description !== 'string') {
        mensaje = {
            code: 400,
            message: 'description must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (position !== undefined) {
        if (typeof position !== 'number' || position < 0) {
            mensaje = {
                code: 400,
                message: 'position must be a non-negative number',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
    }

    if (is_active !== undefined && typeof is_active !== 'boolean') {
        mensaje = {
            code: 400,
            message: 'is_active must be a boolean',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (global_service_type_id !== undefined) {
        if (typeof global_service_type_id !== 'number' || global_service_type_id < 1) {
            mensaje = {
                code: 400,
                message: 'global_service_type_id must be a positive number',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
    }

    const result = await CategoryService.updateCategory(companyId, categoryId, {
        name,
        description,
        position,
        is_active,
        global_service_type_id,
    });

    return res.status(result.code).json(result);
}

/**
 * DELETE /api/admin/categories/:id
 * Soft delete a category
 */
export async function deleteCategory(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const categoryId = parseInt(req.params.id as string, 10);

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (isNaN(categoryId)) {
        mensaje = {
            code: 400,
            message: 'Invalid category ID',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await CategoryService.deleteCategory(companyId, categoryId);
    return res.status(result.code).json(result);
}

/**
 * GET /api/admin/global-service-types
 * Get all global service types for dropdown
 */
export async function getGlobalServiceTypes(req: AuthenticatedRequest, res: Response) {
    const result = await CategoryService.getGlobalServiceTypes();
    return res.status(result.code).json(result);
}
