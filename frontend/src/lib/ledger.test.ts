import { describe, expect, it } from 'vitest';
import vector from './__fixtures__/ledger-vector.json';
import { verifyInBrowser } from './ledger';

/**
 * O vetor é gerado pelo backend (backend/tests/fixtures/ledger-vector.json, validado lá pelo
 * ledger-vector.test.ts). Aqui garantimos que a verificação no navegador aceita exatamente
 * o que o servidor assina, e rejeita qualquer alteração.
 */
const input = () => structuredClone({ lotId: vector.lotId, bids: vector.bids, head: vector.head, receipt: vector.receipt, publicKey: vector.publicKey });

describe('verificação no navegador (vetor de teste do backend)', () => {
  it('aceita o histórico íntegro', () => {
    const result = verifyInBrowser(input());
    expect(result).toMatchObject({ intact: true, headOk: true, receiptOk: true });
  });

  it('detecta valor alterado', () => {
    const data = input();
    data.bids[0].amountCents = 99_999;
    const result = verifyInBrowser(data);
    expect(result.intact).toBe(false);
    expect(result.bids[0].hashOk).toBe(false);
  });

  it('detecta remoção do último lance', () => {
    const data = input();
    data.bids.pop();
    expect(verifyInBrowser(data).headOk).toBe(false);
  });

  it('detecta assinatura forjada', () => {
    const data = input();
    data.bids[1].signature = 'ab'.repeat(64);
    expect(verifyInBrowser(data).bids[1].signatureOk).toBe(false);
  });
});
