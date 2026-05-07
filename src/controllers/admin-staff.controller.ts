import { Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as StaffService from '../services/staff.service';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import { CompanyUserRole } from '@prisma/client';

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
 * GET /api/admin/staff/:id
 * Get a single staff profile for the admin's company
 */
export async function getStaff(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const staffId = Number(req.params.id);

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (!Number.isInteger(staffId) || staffId <= 0) {
        mensaje = {
            code: 400,
            message: 'Invalid staff ID',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await StaffService.getStaff(companyId, staffId);
    return res.status(result.code).json(result);
}

/**
 * GET /api/admin/staff/me
 * Get authenticated staff member profile for current company context
 */
export async function getMyProfile(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const userId = req.authUser?.id;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (!userId) {
        mensaje = {
            code: 401,
            message: 'Unauthorized',
            error: true,
        };
        return res.status(401).json(mensaje);
    }

    const result = await StaffService.getMyProfile(companyId, userId);
    return res.status(result.code).json(result);
}

/**
 * PUT /api/admin/staff/me
 * Update authenticated staff member profile for current company context
 */
export async function updateMyProfile(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;
    const userId = req.authUser?.id;
    const { display_name, bio, first_name, last_name, phone, phone_prefix } = req.body;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (!userId) {
        mensaje = {
            code: 401,
            message: 'Unauthorized',
            error: true,
        };
        return res.status(401).json(mensaje);
    }

    if (display_name !== undefined) {
        if (typeof display_name !== 'string') {
            mensaje = {
                code: 400,
                message: 'display_name must be a string',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
        if (display_name.trim().length === 0 || display_name.trim().length > 191) {
            mensaje = {
                code: 400,
                message: 'display_name must be between 1 and 191 characters',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
    }

    if (bio !== undefined && bio !== null && typeof bio !== 'string') {
        mensaje = {
            code: 400,
            message: 'bio must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (first_name !== undefined && typeof first_name !== 'string') {
        mensaje = {
            code: 400,
            message: 'first_name must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (last_name !== undefined && typeof last_name !== 'string') {
        mensaje = {
            code: 400,
            message: 'last_name must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (phone !== undefined && typeof phone !== 'string') {
        mensaje = {
            code: 400,
            message: 'phone must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (phone_prefix !== undefined && typeof phone_prefix !== 'string') {
        mensaje = {
            code: 400,
            message: 'phone_prefix must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await StaffService.updateMyProfile(companyId, userId, {
        display_name: typeof display_name === 'string' ? display_name.trim() : undefined,
        bio: bio === undefined ? undefined : (typeof bio === 'string' ? bio.trim() : ''),
        first_name: typeof first_name === 'string' ? first_name.trim() : undefined,
        last_name: typeof last_name === 'string' ? last_name.trim() : undefined,
        phone: typeof phone === 'string' ? phone.trim() : undefined,
        phone_prefix: typeof phone_prefix === 'string' ? phone_prefix.trim() : undefined,
    });

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

    const { email, display_name, role, phone_prefix, phone, bio, is_bookable, service_ids, start_date, end_date } = req.body;

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

    const requesterRole = (req as any).companyUser?.role as CompanyUserRole | undefined;
    const requesterIsSuperAdmin = Boolean(req.authUser?.is_super_admin);

    if (role !== undefined) {
        if (
            typeof role !== 'string' ||
            (role !== CompanyUserRole.OWNER &&
                role !== CompanyUserRole.ADMIN &&
                role !== CompanyUserRole.STAFF)
        ) {
            mensaje = {
                code: 400,
                message: 'role must be OWNER, ADMIN or STAFF',
                error: true,
            };
            return res.status(400).json(mensaje);
        }

        if (
            role === CompanyUserRole.OWNER &&
            requesterRole !== CompanyUserRole.OWNER &&
            !requesterIsSuperAdmin
        ) {
            mensaje = {
                code: 403,
                message: 'Only an owner can create another owner',
                error: true,
            };
            return res.status(403).json(mensaje);
        }
    }

    if (phone_prefix !== undefined && typeof phone_prefix !== 'string') {
        mensaje = {
            code: 400,
            message: 'phone_prefix must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (phone !== undefined && typeof phone !== 'string') {
        mensaje = {
            code: 400,
            message: 'phone must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (bio !== undefined && bio !== null && typeof bio !== 'string') {
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
        role: role as CompanyUserRole | undefined,
        phone_prefix: phone_prefix?.trim(),
        phone: phone?.trim(),
        bio: typeof bio === 'string' ? bio.trim() : '',
        is_bookable,
        service_ids,
        start_date,
        end_date,
    });

    return res.status(result.code).json(result);
}

/**
 * POST /api/admin/staff/:id/resend-invite
 * Resend invitation email for a pending staff member
 */
export async function resendStaffInvite(req: AuthenticatedRequest, res: Response) {
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

    const result = await StaffService.resendStaffInvite(companyId, staffId);
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

    const { email, phone, phone_prefix, display_name, bio, image_url, is_bookable, service_ids, resource_type } = req.body;

    // Validate resource_type if provided
    const validResourceTypes = ['PERSON', 'ROOM', 'EQUIPMENT'];
    if (resource_type !== undefined && !validResourceTypes.includes(resource_type)) {
        mensaje = {
            code: 400,
            message: 'resource_type must be one of: PERSON, ROOM, EQUIPMENT',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

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

    if (bio !== undefined && bio !== null && typeof bio !== 'string') {
        mensaje = {
            code: 400,
            message: 'bio must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (email !== undefined) {
        if (typeof email !== 'string') {
            mensaje = {
                code: 400,
                message: 'email must be a string',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            mensaje = {
                code: 400,
                message: 'email must be a valid email address',
                error: true,
            };
            return res.status(400).json(mensaje);
        }
    }

    if (phone !== undefined && typeof phone !== 'string') {
        mensaje = {
            code: 400,
            message: 'phone must be a string',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    if (phone_prefix !== undefined && typeof phone_prefix !== 'string') {
        mensaje = {
            code: 400,
            message: 'phone_prefix must be a string',
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
        email: email?.trim().toLowerCase(),
        phone: phone?.trim(),
        phone_prefix: phone_prefix?.trim(),
        display_name: display_name?.trim(),
        bio: bio === undefined ? undefined : (typeof bio === 'string' ? bio.trim() : ''),
        image_url: image_url?.trim(),
        is_bookable,
        resource_type,
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
