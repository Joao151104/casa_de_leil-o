import bcrypt from 'bcryptjs';
import { migrate } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';
import { resetDatabase } from '../src/db/seed.js';
import type { AuthUser } from '../src/modules/auth/auth.js';

export async function setupDb() {
  await migrate(() => {});
  await resetDatabase();
}

const passwordHash = bcrypt.hashSync('demo1234', 4);

export async function createUser(role: 'auctioneer' | 'bidder', balanceCents = 0): Promise<AuthUser> {
  const name = `${role}-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await pool.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, role',
    [name, `${name}@test.com`, passwordHash, role],
  );
  await pool.query('INSERT INTO wallets (user_id, balance_cents) VALUES ($1, $2)', [rows[0].id, balanceCents]);
  return rows[0];
}

export async function createLot(
  sellerId: string,
  opts: { startsInMs?: number; endsInMs?: number; startingCents?: number; incrementCents?: number } = {},
) {
  const now = Date.now();
  const startsAt = new Date(now + (opts.startsInMs ?? -60_000));
  const endsAt = new Date(now + (opts.endsInMs ?? 3_600_000));
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO lots (seller_id, source, external_id, title, starting_price_cents, min_increment_cents, starts_at, ends_at, original_ends_at)
     VALUES ($1, 'met', '1', 'Lote de teste', $2, $3, $4, $5, $5) RETURNING id`,
    [sellerId, opts.startingCents ?? 10_000, opts.incrementCents ?? 1_000, startsAt, endsAt],
  );
  return rows[0].id;
}
