import type { Request, Response } from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { prisma } from '../prisma/client';
import { logger } from '../config/logger';
import { StorageService } from '../services/storage.service';
import {
  consumeUploadIntent,
  issueUploadIntent,
  recordStoredUpload,
  UPLOAD_PURPOSES,
} from '../services/upload-intent.service';
import { buildStorageDeleteToken, verifyStorageDeleteToken } from '../utils/storageDeleteToken';
import { sendUploadError, uploadErrorCode, UploadSecurityError, UPLOAD_ERROR_CODES } from '../utils/upload-errors';
import { PUBLIC_UPLOAD_MAX_BYTES, PUBLIC_UPLOAD_MIME_TYPES, validateUploadFile } from '../utils/upload-validation';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PUBLIC_UPLOAD_MAX_BYTES },
});

export const uploadMiddleware = upload.single('image');
export const uploadFileMiddleware = upload.single('file');

function sendControllerError(res: Response, error: unknown, message: string) {
  if (uploadErrorCode(error)) return sendUploadError(res, error);
  logger.error({ error }, message);
  return res.status(500).json({
    code: 500,
    error: true,
    errorCode: 'UPLOAD_INTERNAL_ERROR',
    message,
  });
}

async function isStoredUploadReferenced(relativePath: string): Promise<boolean> {
  const [booking, eventBooking, classEnrollment, installment, order] = await Promise.all([
    prisma.booking.count({ where: { qr_proof_image_url: relativePath } }),
    prisma.groupEventBooking.count({ where: { qr_proof_image_url: relativePath } }),
    prisma.groupClassEnrollment.count({ where: { qr_proof_image_url: relativePath } }),
    prisma.enrollmentInstallment.count({ where: { qr_proof_image_url: relativePath } }),
    prisma.commerceOrder.count({ where: { payment_proof_url: relativePath } }),
  ]);
  return booking + eventBooking + classEnrollment + installment + order > 0;
}

async function deleteStoredUpload(
  req: Request,
  res: Response,
  options: { pathPattern: RegExp; purposes: string[]; successMessage: string },
) {
  const url = getOptionalString(req.body?.url);
  const deleteToken = getOptionalString(req.body?.deleteToken);
  if (!url || !deleteToken) throw new UploadSecurityError(UPLOAD_ERROR_CODES.INTENT_INVALID, 401);

  const relativePath = StorageService.toRelativeStoragePath(url);
  if (!relativePath || !options.pathPattern.test(relativePath)) {
    throw new UploadSecurityError(UPLOAD_ERROR_CODES.INTENT_INVALID);
  }
  if (!verifyStorageDeleteToken(deleteToken, relativePath)) {
    throw new UploadSecurityError(UPLOAD_ERROR_CODES.INTENT_INVALID, 403);
  }

  const intent = await prisma.uploadIntent.findFirst({
    where: {
      stored_path: relativePath,
      consumed_at: { not: null },
      purpose: { in: options.purposes },
    },
    select: { id: true },
  });
  if (!intent) throw new UploadSecurityError(UPLOAD_ERROR_CODES.INTENT_INVALID, 403);
  if (await isStoredUploadReferenced(relativePath)) {
    throw new UploadSecurityError(UPLOAD_ERROR_CODES.INTENT_REPLAYED, 409);
  }

  if (!(await StorageService.fileExists(relativePath))) {
    throw new UploadSecurityError(UPLOAD_ERROR_CODES.INTENT_INVALID, 404);
  }

  await StorageService.deleteFile(relativePath);
  await prisma.uploadIntent.update({ where: { id: intent.id }, data: { stored_path: null } });
  return res.json({ code: 200, error: false, message: options.successMessage });
}

function getOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** POST /api/upload/intents/:slug */
export async function createUploadIntent(req: Request, res: Response) {
  try {
    const authUserId = (req as Request & { authUser?: { id?: string } }).authUser?.id ?? null;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const intent = await issueUploadIntent({
      slug: Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug,
      purpose: body.purpose,
      context: body.context,
      reservationCode: body.reservationCode,
      accessToken: body.accessToken ?? body.token,
      authUserId,
    });

    return res.status(201).json({
      code: 201,
      error: false,
      message: 'Upload authorization issued.',
      data: intent,
    });
  } catch (error) {
    return sendControllerError(res, error, 'Unable to issue upload authorization.');
  }
}

/** POST /api/upload/qr */
export async function uploadQRImage(req: Request, res: Response) {
  let relativePath: string | null = null;
  try {
    const token = getOptionalString(req.body?.uploadIntent);
    if (!token) throw new UploadSecurityError(UPLOAD_ERROR_CODES.INTENT_INVALID);

    const validated = validateUploadFile(req.file, {
      maxBytes: PUBLIC_UPLOAD_MAX_BYTES,
      allowedMimeTypes: PUBLIC_UPLOAD_MIME_TYPES,
    });
    const intent = await consumeUploadIntent(token, {
      expectedPurpose: [UPLOAD_PURPOSES.BOOKING_QR_PROOF, UPLOAD_PURPOSES.GROUP_PAYMENT_PROOF],
    });

    if (req.body?.company_id !== undefined) {
      const callerCompanyId = Number.parseInt(String(req.body.company_id), 10);
      if (!Number.isInteger(callerCompanyId) || callerCompanyId !== intent.companyId) {
        throw new UploadSecurityError(UPLOAD_ERROR_CODES.INTENT_INVALID);
      }
    }

    const filename = `qr-${Date.now()}-${randomBytes(12).toString('hex')}.${validated.extension}`;
    relativePath = await StorageService.saveFile(intent.companyId, 'qr', filename, req.file!.buffer);
    await recordStoredUpload(intent, relativePath);

    return res.status(201).json({
      code: 201,
      error: false,
      message: 'QR proof uploaded successfully.',
      data: {
        url: StorageService.getFileUrl(relativePath),
        deleteToken: buildStorageDeleteToken(relativePath),
        filename,
        size: validated.size,
        mimetype: validated.mimeType,
        purpose: intent.purpose,
        contextId: intent.contextId,
      },
    });
  } catch (error) {
    if (relativePath) await StorageService.deleteFile(relativePath).catch((cleanupError) => logger.warn({ cleanupError }, 'Failed to clean up rejected public QR upload'));
    return sendControllerError(res, error, 'Unable to upload QR proof.');
  }
}

/** DELETE /api/upload/qr */
export async function deleteQRImage(req: Request, res: Response) {
  try {
    return await deleteStoredUpload(req, res, {
      pathPattern: /^uploads\/\d+\/qr\//,
      purposes: [UPLOAD_PURPOSES.BOOKING_QR_PROOF, UPLOAD_PURPOSES.GROUP_PAYMENT_PROOF],
      successMessage: 'QR proof deleted successfully.',
    });
  } catch (error) {
    return sendControllerError(res, error, 'Unable to delete QR proof.');
  }
}

/** DELETE /api/upload/file */
export async function deleteUploadedFile(req: Request, res: Response) {
  try {
    return await deleteStoredUpload(req, res, {
      pathPattern: /^uploads\/\d+\/(?:qr|commerce-payment-proofs)\//,
      purposes: [
        UPLOAD_PURPOSES.BOOKING_QR_PROOF,
        UPLOAD_PURPOSES.GROUP_PAYMENT_PROOF,
        UPLOAD_PURPOSES.ORDER_PAYMENT_PROOF,
      ],
      successMessage: 'Uploaded file deleted successfully.',
    });
  } catch (error) {
    return sendControllerError(res, error, 'Unable to delete uploaded file.');
  }
}
