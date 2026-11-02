import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from './config.js';
import { events } from './lib/events.js';
import { createLogger } from './lib/logger.js';
import { formatBRL } from './lib/money.js';
import { verifyToken } from './modules/auth/auth.js';
import { listPublicBids } from './modules/bids/bid.service.js';
import { getLotDto } from './modules/lots/lot.service.js';

const log = createLogger('realtime');

/** Um erro ao repassar um evento não pode derrubar o processo. */
const safe =
  <T>(fn: (payload: T) => Promise<void>) =>
  (payload: T) =>
    fn(payload).catch((err) => log.error('falha ao repassar evento', err));

/**
 * Salas: `lot:<id>` (quem está na sala do lote), `showcase` (vitrine) e `user:<id>`
 * (notificações privadas: "você foi superado", carteira alterada, arremate).
 */
export function attachRealtime(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: config.corsOrigin ? { origin: config.corsOrigin.split(',') } : undefined,
  });

  io.on('connection', (socket) => {
    const user = typeof socket.handshake.auth?.token === 'string' ? verifyToken(socket.handshake.auth.token) : null;
    if (user) socket.join(`user:${user.id}`);
    socket.on('lot:watch', (lotId: unknown) => typeof lotId === 'string' && socket.join(`lot:${lotId}`));
    socket.on('lot:unwatch', (lotId: unknown) => typeof lotId === 'string' && socket.leave(`lot:${lotId}`));
    socket.on('showcase:watch', () => socket.join('showcase'));
    socket.on('showcase:unwatch', () => socket.leave('showcase'));
  });

  const notify = (userId: string, payload: Record<string, unknown>) =>
    io.to(`user:${userId}`).emit('notification', payload);

  const broadcastLot = async (lotId: string) => {
    const lot = await getLotDto(lotId);
    io.to(`lot:${lotId}`).emit('lot:update', { lot, bids: await listPublicBids(lotId) });
    io.to('showcase').emit('showcase:update', { lot });
    return lot;
  };

  events.onEvent(
    'bid.placed',
    safe(async ({ lotId, bidderId, previousLeaderId }) => {
      const lot = await broadcastLot(lotId);
      if (previousLeaderId && previousLeaderId !== bidderId) {
        notify(previousLeaderId, {
          type: 'outbid',
          lotId,
          message: `Você foi superado em "${lot.title}". Lance atual: ${formatBRL(lot.currentPriceCents!)}.`,
        });
      }
    }),
  );
  events.onEvent(
    'lot.created',
    safe(async ({ lotId }) => void (await broadcastLot(lotId))),
  );
  events.onEvent(
    'lot.cancelled',
    safe(async ({ lotId, affectedUserIds }) => {
      const lot = await broadcastLot(lotId);
      for (const userId of affectedUserIds) {
        notify(userId, {
          type: 'cancelled',
          lotId,
          message: `O lote "${lot.title}" foi cancelado. Seu saldo comprometido foi estornado.`,
        });
      }
    }),
  );
  events.onEvent(
    'lot.settled',
    safe(async ({ lotId, winnerId, sellerId }) => {
      const lot = await broadcastLot(lotId);
      if (winnerId) {
        notify(winnerId, {
          type: 'won',
          lotId,
          message: `Parabéns! Você arrematou "${lot.title}" por ${formatBRL(lot.currentPriceCents!)}.`,
        });
        notify(sellerId, {
          type: 'sold',
          lotId,
          message: `"${lot.title}" foi arrematado por ${formatBRL(lot.currentPriceCents!)}.`,
        });
      } else {
        notify(sellerId, { type: 'unsold', lotId, message: `"${lot.title}" encerrou sem lances.` });
      }
    }),
  );
  events.onEvent('wallet.changed', ({ userIds }) => {
    for (const id of userIds) io.to(`user:${id}`).emit('wallet:changed');
  });

  return io;
}
