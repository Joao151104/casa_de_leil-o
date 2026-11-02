import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';
import { seedIfEmpty } from './db/seed.js';
import { createLogger } from './lib/logger.js';
import { startSettlementJob } from './modules/lots/settlement.service.js';
import { attachRealtime } from './realtime.js';

const log = createLogger('api');

async function main() {
  await migrate();
  if (config.seedOnBoot) await seedIfEmpty();

  const server = http.createServer(createApp());
  const io = attachRealtime(server);
  const stopSettlement = startSettlementJob(config.settlementIntervalMs);

  server.listen(config.port, () => log.info(`ouvindo em http://localhost:${config.port}`));

  const shutdown = () => {
    stopSettlement();
    io.close();
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  log.error('falha ao iniciar', err);
  process.exit(1);
});
