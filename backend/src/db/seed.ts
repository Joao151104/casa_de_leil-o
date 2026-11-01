import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { canonicalHead, sealBid, sign } from '../lib/ledger.js';
import { storeRemoteImage } from '../lib/images.js';
import { bidderTag } from '../lib/pseudonym.js';
import type { CatalogItem } from '../modules/catalog/met.client.js';
import { settleLot } from '../modules/lots/settlement.service.js';
import { migrate } from './migrate.js';
import { pool, tx } from './pool.js';
import seedItems from './seed-items.json' with { type: 'json' };

export const DEMO_PASSWORD = 'demo1234';
const items = seedItems as CatalogItem[];
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

async function createUser(client: PoolClient, name: string, email: string, role: string, depositCents = 0) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const { rows } = await client.query<{ id: string }>(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [name, email, hash, role],
  );
  const id = rows[0].id;
  await client.query('INSERT INTO wallets (user_id, balance_cents) VALUES ($1, $2)', [id, depositCents]);
  if (depositCents) {
    await client.query(`INSERT INTO wallet_transactions (user_id, kind, amount_cents) VALUES ($1, 'deposit', $2)`, [id, depositCents]);
  }
  return id;
}

interface SeedLot {
  item: CatalogItem;
  imageId: string | null;
  startingCents: number;
  incrementCents: number;
  startsAt: Date;
  endsAt: Date;
  description?: string;
}

async function createLot(client: PoolClient, sellerId: string, l: SeedLot) {
  const { item } = l;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO lots (seller_id, source, external_id, title, description, attributes, image_id, image_url,
                       starting_price_cents, min_increment_cents, starts_at, ends_at, original_ends_at, created_at)
     VALUES ($1, 'met', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $10) RETURNING id`,
    [
      sellerId,
      item.externalId,
      item.title,
      l.description ?? null,
      {
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
      },
      l.imageId,
      item.imageUrl,
      l.startingCents,
      l.incrementCents,
      l.startsAt,
      l.endsAt,
    ],
  );
  return rows[0].id;
}

/** Insere lances com horários controlados, usando exatamente o mesmo encadeamento/assinatura do serviço. */
async function addBids(client: PoolClient, lotId: string, bids: Array<[userId: string, amountCents: number, at: Date]>) {
  let prevHash = '0'.repeat(64);
  let seq = 0;
  for (const [userId, amountCents, at] of bids) {
    seq++;
    const tag = bidderTag(userId, lotId);
    const createdAt = new Date(Math.floor(at.getTime()));
    const { hash, signature } = sealBid({ lotId, seq, bidderTag: tag, amountCents, createdAt, prevHash });
    await client.query(
      `INSERT INTO bids (lot_id, seq, bidder_id, bidder_tag, amount_cents, created_at, prev_hash, hash, signature)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [lotId, seq, userId, tag, amountCents, createdAt, prevHash, hash, signature],
    );
    await client.query(
      `UPDATE lots SET current_price_cents = $2, leader_id = $3, bid_count = $4, head_hash = $5, head_signature = $6 WHERE id = $1`,
      [lotId, amountCents, userId, seq, hash, sign(canonicalHead(lotId, seq, hash))],
    );
    prevHash = hash;
  }
}

export async function seed(log = console.log) {
  const now = Date.now();
  const at = (offsetMs: number) => new Date(now + offsetMs);
  const byId = (id: string) => items.find((i) => i.externalId === id)!;

  // Imagens primeiro (fora da transação): se o servidor de imagens estiver fora, o lote usa a URL externa.
  const imageIds = new Map<string, string | null>();
  await Promise.all(items.map(async (item) => imageIds.set(item.externalId, await storeRemoteImage(pool, item.imageUrl))));
  log(`[seed] imagens copiadas: ${[...imageIds.values()].filter(Boolean).length}/${items.length}`);

  const settleIds = await tx(async (client) => {
    for (const item of items) {
      await client.query(
        `INSERT INTO catalog_items (source, external_id, data) VALUES ('met', $1, $2) ON CONFLICT DO NOTHING`,
        [item.externalId, item],
      );
    }
    const sellerId = await createUser(client, 'Galeria Aurora', 'leiloeiro@demo.com', 'auctioneer');
    const ana = await createUser(client, 'Ana Souza', 'ana@demo.com', 'bidder', 50_000_00);
    const bruno = await createUser(client, 'Bruno Lima', 'bruno@demo.com', 'bidder', 30_000_00);

    const lot = (id: string, l: Omit<SeedLot, 'item' | 'imageId'>) =>
      createLot(client, sellerId, { ...l, item: byId(id), imageId: imageIds.get(id) ?? null });

    // Ao vivo, com lances abertos (encerram em 30 dias para continuarem abertos durante a avaliação).
    const sunflowers = await lot('436524', {
      startingCents: 1_000_00, incrementCents: 100_00, startsAt: at(-2 * HOUR), endsAt: at(30 * DAY),
      description: 'Reprodução certificada da célebre série de girassóis pintada em Paris, 1887.',
    });
    await addBids(client, sunflowers, [
      [ana, 1_000_00, at(-100 * MIN)],
      [bruno, 1_200_00, at(-80 * MIN)],
      [ana, 1_500_00, at(-60 * MIN)],
    ]);
    const dancers = await lot('436166', { startingCents: 800_00, incrementCents: 50_00, startsAt: at(-1 * DAY), endsAt: at(7 * DAY) });
    await addBids(client, dancers, [
      [bruno, 800_00, at(-20 * HOUR)],
      [ana, 900_00, at(-10 * HOUR)],
      [bruno, 1_000_00, at(-2 * HOUR)],
    ]);
    await lot('45434', { startingCents: 500_00, incrementCents: 50_00, startsAt: at(-30 * MIN), endsAt: at(30 * DAY) });

    // Agendados.
    await lot('437878', { startingCents: 2_000_00, incrementCents: 200_00, startsAt: at(2 * DAY), endsAt: at(12 * DAY) });
    await lot('894743', { startingCents: 3_000_00, incrementCents: 250_00, startsAt: at(1 * DAY), endsAt: at(9 * DAY) });

    // Encerrados: um arrematado (gera comprovante) e um sem lances.
    const cat = await lot('544118', { startingCents: 300_00, incrementCents: 50_00, startsAt: at(-3 * DAY), endsAt: at(-1 * DAY) });
    await addBids(client, cat, [
      [bruno, 300_00, at(-60 * HOUR)],
      [ana, 400_00, at(-50 * HOUR)],
      [bruno, 500_00, at(-30 * HOUR)],
    ]);
    const vase = await lot('9408', { startingCents: 1_500_00, incrementCents: 100_00, startsAt: at(-4 * DAY), endsAt: at(-2 * DAY) });

    // Cancelado (não aparece na vitrine, só no painel do leiloeiro).
    const crawfish = await lot('52101', { startingCents: 200_00, incrementCents: 20_00, startsAt: at(-1 * HOUR), endsAt: at(5 * DAY) });
    await client.query(
      `UPDATE lots SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Peça retirada pelo consignante.' WHERE id = $1`,
      [crawfish],
    );
    return [cat, vase];
  });

  for (const id of settleIds) await settleLot(id);
  log(`[seed] dados de demonstração criados (senha de todos: ${DEMO_PASSWORD})`);
}

export async function seedIfEmpty(log = console.log) {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n === 0) await seed(log);
}

export async function resetDatabase() {
  await pool.query(
    'TRUNCATE receipts, bids, lots, images, wallet_transactions, wallets, users, catalog_items, catalog_searches CASCADE',
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  (async () => {
    await migrate();
    if (process.argv.includes('--reset')) {
      await resetDatabase();
      await seed();
    } else {
      await seedIfEmpty((m) => console.log(m));
      console.log('[seed] concluído (nada a fazer se o banco já tinha usuários; use --reset para recriar)');
    }
  })()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
