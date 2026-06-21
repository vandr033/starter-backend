import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import * as WahaAdminService from '../services/waha-admin.service';

export async function getWahaStatus(_req: AuthenticatedRequest, res: Response) {
  try {
    const result = await WahaAdminService.getSessionStatus();
    return res.status(result.code).json(result);
  } catch (error) {
    console.error('Error in getWahaStatus:', error);
    return res.status(500).json({
      code: 500,
      error: true,
      message: 'Internal server error',
    });
  }
}

export async function getWahaQr(_req: AuthenticatedRequest, res: Response) {
  try {
    const result = await WahaAdminService.getQRCode();
    return res.status(result.code).json(result);
  } catch (error) {
    console.error('Error in getWahaQr:', error);
    return res.status(500).json({
      code: 500,
      error: true,
      message: 'Internal server error',
    });
  }
}

export async function startWahaSession(_req: AuthenticatedRequest, res: Response) {
  try {
    const result = await WahaAdminService.startSession();
    return res.status(result.code).json(result);
  } catch (error) {
    console.error('Error in startWahaSession:', error);
    return res.status(500).json({
      code: 500,
      error: true,
      message: 'Internal server error',
    });
  }
}

export async function restartWahaSession(_req: AuthenticatedRequest, res: Response) {
  try {
    const result = await WahaAdminService.restartSession();
    return res.status(result.code).json(result);
  } catch (error) {
    console.error('Error in restartWahaSession:', error);
    return res.status(500).json({
      code: 500,
      error: true,
      message: 'Internal server error',
    });
  }
}

export async function logoutWahaSession(_req: AuthenticatedRequest, res: Response) {
  try {
    const result = await WahaAdminService.logoutSession();
    return res.status(result.code).json(result);
  } catch (error) {
    console.error('Error in logoutWahaSession:', error);
    return res.status(500).json({
      code: 500,
      error: true,
      message: 'Internal server error',
    });
  }
}
