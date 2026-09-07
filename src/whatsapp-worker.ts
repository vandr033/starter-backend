import { logger } from './config/logger';
import { prisma } from './prisma/client';
import { startWhatsappWorker, stopWhatsappWorker } from './services/whatsapp-worker.service';

async function main() {
  await startWhatsappWorker();
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: 'whatsapp_worker_process_shutdown_started', signal }, 'WhatsApp worker shutdown started');
  await stopWhatsappWorker();
  await prisma.$disconnect();
}

process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });

void main().catch(async (error) => {
  logger.error({ event: 'whatsapp_worker_process_failed', error }, 'WhatsApp worker process failed');
  await shutdown('ERROR');
  process.exitCode = 1;
});

