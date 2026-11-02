import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, canonicalHead, sealBid, sign } from '../src/lib/ledger.js';
import { verifyLedger, type LedgerBid, type LedgerInput } from '../src/modules/audit/verify.js';

const lotId = '00000000-0000-0000-0000-000000000001';
const t0 = new Date('2026-10-28T12:00:00.000Z');

function buildChain(amounts: Array<[tag: string, cents: number]>): LedgerBid[] {
  let prevHash = GENESIS_HASH;
  return amounts.map(([bidderTag, amountCents], i) => {
    const fields = {
      lotId,
      seq: i + 1,
      bidderTag,
      amountCents,
      createdAt: new Date(t0.getTime() + i * 1000),
      prevHash,
    };
    const sealed = sealBid(fields);
    prevHash = sealed.hash;
    return { ...fields, ...sealed };
  });
}

function input(bids: LedgerBid[]): LedgerInput {
  const last = bids.at(-1)!;
  return {
    lot: {
      id: lotId,
      startingPriceCents: 1_000,
      minIncrementCents: 100,
      startsAt: new Date(t0.getTime() - 60_000),
      endsAt: new Date(t0.getTime() + 3_600_000),
      bidCount: bids.length,
      headHash: last.hash,
      headSignature: sign(canonicalHead(lotId, bids.length, last.hash)),
      currentPriceCents: last.amountCents,
      leaderTag: last.bidderTag,
    },
    bids,
  };
}

const chain = () =>
  buildChain([
    ['L-A', 1_000],
    ['L-B', 1_100],
    ['L-A', 1_300],
    ['L-B', 1_500],
  ]);

describe('verificação do histórico (prova de adulteração)', () => {
  it('histórico íntegro passa', () => {
    expect(verifyLedger(input(chain()))).toEqual({ intact: true, issues: [] });
  });

  it('detecta alteração de valor', () => {
    const data = input(chain());
    data.bids[1] = { ...data.bids[1], amountCents: 1_200 };
    const result = verifyLedger(data);
    expect(result.intact).toBe(false);
    expect(result.issues.map((i) => i.type)).toContain('content');
  });

  it('detecta remoção de um lance do meio', () => {
    const data = input(chain());
    data.bids.splice(1, 1);
    const types = verifyLedger(data).issues.map((i) => i.type);
    expect(types).toEqual(expect.arrayContaining(['sequence', 'chain', 'head']));
  });

  it('detecta remoção do último lance', () => {
    const data = input(chain());
    data.bids.pop();
    expect(verifyLedger(data).issues.map((i) => i.type)).toContain('head');
  });

  it('detecta cadeia recalculada sem a chave privada (hash ok, assinatura falsa)', () => {
    const data = input(chain());
    data.bids[3] = { ...data.bids[3], signature: 'ab'.repeat(64) };
    expect(verifyLedger(data).issues.map((i) => i.type)).toContain('signature');
  });

  it('detecta inserção de lance forjado no fim', () => {
    const forged = chain();
    const last = forged.at(-1)!;
    forged.push({ ...last, seq: 5, prevHash: last.hash, amountCents: 99_999, bidderTag: 'L-Z', hash: 'f'.repeat(64) });
    const data = input(chain());
    data.bids = forged;
    expect(verifyLedger(data).intact).toBe(false);
  });

  it('detecta troca de licitante (privacidade preservada, mas alteração percebida)', () => {
    const data = input(chain());
    data.bids[0] = { ...data.bids[0], bidderTag: 'L-X' };
    expect(verifyLedger(data).issues.map((i) => i.type)).toContain('content');
  });
});
