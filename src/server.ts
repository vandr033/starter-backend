import app from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { startWahaDisconnectMonitor } from './services/waha-disconnect-monitor.service';
import { assertWahaConfiguration, warnIfWahaSessionMissing } from './services/waha.service';

assertWahaConfiguration();

app.listen(env.port, () => {
    logger.info(`Server is running on port ${env.port}`);
    void warnIfWahaSessionMissing();
    startWahaDisconnectMonitor();
});
