import { bidderTag } from '../../lib/pseudonym.js';

export type Phase = 'scheduled' | 'live' | 'ended' | 'cancelled';

/** A fase é derivada do relógio do banco: não há job que precise "virar" o status de agendado para ao vivo. */
export const PHASE_SQL = `CASE
  WHEN l.status = 'cancelled' THEN 'cancelled'
  WHEN l.status = 'settled' OR now() >= l.ends_at THEN 'ended'
  WHEN now() < l.starts_at THEN 'scheduled'
  ELSE 'live' END`;

export const LOT_SELECT = `SELECT l.*, u.name AS seller_name, ${PHASE_SQL} AS phase
  FROM lots l JOIN users u ON u.id = l.seller_id`;

export interface LotRow {
  id: string;
  number: number;
  seller_id: string;
  seller_name: string;
  source: string;
  external_id: string;
  title: string;
  description: string | null;
  attributes: Record<string, string | null>;
  image_id: string | null;
  image_url: string | null;
  starting_price_cents: number;
  min_increment_cents: number;
  starts_at: Date;
  ends_at: Date;
  original_ends_at: Date;
  status: 'active' | 'cancelled' | 'settled';
  cancelled_at: Date | null;
  cancel_reason: string | null;
  settled_at: Date | null;
  current_price_cents: number | null;
  leader_id: string | null;
  bid_count: number;
  head_hash: string;
  head_signature: string | null;
  created_at: Date;
  phase: Phase;
}

export const minimumBidCents = (
  lot: Pick<LotRow, 'bid_count' | 'starting_price_cents' | 'current_price_cents' | 'min_increment_cents'>,
) => (lot.bid_count === 0 ? lot.starting_price_cents : lot.current_price_cents! + lot.min_increment_cents);

export const lotImageUrl = (lot: Pick<LotRow, 'image_id' | 'image_url'>) =>
  lot.image_id ? `/api/images/${lot.image_id}` : lot.image_url;

/** DTO público do lote. Nunca expõe IDs de usuários: o líder aparece só pelo pseudônimo. */
export function toLotDto(lot: LotRow) {
  return {
    id: lot.id,
    number: lot.number,
    title: lot.title,
    description: lot.description,
    attributes: lot.attributes,
    imageUrl: lotImageUrl(lot),
    source: lot.source,
    externalId: lot.external_id,
    seller: { name: lot.seller_name },
    startingPriceCents: lot.starting_price_cents,
    minIncrementCents: lot.min_increment_cents,
    currentPriceCents: lot.current_price_cents,
    minimumBidCents: minimumBidCents(lot),
    bidCount: lot.bid_count,
    leaderTag: lot.leader_id ? bidderTag(lot.leader_id, lot.id) : null,
    startsAt: lot.starts_at,
    endsAt: lot.ends_at,
    originalEndsAt: lot.original_ends_at,
    extended: lot.ends_at.getTime() > lot.original_ends_at.getTime(),
    phase: lot.phase,
    settled: lot.status === 'settled',
    sold: lot.status === 'settled' && lot.bid_count > 0,
    cancelledAt: lot.cancelled_at,
    cancelReason: lot.cancel_reason,
    settledAt: lot.settled_at,
    createdAt: lot.created_at,
  };
}

export type LotDto = ReturnType<typeof toLotDto>;
