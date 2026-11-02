import { Router } from 'express';
import { requireRole } from '../auth/auth.js';
import { bidderActivity, sellerDashboard } from './lot.queries.js';

export const meRouter = Router();

meRouter.get('/lots', requireRole('auctioneer'), async (req, res) => {
  res.json(await sellerDashboard(req.user!.id));
});

meRouter.get('/bids', requireRole('bidder'), async (req, res) => {
  res.json({ items: await bidderActivity(req.user!.id) });
});
