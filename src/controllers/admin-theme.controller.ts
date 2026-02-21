import { Response } from 'express';
import { MensajeApi } from '../types/MensajeApi';
import * as ThemeService from '../services/theme.service';
import { AuthenticatedRequest } from '../middlewares/requireAuth';

let mensaje: MensajeApi;

/**
 * GET /api/admin/theme
 * Get theme config for the admin's company
 */
export async function getTheme(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await ThemeService.getTheme(companyId);
    return res.status(result.code).json(result);
}

/**
 * PUT /api/admin/theme
 * Update theme config for the admin's company
 */
export async function updateTheme(req: AuthenticatedRequest, res: Response) {
    const companyId = (req as any).companyID;

    if (!companyId) {
        mensaje = {
            code: 400,
            message: 'Company context not found',
            error: true,
        };
        return res.status(400).json(mensaje);
    }

    const result = await ThemeService.updateTheme(companyId, req.body);
    return res.status(result.code).json(result);
}
