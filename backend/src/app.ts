import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { AppError } from './lib/errors.js';
import { createLogger } from './lib/logger.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { optionalAuth } from './modules/auth/auth.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { catalogHealth } from './modules/catalog/catalog.service.js';
import { lotsRouter } from './modules/lots/lot.routes.js';
import { meRouter } from './modules/lots/me.routes.js';
import { receiptsRouter } from './modules/receipts/receipts.routes.js';
import { walletRouter } from './modules/wallet/wallet.routes.js';

const log = createLogger('api');

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.details } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON inválido.' } });
    return;
  }
  log.error('erro não tratado', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Erro inesperado. Tente novamente.' } });
};

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      // API JSON pura: a CSP da página fica a cargo do frontend.
      contentSecurityPolicy: false,
      // HSTS faria o Safari forçar https://localhost (e memorizar isso). O HTTPS em produção
      // já é garantido pela plataforma de deploy.
      strictTransportSecurity: false,
      // Permite que o frontend (outra origem, se não estiver atrás do proxy) exiba /api/images.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  if (config.corsOrigin) app.use(cors({ origin: config.corsOrigin.split(',') }));
  app.use(express.json({ limit: '100kb' }));
  app.use(optionalAuth);

  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, serverTime: new Date(), catalog: catalogHealth() });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/lots', lotsRouter);
  app.use('/api/me', meRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/receipts', receiptsRouter);

  app.get('/api/images/:id', async (req, res) => {
    const { rows } = await pool.query('SELECT content_type, bytes FROM images WHERE id::text = $1', [req.params.id]);
    if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Imagem não encontrada.');
    res.set('Cache-Control', 'public, max-age=31536000, immutable').type(rows[0].content_type).send(rows[0].bytes);
  });

  app.use('/api', (_req, _res) => {
    throw new AppError(404, 'NOT_FOUND', 'Rota não encontrada.');
  });

  app.use(errorHandler);
  return app;
}
