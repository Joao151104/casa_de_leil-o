import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { canonicalReceipt, publicKeyHex, verifySignature } from '../../lib/ledger.js';
import { toLotDto } from '../lots/lot.mapper.js';
import { findLot } from '../lots/lot.service.js';

export const receiptsRouter = Router();

/** Comprovante público, compartilhável por link. Identifica o vencedor só pelo pseudônimo. */
receiptsRouter.get('/:code', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT code, lot_id, winner_tag, amount_cents, bid_count, final_hash, issued_at, signature FROM receipts WHERE code = $1',
    [String(req.params.code).toUpperCase()],
  );
  const r = rows[0];
  if (!r) throw notFound('Comprovante');
  const lot = await findLot(pool, r.lot_id);
  const fields = {
    code: r.code,
    lotId: r.lot_id,
    winnerTag: r.winner_tag,
    amountCents: r.amount_cents,
    bidCount: r.bid_count,
    finalHash: r.final_hash,
    issuedAt: r.issued_at as Date,
  };
  res.json({
    receipt: {
      ...fields,
      signature: r.signature,
      signatureValid: verifySignature(canonicalReceipt(fields), r.signature),
    },
    lot: toLotDto(lot!),
    publicKey: publicKeyHex,
  });
});
