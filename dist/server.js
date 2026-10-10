"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const waha_disconnect_monitor_service_1 = require("./services/waha-disconnect-monitor.service");
const waha_service_1 = require("./services/waha.service");
const whatsapp_worker_service_1 = require("./services/whatsapp-worker.service");
const client_1 = require("./prisma/client");
const wahaProviderState = (0, waha_service_1.getWahaProviderState)();
if (wahaProviderState.mode === 'remote' && wahaProviderState.configured) {
    (0, waha_service_1.assertWahaConfiguration)();
}
else if (wahaProviderState.reason === 'PROVIDER_NOT_CONFIGURED') {
    logger_1.logger.error({ provider: 'whatsapp', reason: wahaProviderState.reason }, 'WhatsApp provider is enabled but not configured; external delivery is disabled');
}
else {
    logger_1.logger.info({ provider: 'whatsapp', reason: wahaProviderState.reason }, 'WhatsApp provider is disabled; external delivery is disabled');
}
const server = app_1.default.listen(env_1.env.port, () => {
    logger_1.logger.info(`Server is running on port ${env_1.env.port}`);
    // WhatsApp background worker
    if (process.env.ENABLE_WHATSAPP_WORKER !== 'false') {
        void (0, whatsapp_worker_service_1.startWhatsappWorker)().catch((error) => {
            logger_1.logger.error({ event: 'whatsapp_worker_start_failed', error }, 'Unable to start WhatsApp outbox worker');
        });
    }
    else {
        logger_1.logger.info('WhatsApp worker disabled for this instance');
    }
    // WAHA disconnect monitor
    if (process.env.ENABLE_WAHA_MONITOR !== 'false' &&
        wahaProviderState.mode === 'remote' &&
        wahaProviderState.configured) {
        void (0, waha_service_1.warnIfWahaSessionMissing)();
        (0, waha_disconnect_monitor_service_1.startWahaDisconnectMonitor)();
    }
    else {
        logger_1.logger.info('WAHA disconnect monitor disabled for this instance');
    }
});
let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown)
        return;
    shuttingDown = true;
    logger_1.logger.info({ event: 'server_shutdown_started', signal }, 'Graceful shutdown started');
    await (0, whatsapp_worker_service_1.stopWhatsappWorker)();
    await new Promise((resolve) => server.close(() => resolve()));
    await client_1.prisma.$disconnect();
    logger_1.logger.info({ event: 'server_shutdown_completed', signal }, 'Graceful shutdown completed');
}
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
