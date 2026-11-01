import { Router } from 'express';
import { z } from 'zod';
import { bidderTag } from '../../lib/pseudonym.js';
import { parse } from '../../lib/validation.js';
import { requireAuth, requireRole } from '../auth/auth.js';
import { listPublicBids, placeBid } from '../bids/bid.service.js';
import { cancelLot, createLot, getLotDto, listShowcase } from './lot.service.js';

const uuid = z.uuid('Lote inválido.');

const showcaseSchema = z.object({
  phase: z.enum(['live', 'scheduled', 'ended']).default('live'),
  q: z.string().max(100).optional(),
  sort: z.enum(['ending', 'newest', 'price_asc', 'price_desc']).optional(),
});

const cents = (label: string) =>
  z.number({ error: `Informe o ${label}.` }).int(`${label} inválido.`).min(100, `O ${label} deve ser de pelo menos R$ 1,00.`).max(100_000_000_00);

const createSchema = z.object({
  externalId: z.string().min(1, 'Selecione um item do catálogo.'),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  startingPriceCents: cents('lance inicial'),
  minIncrementCents: cents('incremento mínimo'),
  startsAt: z.coerce.date({ error: 'Data de início inválida.' }),
  endsAt: z.coerce.date({ error: 'Data de encerramento inválida.' }),
});

const cancelSchema = z.object({
  reason: z.string().max(300).optional(),
  confirmRefund: z.boolean().optional(),
});

const bidSchema = z.object({
  amountCents: z.number({ error: 'Informe o valor do lance.' }).int('Valor inválido.').positive('Valor inválido.'),
});

export const lotsRouter = Router();

lotsRouter.get('/', async (req, res) => {
  res.json(await listShowcase(parse(showcaseSchema, req.query)));
});

lotsRouter.post('/', requireRole('auctioneer'), async (req, res) => {
  res.status(201).json({ lot: await createLot(req.user!.id, parse(createSchema, req.body)) });
});

lotsRouter.get('/:id', async (req, res) => {
  const id = parse(uuid, req.params.id);
  const lot = await getLotDto(id);
  res.json({
    lot,
    bids: await listPublicBids(id),
    // Pseudônimo do próprio usuário neste lote: o front compara com o líder para "você está ganhando".
    myTag: req.user?.role === 'bidder' ? bidderTag(req.user.id, id) : null,
    serverTime: new Date(),
  });
});

lotsRouter.post('/:id/bids', requireAuth, async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { amountCents } = parse(bidSchema, req.body);
  const { bid, extended } = await placeBid(req.user!, id, amountCents);
  res.status(201).json({ bid, extended, lot: await getLotDto(id) });
});

lotsRouter.post('/:id/cancel', requireRole('auctioneer'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  res.json({ lot: await cancelLot(req.user!.id, id, parse(cancelSchema, req.body ?? {})) });
});
