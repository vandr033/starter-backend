import type { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/requireAuth';
import {
  cancelWhatsappBatch,
  cancelWhatsappJob,
  getWhatsappBatchProgress,
  getWhatsappJob,
  retryWhatsappBatch,
  retryWhatsappJob,
} from '../services/outbound-message.service';

function companyIdOf(req: AuthenticatedRequest, res: Response): number | null {
  const companyId = Number((req as any).companyID);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    res.status(400).json({ code: 400, error: true, message: 'Company context not found' });
    return null;
  }
  return companyId;
}

function batchIdOf(req: AuthenticatedRequest, res: Response): string | null {
  const batchId = String(req.params.batchId || '').trim();
  if (!batchId || batchId.length > 30) {
    res.status(400).json({ code: 400, error: true, message: 'Invalid batchId' });
    return null;
  }
  return batchId;
}

function jobIdOf(req: AuthenticatedRequest, res: Response): number | null {
  const jobId = Number.parseInt(String(req.params.jobId || ''), 10);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    res.status(400).json({ code: 400, error: true, message: 'Invalid jobId' });
    return null;
  }
  return jobId;
}

export async function getBatch(req: AuthenticatedRequest, res: Response) {
  const companyId = companyIdOf(req, res);
  if (!companyId) return;
  const batchId = batchIdOf(req, res);
  if (!batchId) return;

  const progress = await getWhatsappBatchProgress(batchId, companyId);
  if (!progress) return res.status(404).json({ code: 404, error: true, message: 'Outbound batch not found' });
  return res.json({ code: 200, error: false, data: progress });
}

export async function retryBatch(req: AuthenticatedRequest, res: Response) {
  const companyId = companyIdOf(req, res);
  if (!companyId) return;
  const batchId = batchIdOf(req, res);
  if (!batchId) return;

  const progress = await getWhatsappBatchProgress(batchId, companyId);
  if (!progress) return res.status(404).json({ code: 404, error: true, message: 'Outbound batch not found' });
  const retried = await retryWhatsappBatch(batchId, companyId);
  return res.json({ code: 200, error: false, data: { batch_id: batchId, retried } });
}

export async function cancelBatch(req: AuthenticatedRequest, res: Response) {
  const companyId = companyIdOf(req, res);
  if (!companyId) return;
  const batchId = batchIdOf(req, res);
  if (!batchId) return;

  const progress = await getWhatsappBatchProgress(batchId, companyId);
  if (!progress) return res.status(404).json({ code: 404, error: true, message: 'Outbound batch not found' });
  const cancelled = await cancelWhatsappBatch(batchId, companyId);
  return res.json({ code: 200, error: false, data: { batch_id: batchId, cancelled } });
}

export async function retryJob(req: AuthenticatedRequest, res: Response) {
  const companyId = companyIdOf(req, res);
  if (!companyId) return;
  const jobId = jobIdOf(req, res);
  if (!jobId) return;

  const existing = await getWhatsappJob(jobId, companyId);
  if (!existing) return res.status(404).json({ code: 404, error: true, message: 'Outbound job not found' });
  const job = await retryWhatsappJob(jobId, companyId);
  if (!job) return res.status(409).json({ code: 409, error: true, message: 'Job is not eligible for retry' });
  return res.json({ code: 200, error: false, data: { job_id: job.id, status: job.status } });
}

export async function cancelJob(req: AuthenticatedRequest, res: Response) {
  const companyId = companyIdOf(req, res);
  if (!companyId) return;
  const jobId = jobIdOf(req, res);
  if (!jobId) return;

  const existing = await getWhatsappJob(jobId, companyId);
  if (!existing) return res.status(404).json({ code: 404, error: true, message: 'Outbound job not found' });
  const cancelled = await cancelWhatsappJob(jobId, companyId);
  if (!cancelled) return res.status(409).json({ code: 409, error: true, message: 'Job is not pending' });
  return res.json({ code: 200, error: false, data: { job_id: jobId, cancelled: true } });
}

