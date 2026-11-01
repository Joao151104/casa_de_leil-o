export type Role = 'auctioneer' | 'bidder';
export type Phase = 'scheduled' | 'live' | 'ended' | 'cancelled';

export interface User {
  id: string;
  name: string;
  role: Role;
  email?: string;
}

export interface LotAttributes {
  artist?: string | null;
  artistBio?: string | null;
  date?: string | null;
  medium?: string | null;
  dimensions?: string | null;
  department?: string | null;
  culture?: string | null;
  classification?: string | null;
  creditLine?: string | null;
  objectUrl?: string | null;
}

export interface Lot {
  id: string;
  number: number;
  title: string;
  description: string | null;
  attributes: LotAttributes;
  imageUrl: string | null;
  source: string;
  externalId: string;
  seller: { name: string };
  startingPriceCents: number;
  minIncrementCents: number;
  currentPriceCents: number | null;
  minimumBidCents: number;
  bidCount: number;
  leaderTag: string | null;
  startsAt: string;
  endsAt: string;
  originalEndsAt: string;
  extended: boolean;
  phase: Phase;
  settled: boolean;
  sold: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
  settledAt: string | null;
  createdAt: string;
}

export interface PublicBid {
  seq: number;
  bidderTag: string;
  amountCents: number;
  createdAt: string;
}

export interface CatalogItem {
  source: 'met';
  externalId: string;
  title: string;
  artist: string | null;
  artistBio: string | null;
  date: string | null;
  medium: string | null;
  dimensions: string | null;
  department: string | null;
  culture: string | null;
  classification: string | null;
  creditLine: string | null;
  imageUrl: string;
  objectUrl: string | null;
}

export interface Wallet {
  balanceCents: number;
  committedCents: number;
  availableCents: number;
  commitments: Array<{ lotId: string; title: string; amountCents: number; phase: Phase }>;
  transactions: Array<{
    id: number;
    kind: 'deposit' | 'purchase' | 'sale';
    amountCents: number;
    lotId: string | null;
    lotTitle: string | null;
    createdAt: string;
  }>;
}

export interface AuditBid extends PublicBid {
  prevHash: string;
  hash: string;
  signature: string;
}

export interface Receipt {
  code: string;
  winnerTag: string;
  amountCents: number;
  bidCount: number;
  finalHash: string;
  issuedAt: string;
  signature: string;
}

export interface AuditIssue {
  seq?: number;
  type: string;
  message: string;
}
