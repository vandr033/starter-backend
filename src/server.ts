import app from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { startWahaDisconnectMonitor } from './services/waha-disconnect-monitor.service';
import { assertWahaConfiguration, getWahaProviderState, warnIfWahaSessionMissing } from './services/waha.service';
import { startWhatsappWorker, stopWhatsappWorker } from './services/whatsapp-worker.service';
import { prisma } from './prisma/client';

const wahaProviderState = getWahaProviderState();
if (wahaProviderState.mode === 'remote' && wahaProviderState.configured) {
    assertWahaConfiguration();
} else if (wahaProviderState.reason === 'PROVIDER_NOT_CONFIGURED') {
    logger.error({ provider: 'whatsapp', reason: wahaProviderState.reason }, 'WhatsApp provider is enabled but not configured; external delivery is disabled');
} else {
    logger.info({ provider: 'whatsapp', reason: wahaProviderState.reason }, 'WhatsApp provider is disabled; external delivery is disabled');
}

const server = app.listen(env.port, () => {
    logger.info(`Server is running on port ${env.port}`);
    void startWhatsappWorker().catch((error) => {
        logger.error({ event: 'whatsapp_worker_start_failed', error }, 'Unable to start WhatsApp outbox worker');
    });
    if (wahaProviderState.mode === 'remote' && wahaProviderState.configured) {
        void warnIfWahaSessionMissing();
        startWahaDisconnectMonitor();
    }
});

let shuttingDown = false;
async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ event: 'server_shutdown_started', signal }, 'Graceful shutdown started');
    await stopWhatsappWorker();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
    logger.info({ event: 'server_shutdown_completed', signal }, 'Graceful shutdown completed');
}

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
