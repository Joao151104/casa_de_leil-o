import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/validation.js';
import { requireRole } from '../auth/auth.js';
import { getCatalogItem, searchCatalog } from './catalog.service.js';

const searchSchema = z.object({
  q: z.string().max(100).default(''),
  page: z.coerce.number().int().min(1).max(50).default(1),
});

export const catalogRouter = Router();

catalogRouter.use(requireRole('auctioneer'));

catalogRouter.get('/search', async (req, res) => {
  const { q, page } = parse(searchSchema, req.query);
  res.json(await searchCatalog(q, page));
});

catalogRouter.get('/items/:id', async (req, res) => {
  res.json({ item: await getCatalogItem(String(req.params.id)) });
});
