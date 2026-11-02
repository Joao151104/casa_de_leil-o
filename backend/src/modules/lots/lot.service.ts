import { pool, tx, type Db } from '../../db/pool.js';
import { AppError, forbidden, notFound } from '../../lib/errors.js';
import { events } from '../../lib/events.js';
import { storeRemoteImage } from '../../lib/images.js';
import { getCatalogItem } from '../catalog/catalog.service.js';
import { LOT_SELECT, toLotDto, type LotRow } from './lot.mapper.js';

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
    await client.query(`UPDATE lots SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2 WHERE id = $1`, [
      lotId,
      opts.reason?.trim() || null,
    ]);
    const bidders = await client.query<{ bidder_id: string }>('SELECT DISTINCT bidder_id FROM bids WHERE lot_id = $1', [
      lotId,
    ]);
    return bidders.rows.map((r) => r.bidder_id);
  });
  events.emitEvent('lot.cancelled', { lotId, affectedUserIds });
  if (affectedUserIds.length) events.emitEvent('wallet.changed', { userIds: affectedUserIds });
  return getLotDto(lotId);
}
