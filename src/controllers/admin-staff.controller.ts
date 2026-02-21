import { Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as StaffService from '../services/staff.service';
import { AuthenticatedRequest } from '../middlewares/requireAuth';

let mensaje: MensajeApi;

/**
 * GET /api/admin/staff
 * List all staff profiles for the admin's company
 */
export async function listStaff(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await StaffService.listStaff(companyId);
    return res.status(result.code).json(result);
}

/**
 * POST /api/admin/staff
 * Create a new staff profile
 */
export async function createStaff(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const { email, display_name, bio, is_bookable, service_ids } = req.body;

    // Validate required fields
    if (!email || typeof email !== 'string') {
        mensaje = {
            code: 400,
            message: 'email is required and must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        mensaje = {
            code: 400,
            message: 'Invalid email format',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (!display_name || typeof display_name !== 'string') {
        mensaje = {
            code: 400,
            message: 'display_name is required and must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (display_name.length > 191) {
        mensaje = {
            code: 400,
            message: 'display_name must be less than 191 characters',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (bio && typeof bio !== 'string') {
        mensaje = {
            code: 400,
            message: 'bio must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (is_bookable !== undefined && typeof is_bookable !== 'boolean') {
        mensaje = {
            code: 400,
            message: 'is_bookable must be a boolean',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    // Validate service_ids if provided
    if (service_ids !== undefined) {
        if (!Array.isArray(service_ids)) {
            mensaje = {
                code: 400,
                message: 'service_ids must be an array',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
        
        // Check all items are numbers
        const nonNumberIds = service_ids.filter(id => typeof id !== 'number' || isNaN(id));
        if (nonNumberIds.length > 0) {
            mensaje = {
                code: 400,
                message: 'All service_ids must be numbers',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
    }

    const result = await StaffService.createStaff(companyId, {
        email: email.toLowerCase().trim(),
        display_name: display_name.trim(),
        bio: bio?.trim(),
        is_bookable,
        service_ids,
    });

    return res.status(result.code).json(result);
}

/**
 * PUT /api/admin/staff/:id
 * Update a staff profile
 */
export async function updateStaff(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const staffId = parseInt(req.params.id as string, 10);

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (isNaN(staffId)) {
        mensaje = {
            code: 400,
            message: 'Invalid staff ID',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const { display_name, bio, image_url, is_bookable, service_ids } = req.body;

    // Validate fields if provided
    if (display_name !== undefined) {
        if (typeof display_name !== 'string') {
            mensaje = {
                code: 400,
                message: 'display_name must be a string',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
        if (display_name.length === 0 || display_name.length > 191) {
            mensaje = {
                code: 400,
                message: 'display_name must be between 1 and 191 characters',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
    }

    if (bio !== undefined && typeof bio !== 'string') {
        mensaje = {
            code: 400,
            message: 'bio must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (image_url !== undefined) {
        if (typeof image_url !== 'string') {
            mensaje = {
                code: 400,
                message: 'image_url must be a string',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
        if (image_url.length > 512) {
            mensaje = {
                code: 400,
                message: 'image_url must be less than 512 characters',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
    }

    if (is_bookable !== undefined && typeof is_bookable !== 'boolean') {
        mensaje = {
            code: 400,
            message: 'is_bookable must be a boolean',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    // Validate service_ids if provided
    if (service_ids !== undefined) {
        if (!Array.isArray(service_ids)) {
            mensaje = {
                code: 400,
                message: 'service_ids must be an array',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
        
        // Check all items are numbers
        const nonNumberIds = service_ids.filter(id => typeof id !== 'number' || isNaN(id));
        if (nonNumberIds.length > 0) {
            mensaje = {
                code: 400,
                message: 'All service_ids must be numbers',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
    }

    const result = await StaffService.updateStaff(companyId, staffId, {
        display_name: display_name?.trim(),
        bio: bio?.trim(),
        image_url: image_url?.trim(),
        is_bookable,
        service_ids,
    });

    return res.status(result.code).json(result);
}

/**
 * DELETE /api/admin/staff/:id
 * Soft delete a staff profile
 */
export async function deleteStaff(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const staffId = parseInt(req.params.id as string, 10);

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (isNaN(staffId)) {
        mensaje = {
            code: 400,
            message: 'Invalid staff ID',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await StaffService.deleteStaff(companyId, staffId);
    return res.status(result.code).json(result);
}
