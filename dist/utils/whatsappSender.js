"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWhatsappGroup = exports.queueWhatsappText = exports.queueWhatsappImage = exports.queueWhatsappGroupMessage = exports.queueWhatsappCode = exports.queueWhatsappBatch = exports.getWhatsappEnqueueLifecycleStatus = exports.isWhatsappEnqueueAccepted = exports.sendWhatsappGroupMessage = exports.sendWhatsappImage = exports.sendWhatsappText = exports.sendWhatsappCode = void 0;
exports.isWhatsappDeliverySuccessful = isWhatsappDeliverySuccessful;
const logger_1 = require("../config/logger");
const waha_service_1 = require("../services/waha.service");
const outbound_message_service_1 = require("../services/outbound-message.service");
Object.defineProperty(exports, "isWhatsappEnqueueAccepted", { enumerable: true, get: function () { return outbound_message_service_1.isWhatsappEnqueueAccepted; } });
Object.defineProperty(exports, "getWhatsappEnqueueLifecycleStatus", { enumerable: true, get: function () { return outbound_message_service_1.getWhatsappEnqueueLifecycleStatus; } });
Object.defineProperty(exports, "queueWhatsappBatch", { enumerable: true, get: function () { return outbound_message_service_1.queueWhatsappBatch; } });
Object.defineProperty(exports, "queueWhatsappCode", { enumerable: true, get: function () { return outbound_message_service_1.queueWhatsappCode; } });
Object.defineProperty(exports, "queueWhatsappGroupMessage", { enumerable: true, get: function () { return outbound_message_service_1.queueWhatsappGroupMessage; } });
Object.defineProperty(exports, "queueWhatsappImage", { enumerable: true, get: function () { return outbound_message_service_1.queueWhatsappImage; } });
Object.defineProperty(exports, "queueWhatsappText", { enumerable: true, get: function () { return outbound_message_service_1.queueWhatsappText; } });
/**
 * Application-facing WhatsApp API.
 *
 * These names remain as compatibility aliases for older integrations, but
 * they now persist an outbox job and return an enqueue result. The only code
 * allowed to call WAHA's transport methods is whatsapp-worker.service.ts.
 */
const sendWhatsappCode = (phone, code, options) => (0, outbound_message_service_1.queueWhatsappCode)(phone, code, options);
exports.sendWhatsappCode = sendWhatsappCode;
const sendWhatsappText = (phone, text, options) => (0, outbound_message_service_1.queueWhatsappText)(phone, text, options);
exports.sendWhatsappText = sendWhatsappText;
const sendWhatsappImage = (phone, imageUrl, caption, options) => (0, outbound_message_service_1.queueWhatsappImage)(phone, imageUrl, caption, options);
exports.sendWhatsappImage = sendWhatsappImage;
const sendWhatsappGroupMessage = (groupJid, text, options) => (0, outbound_message_service_1.queueWhatsappGroupMessage)(groupJid, text, options);
exports.sendWhatsappGroupMessage = sendWhatsappGroupMessage;
// Deprecated name retained for source compatibility. It describes enqueue
// acceptance now; actual provider submission is tracked on the outbox job.
function isWhatsappDeliverySuccessful(result) {
    if (!result || typeof result !== 'object')
        return false;
    const typedResult = result;
    return typedResult.accepted === true
        && typedResult.status === 'DUPLICATE'
        && typedResult.existingStatus === 'SENT';
}
const createWhatsappGroup = async (name, participantPhones) => {
    const providerState = (0, waha_service_1.getWahaProviderState)();
    if (providerState.mode !== 'remote' || !providerState.configured) {
        logger_1.logger.info({ event: 'whatsapp_group_creation_skipped', reason: providerState.reason }, 'WhatsApp group creation skipped');
        return null;
    }
    try {
        const group = await waha_service_1.wahaClient.createGroup(name, participantPhones);
        return { jid: group.jid, name: group.name };
    }
    catch (error) {
        logger_1.logger.error({
            event: 'whatsapp_create_group_error',
            error: error instanceof Error ? error.message : 'Unknown WhatsApp group error',
        }, 'createWhatsappGroup failed');
        return null;
    }
};
exports.createWhatsappGroup = createWhatsappGroup;
