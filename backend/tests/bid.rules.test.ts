import { describe, expect, it } from 'vitest';
import { evaluateBid, extendedEnd, insufficientFunds, minimumBid, type RuleLot } from '../src/modules/bids/bid.rules.js';

const now = new Date('2026-10-28T12:00:00Z');
const lot = (overrides: Partial<RuleLot> = {}): RuleLot => ({
  status: 'active',
  startsAt: new Date('2026-10-28T11:00:00Z'),
  endsAt: new Date('2026-10-28T13:00:00Z'),
  startingPriceCents: 10_000,
  minIncrementCents: 1_000,
  currentPriceCents: null,
  bidCount: 0,
  leaderId: null,
  ...overrides,
});

describe('regras de lance', () => {
  it('primeiro lance deve ser >= lance inicial', () => {
    expect(evaluateBid(lot(), 'u1', 9_999, now)?.code).toBe('BELOW_MINIMUM');
    expect(evaluateBid(lot(), 'u1', 10_000, now)).toBeNull();
  });

  it('lances seguintes devem ser >= lance atual + incremento', () => {
    const l = lot({ bidCount: 1, currentPriceCents: 10_000, leaderId: 'u2' });
    expect(minimumBid(l)).toBe(11_000);
    const err = evaluateBid(l, 'u1', 10_999, now);
    expect(err?.code).toBe('BELOW_MINIMUM');
    expect(err?.details).toEqual({ minimumBidCents: 11_000 });
    expect(evaluateBid(l, 'u1', 11_000, now)).toBeNull();
  });

  it('só aceita lances entre início e fim', () => {
    expect(evaluateBid(lot({ startsAt: new Date('2026-10-28T12:00:01Z') }), 'u1', 10_000, now)?.code).toBe('LOT_NOT_STARTED');
    expect(evaluateBid(lot({ endsAt: now }), 'u1', 10_000, now)?.code).toBe('LOT_ENDED');
    expect(evaluateBid(lot({ status: 'settled' }), 'u1', 10_000, now)?.code).toBe('LOT_ENDED');
    expect(evaluateBid(lot({ status: 'cancelled' }), 'u1', 10_000, now)?.code).toBe('LOT_CANCELLED');
  });

  it('líder não pode cobrir o próprio lance', () => {
    const l = lot({ bidCount: 1, currentPriceCents: 10_000, leaderId: 'u1' });
    expect(evaluateBid(l, 'u1', 50_000, now)?.code).toBe('ALREADY_WINNING');
  });

  it('saldo disponível precisa cobrir o lance', () => {
    expect(insufficientFunds(9_999, 10_000)?.code).toBe('INSUFFICIENT_FUNDS');
    expect(insufficientFunds(10_000, 10_000)).toBeNull();
  });
});

describe('anti-sniping', () => {
  const window = 2 * 60 * 1000;
  it('lance nos últimos 2 minutos estende o fim para agora + 2 min', () => {
    const endsAt = new Date(now.getTime() + 30_000);
    expect(extendedEnd(endsAt, now, window)).toEqual(new Date(now.getTime() + window));
  });
  it('lance fora da janela não altera o fim', () => {
    expect(extendedEnd(new Date(now.getTime() + window + 1), now, window)).toBeNull();
  });
});
