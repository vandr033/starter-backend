"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("./config/logger");
const client_1 = require("./prisma/client");
const whatsapp_worker_service_1 = require("./services/whatsapp-worker.service");
async function main() {
    await (0, whatsapp_worker_service_1.startWhatsappWorker)();
}
let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown)
        return;
    shuttingDown = true;
    logger_1.logger.info({ event: 'whatsapp_worker_process_shutdown_started', signal }, 'WhatsApp worker shutdown started');
    await (0, whatsapp_worker_service_1.stopWhatsappWorker)();
    await client_1.prisma.$disconnect();
}
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
void main().catch(async (error) => {
    logger_1.logger.error({ event: 'whatsapp_worker_process_failed', error }, 'WhatsApp worker process failed');
    await shutdown('ERROR');
    process.exitCode = 1;
});
