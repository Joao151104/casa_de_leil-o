import { config } from '../../config.js';
import { pool, tx } from '../../db/pool.js';
import { AppError, notFound } from '../../lib/errors.js';
import { events } from '../../lib/events.js';
import { canonicalHead, sealBid, sign } from '../../lib/ledger.js';
import { bidderTag } from '../../lib/pseudonym.js';
import type { AuthUser } from '../auth/auth.js';
import type { LotRow } from '../lots/lot.mapper.js';
import { getFunds } from '../wallet/wallet.service.js';
import { evaluateBid, extendedEnd, insufficientFunds } from './bid.rules.js';

export interface PublicBid {
  seq: number;
  bidderTag: string;
  amountCents: number;
  createdAt: Date;
}

/**
 * Registra um lance. Concorrência: a linha do lote é travada (FOR UPDATE) e só então a
 * carteira do licitante; todos os fluxos seguem a ordem lote → carteira, evitando deadlocks.
 * Lances simultâneos no mesmo lote são serializados e cada um é validado contra o estado
 * mais recente; o segundo de dois lances iguais é recusado por "abaixo do mínimo".
 */
export async function placeBid(user: AuthUser, lotId: string, amountCents: number) {
  if (user.role !== 'bidder') throw new AppError(403, 'ROLE_NOT_ALLOWED', 'Leiloeiros não podem dar lances.');

  const result = await tx(async (client) => {
    const { rows } = await client.query<LotRow>('SELECT * FROM lots WHERE id = $1 FOR UPDATE', [lotId]);
    const lot = rows[0];
    if (!lot) throw notFound('Lote');
    // clock_timestamp() (e não now()) para que o horário reflita o momento em que obtivemos o lock.
    const { rows: clock } = await client.query<{ now: Date }>(
      `SELECT date_trunc('milliseconds', clock_timestamp()) AS now`,
    );
    const now = clock[0].now;

    const rejection = evaluateBid(
      {
        status: lot.status,
        startsAt: lot.starts_at,
        endsAt: lot.ends_at,
        startingPriceCents: lot.starting_price_cents,
        minIncrementCents: lot.min_increment_cents,
        currentPriceCents: lot.current_price_cents,
        bidCount: lot.bid_count,
        leaderId: lot.leader_id,
      },
      user.id,
      amountCents,
      now,
    );
    if (rejection) throw rejection;

    await client.query('SELECT 1 FROM wallets WHERE user_id = $1 FOR UPDATE', [user.id]);
    const funds = await getFunds(client, user.id);
    const noFunds = insufficientFunds(funds.availableCents, amountCents);
    if (noFunds) throw noFunds;

    const seq = lot.bid_count + 1;
    const tag = bidderTag(user.id, lotId);
    const { hash, signature } = sealBid({
      lotId,
      seq,
      bidderTag: tag,
      amountCents,
      createdAt: now,
      prevHash: lot.head_hash,
    });
    await client.query(
      `INSERT INTO bids (lot_id, seq, bidder_id, bidder_tag, amount_cents, created_at, prev_hash, hash, signature)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [lotId, seq, user.id, tag, amountCents, now, lot.head_hash, hash, signature],
    );

    const newEnd = extendedEnd(lot.ends_at, now, config.antiSnipingMs);
    await client.query(
      `UPDATE lots SET current_price_cents = $2, leader_id = $3, bid_count = $4, head_hash = $5,
              head_signature = $6, ends_at = COALESCE($7, ends_at)
        WHERE id = $1`,
      [lotId, amountCents, user.id, seq, hash, sign(canonicalHead(lotId, seq, hash)), newEnd],
    );

    return {
      bid: { seq, bidderTag: tag, amountCents, createdAt: now } satisfies PublicBid,
      previousLeaderId: lot.leader_id,
      extended: newEnd !== null,
      endsAt: newEnd ?? lot.ends_at,
    };
  });

  events.emitEvent('bid.placed', {
    lotId,
    bidderId: user.id,
    previousLeaderId: result.previousLeaderId,
    extended: result.extended,
  });
  events.emitEvent('wallet.changed', {
    userIds: [user.id, result.previousLeaderId].filter((id): id is string => Boolean(id)),
  });
  return result;
}

export async function listPublicBids(lotId: string): Promise<PublicBid[]> {
  const { rows } = await pool.query(
    'SELECT seq, bidder_tag, amount_cents, created_at FROM bids WHERE lot_id = $1 ORDER BY seq DESC',
    [lotId],
  );
  return rows.map((r) => ({
    seq: r.seq,
    bidderTag: r.bidder_tag,
    amountCents: r.amount_cents,
    createdAt: r.created_at,
  }));
}
