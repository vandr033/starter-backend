import { Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as StaffService from '../services/staff.service';
import { AuthenticatedRequest } from '../middlewares/requireAuth';

let mensaje: MensajeApi;

/**
 * GET /api/admin/staff/:id/services
 * Get services assigned to a staff member
 */
export async function getStaffServices(req: AuthenticatedRequest, res: Response) {
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

    const result = await StaffService.getStaffServices(companyId, staffId);
    return res.status(result.code).json(result);
}

/**
 * PUT /api/admin/staff/:id/services
 * Update services assigned to a staff member
 */
export async function updateStaffServices(req: AuthenticatedRequest, res: Response) {
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

    const { service_ids } = req.body;

    // Validate service_ids
    if (!Array.isArray(service_ids)) {
        mensaje = {
            code: 400,
            message: 'service_ids must be an array',
            error: true,
        };
        return res.status(400).json(mensaje);
    }
    
    // Check all items are numbers
    const nonNumberIds = service_ids.filter((id: any) => typeof id !== 'number' || isNaN(id));
    if (nonNumberIds.length > 0) {
        mensaje = {
            code: 400,
            message: 'All service_ids must be numbers',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await StaffService.updateStaffServices(companyId, staffId, service_ids);
    return res.status(result.code).json(result);
}
