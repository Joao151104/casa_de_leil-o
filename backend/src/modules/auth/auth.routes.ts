import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { pool, tx } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { parse } from '../../lib/validation.js';
import { requireAuth, signToken, type AuthUser } from './auth.js';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome.').max(80),
  email: z.email('E-mail inválido.').transform((e) => e.toLowerCase()),
  password: z.string().min(6, 'A senha precisa ter ao menos 6 caracteres.').max(100),
  role: z.enum(['auctioneer', 'bidder']),
});

const loginSchema = z.object({
  email: z.string().transform((e) => e.trim().toLowerCase()),
  password: z.string(),
});

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const input = parse(registerSchema, req.body);
  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await tx(async (client) => {
    const exists = await client.query('SELECT 1 FROM users WHERE email = $1', [input.email]);
    if (exists.rowCount) throw new AppError(409, 'EMAIL_TAKEN', 'Já existe uma conta com este e-mail.');
    const { rows } = await client.query<AuthUser>(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, role`,
      [input.name, input.email, passwordHash, input.role],
    );
    await client.query('INSERT INTO wallets (user_id) VALUES ($1)', [rows[0].id]);
    return rows[0];
  });
  res.status(201).json({ token: signToken(user), user });
});

authRouter.post('/login', async (req, res) => {
  const input = parse(loginSchema, req.body);
  const { rows } = await pool.query(
    'SELECT id, name, role, password_hash FROM users WHERE email = $1',
    [input.email],
  );
  const row = rows[0];
  if (!row || !(await bcrypt.compare(input.password, row.password_hash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
  }
  const user: AuthUser = { id: row.id, name: row.name, role: row.role };
  res.json({ token: signToken(user), user });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user!.id]);
  if (!rows[0]) throw new AppError(401, 'UNAUTHENTICATED', 'Sessão inválida.');
  res.json({ user: rows[0] });
});
