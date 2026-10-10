"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFileMiddleware = exports.uploadMiddleware = void 0;
exports.createUploadIntent = createUploadIntent;
exports.uploadQRImage = uploadQRImage;
exports.deleteQRImage = deleteQRImage;
exports.deleteUploadedFile = deleteUploadedFile;
const multer_1 = __importDefault(require("multer"));
const node_crypto_1 = require("node:crypto");
const client_1 = require("../prisma/client");
const logger_1 = require("../config/logger");
const storage_service_1 = require("../services/storage.service");
const upload_intent_service_1 = require("../services/upload-intent.service");
const storageDeleteToken_1 = require("../utils/storageDeleteToken");
const upload_errors_1 = require("../utils/upload-errors");
const upload_validation_1 = require("../utils/upload-validation");
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: upload_validation_1.PUBLIC_UPLOAD_MAX_BYTES },
});
exports.uploadMiddleware = upload.single('image');
exports.uploadFileMiddleware = upload.single('file');
function sendControllerError(res, error, message) {
    if ((0, upload_errors_1.uploadErrorCode)(error))
        return (0, upload_errors_1.sendUploadError)(res, error);
    logger_1.logger.error({ error }, message);
    return res.status(500).json({
        code: 500,
        error: true,
        errorCode: 'UPLOAD_INTERNAL_ERROR',
        message,
    });
}
async function isStoredUploadReferenced(relativePath) {
    const [booking, eventBooking, classEnrollment, installment, order] = await Promise.all([
        client_1.prisma.booking.count({ where: { qr_proof_image_url: relativePath } }),
        client_1.prisma.groupEventBooking.count({ where: { qr_proof_image_url: relativePath } }),
        client_1.prisma.groupClassEnrollment.count({ where: { qr_proof_image_url: relativePath } }),
        client_1.prisma.enrollmentInstallment.count({ where: { qr_proof_image_url: relativePath } }),
        client_1.prisma.commerceOrder.count({ where: { payment_proof_url: relativePath } }),
    ]);
    return booking + eventBooking + classEnrollment + installment + order > 0;
}
async function deleteStoredUpload(req, res, options) {
    const url = getOptionalString(req.body?.url);
    const deleteToken = getOptionalString(req.body?.deleteToken);
    if (!url || !deleteToken)
        throw new upload_errors_1.UploadSecurityError(upload_errors_1.UPLOAD_ERROR_CODES.INTENT_INVALID, 401);
    const relativePath = storage_service_1.StorageService.toRelativeStoragePath(url);
    if (!relativePath || !options.pathPattern.test(relativePath)) {
        throw new upload_errors_1.UploadSecurityError(upload_errors_1.UPLOAD_ERROR_CODES.INTENT_INVALID);
    }
    if (!(0, storageDeleteToken_1.verifyStorageDeleteToken)(deleteToken, relativePath)) {
        throw new upload_errors_1.UploadSecurityError(upload_errors_1.UPLOAD_ERROR_CODES.INTENT_INVALID, 403);
    }
    const intent = await client_1.prisma.uploadIntent.findFirst({
        where: {
            stored_path: relativePath,
            consumed_at: { not: null },
            purpose: { in: options.purposes },
        },
        select: { id: true },
    });
    if (!intent)
        throw new upload_errors_1.UploadSecurityError(upload_errors_1.UPLOAD_ERROR_CODES.INTENT_INVALID, 403);
    if (await isStoredUploadReferenced(relativePath)) {
        throw new upload_errors_1.UploadSecurityError(upload_errors_1.UPLOAD_ERROR_CODES.INTENT_REPLAYED, 409);
    }
    if (!(await storage_service_1.StorageService.fileExists(relativePath))) {
        throw new upload_errors_1.UploadSecurityError(upload_errors_1.UPLOAD_ERROR_CODES.INTENT_INVALID, 404);
    }
    await storage_service_1.StorageService.deleteFile(relativePath);
    await client_1.prisma.uploadIntent.update({ where: { id: intent.id }, data: { stored_path: null } });
    return res.json({ code: 200, error: false, message: options.successMessage });
}
function getOptionalString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed || null;
}
/** POST /api/upload/intents/:slug */
async function createUploadIntent(req, res) {
    try {
        const authUserId = req.authUser?.id ?? null;
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const intent = await (0, upload_intent_service_1.issueUploadIntent)({
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
    }
    catch (error) {
        return sendControllerError(res, error, 'Unable to issue upload authorization.');
    }
}
/** POST /api/upload/qr */
async function uploadQRImage(req, res) {
    let relativePath = null;
    try {
        const token = getOptionalString(req.body?.uploadIntent);
        if (!token)
            throw new upload_errors_1.UploadSecurityError(upload_errors_1.UPLOAD_ERROR_CODES.INTENT_INVALID);
        const validated = (0, upload_validation_1.validateUploadFile)(req.file, {
            maxBytes: upload_validation_1.PUBLIC_UPLOAD_MAX_BYTES,
            allowedMimeTypes: upload_validation_1.PUBLIC_UPLOAD_MIME_TYPES,
        });
        const intent = await (0, upload_intent_service_1.consumeUploadIntent)(token, {
            expectedPurpose: [upload_intent_service_1.UPLOAD_PURPOSES.BOOKING_QR_PROOF, upload_intent_service_1.UPLOAD_PURPOSES.GROUP_PAYMENT_PROOF],
        });
        if (req.body?.company_id !== undefined) {
            const callerCompanyId = Number.parseInt(String(req.body.company_id), 10);
            if (!Number.isInteger(callerCompanyId) || callerCompanyId !== intent.companyId) {
                throw new upload_errors_1.UploadSecurityError(upload_errors_1.UPLOAD_ERROR_CODES.INTENT_INVALID);
            }
        }
        const filename = `qr-${Date.now()}-${(0, node_crypto_1.randomBytes)(12).toString('hex')}.${validated.extension}`;
        relativePath = await storage_service_1.StorageService.saveFile(intent.companyId, 'qr', filename, req.file.buffer);
        await (0, upload_intent_service_1.recordStoredUpload)(intent, relativePath);
        return res.status(201).json({
            code: 201,
            error: false,
            message: 'QR proof uploaded successfully.',
            data: {
                url: storage_service_1.StorageService.getFileUrl(relativePath),
                deleteToken: (0, storageDeleteToken_1.buildStorageDeleteToken)(relativePath),
                filename,
                size: validated.size,
                mimetype: validated.mimeType,
                purpose: intent.purpose,
                contextId: intent.contextId,
            },
        });
    }
    catch (error) {
        if (relativePath)
            await storage_service_1.StorageService.deleteFile(relativePath).catch((cleanupError) => logger_1.logger.warn({ cleanupError }, 'Failed to clean up rejected public QR upload'));
        return sendControllerError(res, error, 'Unable to upload QR proof.');
    }
}
/** DELETE /api/upload/qr */
async function deleteQRImage(req, res) {
    try {
        return await deleteStoredUpload(req, res, {
            pathPattern: /^uploads\/\d+\/qr\//,
            purposes: [upload_intent_service_1.UPLOAD_PURPOSES.BOOKING_QR_PROOF, upload_intent_service_1.UPLOAD_PURPOSES.GROUP_PAYMENT_PROOF],
            successMessage: 'QR proof deleted successfully.',
        });
    }
    catch (error) {
        return sendControllerError(res, error, 'Unable to delete QR proof.');
    }
}
/** DELETE /api/upload/file */
async function deleteUploadedFile(req, res) {
    try {
        return await deleteStoredUpload(req, res, {
            pathPattern: /^uploads\/\d+\/(?:qr|commerce-payment-proofs)\//,
            purposes: [
                upload_intent_service_1.UPLOAD_PURPOSES.BOOKING_QR_PROOF,
                upload_intent_service_1.UPLOAD_PURPOSES.GROUP_PAYMENT_PROOF,
                upload_intent_service_1.UPLOAD_PURPOSES.ORDER_PAYMENT_PROOF,
            ],
            successMessage: 'Uploaded file deleted successfully.',
        });
    }
    catch (error) {
        return sendControllerError(res, error, 'Unable to delete uploaded file.');
    }
}
