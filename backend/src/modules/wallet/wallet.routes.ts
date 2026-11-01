import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { parse } from '../../lib/validation.js';
import { requireRole } from '../auth/auth.js';
import { deposit, getWallet } from './wallet.service.js';

const depositSchema = z.object({
  amountCents: z
    .number({ error: 'Informe o valor do depósito.' })
    .int('Valor inválido.')
    .min(100, 'O depósito mínimo é R$ 1,00.')
    .max(100_000_000, 'O depósito máximo por operação é R$ 1.000.000,00.'),
});

export const walletRouter = Router();
walletRouter.use(requireRole('bidder'));

walletRouter.get('/', async (req, res) => {
  res.json(await getWallet(pool, req.user!.id));
});

walletRouter.post('/deposit', async (req, res) => {
  const { amountCents } = parse(depositSchema, req.body);
  await deposit(req.user!.id, amountCents);
  res.status(201).json(await getWallet(pool, req.user!.id));
});
