import { Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as HoursService from '../services/hours.service';
import { AuthenticatedRequest } from '../middlewares/requireAuth';

let mensaje: MensajeApi;

/**
 * GET /api/admin/hours
 * Get all hours for the admin's company
 */
export async function getHours(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await HoursService.getHours(companyId);
    return res.status(result.code).json(result);
}

/**
 * PUT /api/admin/hours
 * Batch update all hours for the admin's company
 */
export async function updateHours(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const { hours } = req.body;

    // Basic validation
    if (!hours) {
        mensaje = {
            code: 400,
            message: 'hours field is required',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await HoursService.updateHours(companyId, { hours });
    return res.status(result.code).json(result);
}
