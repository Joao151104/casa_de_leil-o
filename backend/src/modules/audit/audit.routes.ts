import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { publicKeyHex } from '../../lib/ledger.js';
import { bidderTag } from '../../lib/pseudonym.js';
import { toLotDto } from '../lots/lot.mapper.js';
import { findLot } from '../lots/lot.service.js';
import { verifyLedger } from './verify.js';

export const auditRouter = Router();

auditRouter.get('/public-key', (_req, res) => {
  res.json({ algorithm: 'Ed25519', publicKey: publicKeyHex });
});

/** Auditoria pública (sem login): histórico completo + verificação de integridade. */
auditRouter.get('/lots/:id', async (req, res) => {
  const lot = await findLot(pool, String(req.params.id));
  if (!lot) throw notFound('Lote');
  const { rows: bidRows } = await pool.query(
    `SELECT seq, bidder_tag, amount_cents, created_at, prev_hash, hash, signature
       FROM bids WHERE lot_id = $1 ORDER BY seq`,
    [lot.id],
  );
  const { rows: receiptRows } = await pool.query(
    'SELECT code, winner_tag, amount_cents, bid_count, final_hash, issued_at, signature FROM receipts WHERE lot_id = $1',
    [lot.id],
  );
  const bids = bidRows.map((r) => ({
    seq: r.seq,
    bidderTag: r.bidder_tag,
    amountCents: r.amount_cents,
    createdAt: r.created_at,
    prevHash: r.prev_hash,
    hash: r.hash,
    signature: r.signature,
  }));
  const r = receiptRows[0];
  const receipt = r
    ? {
        code: r.code,
        winnerTag: r.winner_tag,
        amountCents: r.amount_cents,
        bidCount: r.bid_count,
        finalHash: r.final_hash,
        issuedAt: r.issued_at,
        signature: r.signature,
      }
    : null;
  const head = { bidCount: lot.bid_count, headHash: lot.head_hash, headSignature: lot.head_signature };
  const verification = verifyLedger({
    lot: {
      id: lot.id,
      startingPriceCents: lot.starting_price_cents,
      minIncrementCents: lot.min_increment_cents,
      startsAt: lot.starts_at,
      endsAt: lot.ends_at,
      currentPriceCents: lot.current_price_cents,
      leaderTag: lot.leader_id ? bidderTag(lot.leader_id, lot.id) : null,
      ...head,
    },
    bids,
    receipt,
  });
  res.json({
    lot: toLotDto(lot),
    head,
    bids,
    receipt,
    publicKey: publicKeyHex,
    verification: { ...verification, verifiedAt: new Date() },
  });
});
