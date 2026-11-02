import { pool } from '../../db/pool.js';
import { LOT_SELECT, toLotDto, type LotRow, type Phase } from './lot.mapper.js';

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
  const order = sort
    ? SORTS[sort]
    : phase === 'ended'
      ? 'l.ends_at DESC'
      : phase === 'scheduled'
        ? 'l.starts_at ASC'
        : SORTS.ending;
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
  const { rows } = await pool.query<
    LotRow & { my_max: number; my_bids: number; last_bid_at: Date; receipt_code: string | null }
  >(
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
      r.phase === 'cancelled'
        ? 'cancelled'
        : r.status === 'settled'
          ? leading
            ? 'won'
            : 'lost'
          : r.phase === 'ended'
            ? leading
              ? 'won_pending'
              : 'lost'
            : leading
              ? 'winning'
              : 'outbid';
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
