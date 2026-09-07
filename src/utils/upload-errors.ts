import type { Response } from 'express';

export const UPLOAD_ERROR_CODES = {
  TOO_LARGE: 'UPLOAD_TOO_LARGE',
  TYPE_NOT_ALLOWED: 'UPLOAD_TYPE_NOT_ALLOWED',
  SIGNATURE_INVALID: 'UPLOAD_SIGNATURE_INVALID',
  INTENT_INVALID: 'UPLOAD_INTENT_INVALID',
  INTENT_EXPIRED: 'UPLOAD_INTENT_EXPIRED',
  INTENT_REPLAYED: 'UPLOAD_INTENT_REPLAYED',
  FILE_REQUIRED: 'UPLOAD_FILE_REQUIRED',
  FILENAME_INVALID: 'UPLOAD_FILENAME_INVALID',
  MULTIPART_INVALID: 'UPLOAD_MULTIPART_INVALID',
  RATE_LIMITED: 'UPLOAD_RATE_LIMITED',
} as const;

export type UploadErrorCode = typeof UPLOAD_ERROR_CODES[keyof typeof UPLOAD_ERROR_CODES];

const DEFAULT_STATUS_BY_CODE: Record<UploadErrorCode, number> = {
  UPLOAD_TOO_LARGE: 413,
  UPLOAD_TYPE_NOT_ALLOWED: 415,
  UPLOAD_SIGNATURE_INVALID: 415,
  UPLOAD_INTENT_INVALID: 400,
  UPLOAD_INTENT_EXPIRED: 410,
  UPLOAD_INTENT_REPLAYED: 409,
  UPLOAD_FILE_REQUIRED: 400,
  UPLOAD_FILENAME_INVALID: 400,
  UPLOAD_MULTIPART_INVALID: 400,
  UPLOAD_RATE_LIMITED: 429,
};

const SAFE_MESSAGES: Record<UploadErrorCode, string> = {
  UPLOAD_TOO_LARGE: 'El archivo supera el límite permitido.',
  UPLOAD_TYPE_NOT_ALLOWED: 'El tipo de archivo no está permitido.',
  UPLOAD_SIGNATURE_INVALID: 'El contenido del archivo no coincide con su tipo declarado.',
  UPLOAD_INTENT_INVALID: 'La autorización de carga no es válida.',
  UPLOAD_INTENT_EXPIRED: 'La autorización de carga expiró.',
  UPLOAD_INTENT_REPLAYED: 'La autorización de carga ya fue utilizada.',
  UPLOAD_FILE_REQUIRED: 'Debes seleccionar un archivo.',
  UPLOAD_FILENAME_INVALID: 'El nombre del archivo no es válido.',
  UPLOAD_MULTIPART_INVALID: 'La carga del archivo no tiene un formato válido.',
  UPLOAD_RATE_LIMITED: 'Se alcanzó el límite temporal de cargas.',
};

export class UploadSecurityError extends Error {
  readonly errorCode: UploadErrorCode;
  readonly statusCode: number;

  constructor(errorCode: UploadErrorCode, statusCode = DEFAULT_STATUS_BY_CODE[errorCode]) {
    super(SAFE_MESSAGES[errorCode]);
    this.name = 'UploadSecurityError';
    this.errorCode = errorCode;
    this.statusCode = statusCode;
  }
}

export function uploadErrorCode(error: unknown): UploadErrorCode | null {
  const candidate = (error as { errorCode?: unknown } | null)?.errorCode;
  return typeof candidate === 'string' && Object.values(UPLOAD_ERROR_CODES).includes(candidate as UploadErrorCode)
    ? candidate as UploadErrorCode
    : null;
}

export function uploadErrorStatus(errorCode: UploadErrorCode): number {
  return DEFAULT_STATUS_BY_CODE[errorCode];
}

export function uploadErrorMessage(errorCode: UploadErrorCode): string {
  return SAFE_MESSAGES[errorCode];
}

export function sendUploadError(res: Response, error: unknown) {
  const code = uploadErrorCode(error) ?? UPLOAD_ERROR_CODES.MULTIPART_INVALID;
  const status = error instanceof UploadSecurityError
    ? error.statusCode
    : uploadErrorStatus(code);

  return res.status(status).json({
    code: status,
    error: true,
    errorCode: code,
    reason: code,
    message: uploadErrorMessage(code),
  });
}

