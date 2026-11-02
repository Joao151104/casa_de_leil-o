import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, canonicalHead, canonicalReceipt, publicKeyHex, sealBid, sign } from '../src/lib/ledger.js';
import vector from './fixtures/ledger-vector.json' with { type: 'json' };

/**
 * Vetor de teste do formato canônico do ledger. O MESMO arquivo existe em
 * frontend/src/lib/__fixtures__/ledger-vector.json e o frontend verifica que o aceita.
 * Se o formato mudar aqui, este teste falha e o vetor precisa ser regenerado nos dois projetos.
 * (Ed25519 é determinístico, então as assinaturas também são reproduzíveis.)
 */
describe('vetor de teste do ledger (contrato com o frontend)', () => {
  it('chave pública derivada do segredo de teste', () => {
    expect(publicKeyHex).toBe(vector.publicKey);
  });

  it('hashes e assinaturas dos lances', () => {
    let prevHash = GENESIS_HASH;
    for (const bid of vector.bids) {
      const sealed = sealBid({
        lotId: vector.lotId,
        seq: bid.seq,
        bidderTag: bid.bidderTag,
        amountCents: bid.amountCents,
        createdAt: new Date(bid.createdAt),
        prevHash,
      });
      expect(sealed).toEqual({ hash: bid.hash, signature: bid.signature });
      prevHash = sealed.hash;
    }
  });

  it('cabeça e comprovante', () => {
    const { head, receipt } = vector;
    expect(sign(canonicalHead(vector.lotId, head.bidCount, head.headHash))).toBe(head.headSignature);
    expect(sign(canonicalReceipt({ ...receipt, lotId: vector.lotId, issuedAt: new Date(receipt.issuedAt) }))).toBe(
      receipt.signature,
    );
  });
});
