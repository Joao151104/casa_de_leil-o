import { pool, tx, type Db } from '../../db/pool.js';
import { AppError, forbidden, notFound } from '../../lib/errors.js';
import { events } from '../../lib/events.js';
import { storeRemoteImage } from '../../lib/images.js';
import { getCatalogItem } from '../catalog/catalog.service.js';
import { LOT_SELECT, toLotDto, type LotRow, type Phase } from './lot.mapper.js';

export async function findLot(db: Db, lotId: string): Promise<LotRow | null> {
  const { rows } = await db.query<LotRow>(`${LOT_SELECT} WHERE l.id = $1`, [lotId]);
  return rows[0] ?? null;
}

export async function getLotDto(lotId: string) {
  const lot = await findLot(pool, lotId);
  if (!lot) throw notFound('Lote');
  return toLotDto(lot);
}

export interface CreateLotInput {
  externalId: string;
  title?: string;
  description?: string;
  startingPriceCents: number;
  minIncrementCents: number;
  startsAt: Date;
  endsAt: Date;
}

const MAX_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

export async function createLot(sellerId: string, input: CreateLotInput) {
  const now = Date.now();
  // Tolerância de 2 min para "começar agora" (relógio do navegador + tempo de preenchimento).
  if (input.startsAt.getTime() < now - 2 * 60 * 1000) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A data de início não pode estar no passado.');
  }
  const startsAt = new Date(Math.max(input.startsAt.getTime(), now));
  if (input.endsAt.getTime() - startsAt.getTime() < 60 * 1000) {
    throw new AppError(400, 'VALIDATION_ERROR', 'O lote precisa durar pelo menos 1 minuto.');
  }
  if (input.endsAt.getTime() - now > MAX_DURATION_MS) {
    throw new AppError(400, 'VALIDATION_ERROR', 'O encerramento deve ser em no máximo 90 dias.');
  }

  // Snapshot do item: título, atributos e imagem ficam no lote, independentes da API externa.
  const item = await getCatalogItem(input.externalId);
  const imageId = await storeRemoteImage(pool, item.imageUrl);
  const attributes = {
    artist: item.artist,
    artistBio: item.artistBio,
    date: item.date,
    medium: item.medium,
    dimensions: item.dimensions,
    department: item.department,
    culture: item.culture,
    classification: item.classification,
    creditLine: item.creditLine,
    objectUrl: item.objectUrl,
  };

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO lots (seller_id, source, external_id, title, description, attributes, image_id, image_url,
                       starting_price_cents, min_increment_cents, starts_at, ends_at, original_ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12) RETURNING id`,
    [
      sellerId,
      item.source,
      item.externalId,
      input.title?.trim() || item.title,
      input.description?.trim() || null,
      attributes,
      imageId,
      item.imageUrl,
      input.startingPriceCents,
      input.minIncrementCents,
      startsAt,
      input.endsAt,
    ],
  );
  events.emitEvent('lot.created', { lotId: rows[0].id });
  return getLotDto(rows[0].id);
}

/**
 * Cancela um lote. Sem lances: cancelamento direto. Com lances (opcional do desafio): exige
 * confirmação explícita e faz o estorno automático. Como o saldo do líder estava apenas
 * comprometido (nunca debitado), mudar o status para 'cancelled' já o devolve ao disponível.
 */
export async function cancelLot(sellerId: string, lotId: string, opts: { reason?: string; confirmRefund?: boolean }) {
  const affectedUserIds = await tx(async (client) => {
    const { rows } = await client.query<LotRow & { ended: boolean }>(
      'SELECT *, now() >= ends_at AS ended FROM lots WHERE id = $1 FOR UPDATE',
      [lotId],
    );
    const lot = rows[0];
    if (!lot) throw notFound('Lote');
    if (lot.seller_id !== sellerId) throw forbidden('Você só pode cancelar os seus próprios lotes.');
    if (lot.status === 'cancelled') throw new AppError(409, 'LOT_CANCELLED', 'Este lote já está cancelado.');
    if (lot.status === 'settled' || lot.ended) {
      throw new AppError(409, 'LOT_ENDED', 'Lotes encerrados não podem ser cancelados.');
    }
    if (lot.bid_count > 0 && !opts.confirmRefund) {
      throw new AppError(
        409,
        'LOT_HAS_BIDS',
        `Este lote já recebeu ${lot.bid_count} lance(s). Confirme o cancelamento com estorno automático para continuar.`,
        { bidCount: lot.bid_count },
      );
    }
    await client.query(
      `UPDATE lots SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2 WHERE id = $1`,
      [lotId, opts.reason?.trim() || null],
    );
    const bidders = await client.query<{ bidder_id: string }>(
      'SELECT DISTINCT bidder_id FROM bids WHERE lot_id = $1',
      [lotId],
    );
    return bidders.rows.map((r) => r.bidder_id);
  });
  events.emitEvent('lot.cancelled', { lotId, affectedUserIds });
  if (affectedUserIds.length) events.emitEvent('wallet.changed', { userIds: affectedUserIds });
  return getLotDto(lotId);
}

export interface ShowcaseQuery {
  phase: Exclude<Phase, 'cancelled'>;
  q?: string;
  sort?: 'ending' | 'newest' | 'price_asc' | 'price_desc';
}

const SORTS: Record<NonNullable<ShowcaseQuery['sort']>, string> = {
  ending: 'l.ends_at ASC',
  newest: 'l.created_at DESC',
  price_asc: 'COALESCE(l.current_price_cents, l.starting_price_cents) ASC',
  price_desc: 'COALESCE(l.current_price_cents, l.starting_price_cents) DESC',
};

/** Vitrine pública. Lotes cancelados nunca aparecem. */
export async function listShowcase({ phase, q, sort }: ShowcaseQuery) {
  const params: unknown[] = [phase];
  let search = '';
  if (q?.trim()) {
    params.push(`%${q.trim()}%`);
    search = `AND (title ILIKE $2 OR attributes->>'artist' ILIKE $2 OR attributes->>'medium' ILIKE $2 OR attributes->>'culture' ILIKE $2)`;
  }
  const order =
    sort ? SORTS[sort] : phase === 'ended' ? 'l.ends_at DESC' : phase === 'scheduled' ? 'l.starts_at ASC' : SORTS.ending;
  const { rows } = await pool.query<LotRow>(
    `SELECT * FROM (${LOT_SELECT}) l WHERE phase = $1 ${search} ORDER BY ${order} LIMIT 100`,
    params,
  );
  const counts = await pool.query<{ phase: Phase; count: string }>(
    `SELECT phase, count(*) FROM (${LOT_SELECT}) l WHERE phase <> 'cancelled' GROUP BY phase`,
  );
  return {
    lots: rows.map(toLotDto),
    counts: Object.fromEntries(counts.rows.map((r) => [r.phase, Number(r.count)])) as Partial<Record<Phase, number>>,
  };
}

/** Painel do leiloeiro: todos os seus lotes (inclusive cancelados) + resultado de cada um e totais. */
export async function sellerDashboard(sellerId: string) {
  const { rows } = await pool.query<LotRow & { receipt_code: string | null }>(
    `SELECT l.*, r.code AS receipt_code FROM (${LOT_SELECT}) l
       LEFT JOIN receipts r ON r.lot_id = l.id
      WHERE l.seller_id = $1 ORDER BY l.created_at DESC`,
    [sellerId],
  );
  const totals = await pool.query(
    `SELECT COALESCE(sum(amount_cents) FILTER (WHERE kind = 'sale'), 0) AS received,
            (SELECT balance_cents FROM wallets WHERE user_id = $1) AS balance
       FROM wallet_transactions WHERE user_id = $1`,
    [sellerId],
  );
  const lots = rows.map((r) => ({ ...toLotDto(r), receiptCode: r.receipt_code }));
  const count = (phase: Phase) => lots.filter((l) => l.phase === phase).length;
  return {
    lots,
    summary: {
      totalReceivedCents: Number(totals.rows[0].received),
      balanceCents: Number(totals.rows[0].balance ?? 0),
      sold: lots.filter((l) => l.sold).length,
      unsold: lots.filter((l) => l.settled && !l.sold).length,
      live: count('live'),
      scheduled: count('scheduled'),
      cancelled: count('cancelled'),
    },
  };
}

/** "Meus arremates": lotes em que o licitante deu lance, com a situação de cada um. */
export async function bidderActivity(userId: string) {
  const { rows } = await pool.query<LotRow & { my_max: number; my_bids: number; last_bid_at: Date; receipt_code: string | null }>(
    `SELECT l.*, my.my_max, my.my_bids, my.last_bid_at, r.code AS receipt_code
       FROM (SELECT lot_id, max(amount_cents) AS my_max, count(*)::int AS my_bids, max(created_at) AS last_bid_at
               FROM bids WHERE bidder_id = $1 GROUP BY lot_id) my
       JOIN (${LOT_SELECT}) l ON l.id = my.lot_id
       LEFT JOIN receipts r ON r.lot_id = l.id AND r.winner_id = $1
      ORDER BY my.last_bid_at DESC`,
    [userId],
  );
  return rows.map((r) => {
    const leading = r.leader_id === userId;
    const outcome =
      r.phase === 'cancelled' ? 'cancelled'
      : r.status === 'settled' ? (leading ? 'won' : 'lost')
      : r.phase === 'ended' ? (leading ? 'won_pending' : 'lost')
      : leading ? 'winning' : 'outbid';
    return {
      lot: toLotDto(r),
      myMaxBidCents: r.my_max,
      myBidCount: r.my_bids,
      lastBidAt: r.last_bid_at,
      outcome,
      receiptCode: r.receipt_code,
    };
  });
}
