import crypto from 'node:crypto';
import { pool, tx } from '../../db/pool.js';
import { events } from '../../lib/events.js';
import { canonicalReceipt, sign } from '../../lib/ledger.js';
import { createLogger } from '../../lib/logger.js';
import { bidderTag } from '../../lib/pseudonym.js';
import type { LotRow } from './lot.mapper.js';

const log = createLogger('settlement');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const receiptCode = () => Array.from(crypto.randomBytes(10), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

/**
 * Liquida um lote vencido: debita o vencedor, credita o leiloeiro e emite o comprovante
 * assinado, tudo na mesma transação. `SKIP LOCKED` permite várias instâncias rodando o job
 * sem liquidar o mesmo lote duas vezes (e sem esperar um lance em andamento).
 */
export async function settleLot(lotId: string) {
  const outcome = await tx(async (client) => {
    const { rows } = await client.query<LotRow>(
      `SELECT * FROM lots WHERE id = $1 AND status = 'active' AND ends_at <= clock_timestamp() FOR UPDATE SKIP LOCKED`,
      [lotId],
    );
    const lot = rows[0];
    if (!lot) return null;

    if (lot.bid_count === 0 || !lot.leader_id) {
      await client.query(`UPDATE lots SET status = 'settled', settled_at = now() WHERE id = $1`, [lotId]);
      return { sellerId: lot.seller_id, winnerId: null };
    }

    const price = lot.current_price_cents!;
    const winnerId = lot.leader_id;
    await client.query('SELECT 1 FROM wallets WHERE user_id = ANY($1) ORDER BY user_id FOR UPDATE', [
      [winnerId, lot.seller_id],
    ]);
    // O CHECK (balance_cents >= 0) é a última barreira: a regra de saldo comprometido garante que isso não falhe.
    await client.query('UPDATE wallets SET balance_cents = balance_cents - $2, updated_at = now() WHERE user_id = $1', [
      winnerId,
      price,
    ]);
    await client.query('UPDATE wallets SET balance_cents = balance_cents + $2, updated_at = now() WHERE user_id = $1', [
      lot.seller_id,
      price,
    ]);
    await client.query(
      `INSERT INTO wallet_transactions (user_id, kind, amount_cents, lot_id) VALUES ($1, 'purchase', $2, $4), ($3, 'sale', $5, $4)`,
      [winnerId, -price, lot.seller_id, lotId, price],
    );

    const { rows: clock } = await client.query<{ now: Date }>(
      `SELECT date_trunc('milliseconds', clock_timestamp()) AS now`,
    );
    const receipt = {
      code: receiptCode(),
      lotId,
      winnerTag: bidderTag(winnerId, lotId),
      amountCents: price,
      bidCount: lot.bid_count,
      finalHash: lot.head_hash,
      issuedAt: clock[0].now,
    };
    await client.query(
      `INSERT INTO receipts (code, lot_id, winner_id, winner_tag, amount_cents, bid_count, final_hash, issued_at, signature)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        receipt.code,
        lotId,
        winnerId,
        receipt.winnerTag,
        price,
        receipt.bidCount,
        receipt.finalHash,
        receipt.issuedAt,
        sign(canonicalReceipt(receipt)),
      ],
    );
    await client.query(`UPDATE lots SET status = 'settled', settled_at = now() WHERE id = $1`, [lotId]);
    return { sellerId: lot.seller_id, winnerId };
  });

  if (outcome) {
    events.emitEvent('lot.settled', { lotId, ...outcome });
    if (outcome.winnerId) events.emitEvent('wallet.changed', { userIds: [outcome.winnerId] });
  }
  return outcome;
}

export async function settleDueLots(): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM lots WHERE status = 'active' AND ends_at <= now() ORDER BY ends_at LIMIT 25`,
  );
  let settled = 0;
  for (const { id } of rows) {
    try {
      if (await settleLot(id)) settled++;
    } catch (err) {
      log.error(`falha ao liquidar lote ${id}`, err);
    }
  }
  return settled;
}

export function startSettlementJob(intervalMs: number) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await settleDueLots();
    } catch (err) {
      log.error('falha no job de liquidação', err);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
