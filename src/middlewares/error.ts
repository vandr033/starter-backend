import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  sendUploadError,
  uploadErrorCode,
  uploadErrorMessage,
  uploadErrorStatus,
  UPLOAD_ERROR_CODES,
} from '../utils/upload-errors';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendUploadError(res, { errorCode: UPLOAD_ERROR_CODES.TOO_LARGE });
    }
    return sendUploadError(res, { errorCode: UPLOAD_ERROR_CODES.MULTIPART_INVALID });
  }

  const uploadCode = uploadErrorCode(err);
  if (uploadCode) {
    return res.status(uploadErrorStatus(uploadCode)).json({
      code: uploadErrorStatus(uploadCode),
      error: true,
      errorCode: uploadCode,
      reason: uploadCode,
      message: uploadErrorMessage(uploadCode),
    });
  }

  const code = err?.statusCode ?? 500;
  const msg = err?.message ?? 'INTERNAL_ERROR';
  return res.status(code).json({ error: msg });
}
