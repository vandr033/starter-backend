"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildServiceErrorResponse = exports.buildNotFoundResponse = exports.buildSuccessResponse = void 0;
const MensajeApi_1 = require("../types/MensajeApi");
const extractTechnicalMessage = (error) => error instanceof Error ? error.message : 'Unknown error';
const buildSuccessResponse = (message, data, code = 200) => new MensajeApi_1.MensajeApi({
    code,
    error: false,
    message,
    data,
});
exports.buildSuccessResponse = buildSuccessResponse;
const buildNotFoundResponse = (entityLabel, message, code = 404) => new MensajeApi_1.MensajeApi({
    code,
    error: true,
    message: message ?? `${entityLabel} not found`,
});
exports.buildNotFoundResponse = buildNotFoundResponse;
const buildServiceErrorResponse = (entityLabel, action, error, code = 500) => new MensajeApi_1.MensajeApi({
    code,
    error: true,
    message: `Unable to ${action} ${entityLabel.toLowerCase()}`,
    technicalMessage: extractTechnicalMessage(error),
});
exports.buildServiceErrorResponse = buildServiceErrorResponse;
