import type { Db } from '../../db/pool.js';
import { tx } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { events } from '../../lib/events.js';
import { PHASE_SQL } from '../lots/lot.mapper.js';

/**
 * Saldo disponível = total − comprometido.
 * Comprometido = soma do lance atual de todo lote ativo (não liquidado/cancelado) em que o
 * usuário é o líder. Como é derivado, ser superado ou ter um lote cancelado libera o valor
 * imediatamente, na mesma transação que muda o líder.
 */
export async function getFunds(db: Db, userId: string) {
  const { rows } = await db.query(
    `SELECT w.balance_cents,
            COALESCE((SELECT sum(current_price_cents) FROM lots WHERE leader_id = w.user_id AND status = 'active'), 0) AS committed_cents
       FROM wallets w WHERE w.user_id = $1`,
    [userId],
  );
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Carteira não encontrada.');
  const balanceCents = rows[0].balance_cents as number;
  const committedCents = Number(rows[0].committed_cents);
  return { balanceCents, committedCents, availableCents: balanceCents - committedCents };
}

export async function getWallet(db: Db, userId: string) {
  const funds = await getFunds(db, userId);
  const commitments = await db.query(
    `SELECT l.id AS lot_id, l.title, l.current_price_cents, ${PHASE_SQL} AS phase
       FROM lots l WHERE l.leader_id = $1 AND l.status = 'active' ORDER BY l.ends_at`,
    [userId],
  );
  const transactions = await db.query(
    `SELECT t.id, t.kind, t.amount_cents, t.lot_id, t.created_at, l.title AS lot_title
       FROM wallet_transactions t LEFT JOIN lots l ON l.id = t.lot_id
      WHERE t.user_id = $1 ORDER BY t.created_at DESC, t.id DESC LIMIT 50`,
    [userId],
  );
  return {
    ...funds,
    commitments: commitments.rows.map((r) => ({
      lotId: r.lot_id,
      title: r.title,
      amountCents: r.current_price_cents,
      phase: r.phase,
    })),
    transactions: transactions.rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      amountCents: r.amount_cents,
      lotId: r.lot_id,
      lotTitle: r.lot_title,
      createdAt: r.created_at,
    })),
  };
}

export async function deposit(userId: string, amountCents: number) {
  await tx(async (client) => {
    await client.query('UPDATE wallets SET balance_cents = balance_cents + $2, updated_at = now() WHERE user_id = $1', [
      userId,
      amountCents,
    ]);
    await client.query(`INSERT INTO wallet_transactions (user_id, kind, amount_cents) VALUES ($1, 'deposit', $2)`, [
      userId,
      amountCents,
    ]);
  });
  events.emitEvent('wallet.changed', { userIds: [userId] });
}
