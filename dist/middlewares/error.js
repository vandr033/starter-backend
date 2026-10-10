"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const multer_1 = __importDefault(require("multer"));
const upload_errors_1 = require("../utils/upload-errors");
function errorHandler(err, _req, res, _next) {
    if (err instanceof multer_1.default.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return (0, upload_errors_1.sendUploadError)(res, { errorCode: upload_errors_1.UPLOAD_ERROR_CODES.TOO_LARGE });
        }
        return (0, upload_errors_1.sendUploadError)(res, { errorCode: upload_errors_1.UPLOAD_ERROR_CODES.MULTIPART_INVALID });
    }
    const uploadCode = (0, upload_errors_1.uploadErrorCode)(err);
    if (uploadCode) {
        return res.status((0, upload_errors_1.uploadErrorStatus)(uploadCode)).json({
            code: (0, upload_errors_1.uploadErrorStatus)(uploadCode),
            error: true,
            errorCode: uploadCode,
            reason: uploadCode,
            message: (0, upload_errors_1.uploadErrorMessage)(uploadCode),
        });
    }
    const code = err?.statusCode ?? 500;
    const msg = err?.message ?? 'INTERNAL_ERROR';
    return res.status(code).json({ error: msg });
}
