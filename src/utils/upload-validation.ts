import { UploadSecurityError, UPLOAD_ERROR_CODES } from './upload-errors';

export const PUBLIC_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const PUBLIC_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

type UploadFileLike = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size?: number;
};

type FileRule = {
  extension: string;
  extensions: readonly string[];
  signature: (buffer: Buffer) => boolean;
};

const FILE_RULES: Record<string, FileRule> = {
  'image/jpeg': {
    extension: 'jpg',
    extensions: ['jpg', 'jpeg'],
    signature: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  'image/png': {
    extension: 'png',
    extensions: ['png'],
    signature: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/webp': {
    extension: 'webp',
    extensions: ['webp'],
    signature: (buffer) => buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  'image/gif': {
    extension: 'gif',
    extensions: ['gif'],
    signature: (buffer) => buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii')),
  },
  'application/pdf': {
    extension: 'pdf',
    extensions: ['pdf'],
    signature: (buffer) => buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-',
  },
};

export function canonicalUploadMimeType(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

function assertSafeOriginalName(originalname: string): string {
  const value = typeof originalname === 'string' ? originalname.trim() : '';
  if (!value || value.length > 255 || /[\\/]/.test(value) || value.split(/[\\/]/).some((segment) => segment === '..')) {
    throw new UploadSecurityError(UPLOAD_ERROR_CODES.FILENAME_INVALID);
  }

  const extension = value.includes('.') ? value.slice(value.lastIndexOf('.') + 1).toLowerCase() : '';
  if (!extension || !/^[a-z0-9]{1,8}$/.test(extension)) {
    throw new UploadSecurityError(UPLOAD_ERROR_CODES.SIGNATURE_INVALID);
  }

  return extension;
}

export function validateUploadFile(
  file: UploadFileLike | undefined | null,
  options: { maxBytes: number; allowedMimeTypes: readonly string[] } = {
    maxBytes: PUBLIC_UPLOAD_MAX_BYTES,
    allowedMimeTypes: PUBLIC_UPLOAD_MIME_TYPES,
  },
): { mimeType: string; extension: string; size: number } {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new UploadSecurityError(UPLOAD_ERROR_CODES.FILE_REQUIRED);
  }

  const size = file.buffer.length;
  if (size > options.maxBytes) {
    throw new UploadSecurityError(UPLOAD_ERROR_CODES.TOO_LARGE);
  }
  if (size <= 0) {
    throw new UploadSecurityError(UPLOAD_ERROR_CODES.SIGNATURE_INVALID);
  }

  const mimeType = canonicalUploadMimeType(file.mimetype || '');
  const allowed = new Set(options.allowedMimeTypes.map(canonicalUploadMimeType));
  if (!allowed.has(mimeType) || !FILE_RULES[mimeType]) {
    throw new UploadSecurityError(UPLOAD_ERROR_CODES.TYPE_NOT_ALLOWED);
  }

  const extension = assertSafeOriginalName(file.originalname || '');
  const rule = FILE_RULES[mimeType];
  if (!rule.extensions.includes(extension) || !rule.signature(file.buffer)) {
    throw new UploadSecurityError(UPLOAD_ERROR_CODES.SIGNATURE_INVALID);
  }

  return { mimeType, extension: rule.extension, size };
}
