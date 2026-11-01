import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { signToken } from '../src/modules/auth/auth.js';
import { placeBid } from '../src/modules/bids/bid.service.js';
import { cancelLot } from '../src/modules/lots/lot.service.js';
import { settleLot } from '../src/modules/lots/settlement.service.js';
import { getFunds } from '../src/modules/wallet/wallet.service.js';
import { createLot, createUser, setupDb } from './helpers.js';

const app = createApp();

beforeEach(setupDb);
afterAll(() => pool.end());

const bidError = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (err) => err.code as string,
  );

describe('lances e saldo comprometido', () => {
  it('compromete o valor do líder e libera imediatamente quando superado', async () => {
    const seller = await createUser('auctioneer');
    const ana = await createUser('bidder', 100_000);
    const bruno = await createUser('bidder', 100_000);
    const lotId = await createLot(seller.id);

    await placeBid(ana, lotId, 10_000);
    expect(await getFunds(pool, ana.id)).toEqual({ balanceCents: 100_000, committedCents: 10_000, availableCents: 90_000 });

    await placeBid(bruno, lotId, 11_000);
    expect((await getFunds(pool, ana.id)).committedCents).toBe(0);
    expect((await getFunds(pool, bruno.id)).committedCents).toBe(11_000);
  });

  it('saldo comprometido em outro lote reduz o disponível', async () => {
    const seller = await createUser('auctioneer');
    const ana = await createUser('bidder', 15_000);
    const lotA = await createLot(seller.id);
    const lotB = await createLot(seller.id);
    await placeBid(ana, lotA, 10_000);
    expect(await bidError(placeBid(ana, lotB, 10_000))).toBe('INSUFFICIENT_FUNDS');
  });

  it('recusa leiloeiro, lote não iniciado e lote encerrado', async () => {
    const seller = await createUser('auctioneer');
    const ana = await createUser('bidder', 100_000);
    expect(await bidError(placeBid(seller, await createLot(seller.id), 10_000))).toBe('ROLE_NOT_ALLOWED');
    expect(await bidError(placeBid(ana, await createLot(seller.id, { startsInMs: 60_000 }), 10_000))).toBe('LOT_NOT_STARTED');
    expect(await bidError(placeBid(ana, await createLot(seller.id, { startsInMs: -120_000, endsInMs: -1_000 }), 10_000))).toBe('LOT_ENDED');
  });

  it('lances simultâneos no mesmo lote: só um vence a disputa pelo mesmo valor', async () => {
    const seller = await createUser('auctioneer');
    const bidders = await Promise.all(Array.from({ length: 8 }, () => createUser('bidder', 100_000)));
    const lotId = await createLot(seller.id);
    const results = await Promise.allSettled(bidders.map((b) => placeBid(b, lotId, 10_000)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const { rows } = await pool.query('SELECT bid_count, current_price_cents FROM lots WHERE id = $1', [lotId]);
    expect(rows[0]).toEqual({ bid_count: 1, current_price_cents: 10_000 });
  });

  it('lances simultâneos do mesmo licitante em lotes diferentes não estouram o saldo', async () => {
    const seller = await createUser('auctioneer');
    const ana = await createUser('bidder', 25_000);
    const lots = await Promise.all(Array.from({ length: 5 }, () => createLot(seller.id)));
    const results = await Promise.allSettled(lots.map((id) => placeBid(ana, id, 10_000)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect((await getFunds(pool, ana.id)).availableCents).toBe(5_000);
  });

  it('anti-sniping: lance nos últimos 2 minutos estende o fim', async () => {
    const seller = await createUser('auctioneer');
    const ana = await createUser('bidder', 100_000);
    const lotId = await createLot(seller.id, { endsInMs: 30_000 });
    const before = Date.now();
    const result = await placeBid(ana, lotId, 10_000);
    expect(result.extended).toBe(true);
    expect(result.endsAt.getTime()).toBeGreaterThanOrEqual(before + 2 * 60 * 1000 - 50);
  });
});

describe('liquidação e cancelamento', () => {
  it('ao encerrar, debita o vencedor, credita o leiloeiro e gera comprovante', async () => {
    const seller = await createUser('auctioneer');
    const ana = await createUser('bidder', 100_000);
    const lotId = await createLot(seller.id, { endsInMs: 1_500 });
    await placeBid(ana, lotId, 10_000);
    // o lance estendeu o fim (anti-sniping); força o encerramento
    await pool.query(`UPDATE lots SET ends_at = now() - interval '1 second' WHERE id = $1`, [lotId]);

    expect(await settleLot(lotId)).toEqual({ sellerId: seller.id, winnerId: ana.id });
    expect(await getFunds(pool, ana.id)).toEqual({ balanceCents: 90_000, committedCents: 0, availableCents: 90_000 });
    expect((await getFunds(pool, seller.id)).balanceCents).toBe(10_000);

    const { rows } = await pool.query('SELECT code FROM receipts WHERE lot_id = $1', [lotId]);
    const res = await request(app).get(`/api/receipts/${rows[0].code}`).expect(200);
    expect(res.body.receipt.signatureValid).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(ana.id);

    expect(await settleLot(lotId)).toBeNull(); // idempotente
  });

  it('lote sem lances fecha sem vencedor', async () => {
    const seller = await createUser('auctioneer');
    const lotId = await createLot(seller.id, { startsInMs: -120_000, endsInMs: -1_000 });
    expect(await settleLot(lotId)).toEqual({ sellerId: seller.id, winnerId: null });
  });

  it('cancelamento com lances exige confirmação e estorna o comprometido', async () => {
    const seller = await createUser('auctioneer');
    const ana = await createUser('bidder', 100_000);
    const lotId = await createLot(seller.id);
    await placeBid(ana, lotId, 10_000);

    expect(await bidError(cancelLot(seller.id, lotId, {}))).toBe('LOT_HAS_BIDS');
    await cancelLot(seller.id, lotId, { confirmRefund: true });
    expect((await getFunds(pool, ana.id)).availableCents).toBe(100_000);

    const showcase = await request(app).get('/api/lots?phase=live').expect(200);
    expect(showcase.body.lots.find((l: { id: string }) => l.id === lotId)).toBeUndefined();
  });
});

describe('API', () => {
  it('retorna o motivo de lance recusado', async () => {
    const seller = await createUser('auctioneer');
    const ana = await createUser('bidder', 100_000);
    const lotId = await createLot(seller.id);
    const res = await request(app)
      .post(`/api/lots/${lotId}/bids`)
      .set('authorization', `Bearer ${signToken(ana)}`)
      .send({ amountCents: 5_000 })
      .expect(422);
    expect(res.body.error).toMatchObject({ code: 'BELOW_MINIMUM', minimumBidCents: 10_000 });
  });

  it('auditoria pública detecta adulteração feita direto no banco', async () => {
    const seller = await createUser('auctioneer');
    const [ana, bruno] = [await createUser('bidder', 100_000), await createUser('bidder', 100_000)];
    const lotId = await createLot(seller.id);
    await placeBid(ana, lotId, 10_000);
    await placeBid(bruno, lotId, 11_000);
    await placeBid(ana, lotId, 12_000);

    const ok = await request(app).get(`/api/audit/lots/${lotId}`).expect(200);
    expect(ok.body.verification.intact).toBe(true);
    expect(JSON.stringify(ok.body)).not.toMatch(new RegExp(`${ana.id}|${bruno.id}|${ana.name}`));

    await pool.query('UPDATE bids SET amount_cents = 11500 WHERE lot_id = $1 AND seq = 2', [lotId]);
    const tampered = await request(app).get(`/api/audit/lots/${lotId}`).expect(200);
    expect(tampered.body.verification.intact).toBe(false);
  });
});
