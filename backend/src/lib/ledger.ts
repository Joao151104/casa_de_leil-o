import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Prova de adulteração do histórico de lances.
 *
 * Cada lance vira uma linha canônica (`canonicalBid`) que inclui o hash do lance anterior.
 * O SHA-256 dessa linha é o hash do lance, e esse hash é assinado com Ed25519.
 *
 * - Alterar um campo muda o hash recalculado      → detectado.
 * - Remover/inserir/reordenar quebra `prev_hash`/`seq` → detectado.
 * - Recalcular a cadeia inteira direto no banco exige a chave privada, que é derivada de
 *   LEDGER_SIGNING_SECRET e nunca é gravada no banco → as assinaturas deixam de bater.
 *
 * A chave pública é exposta em /api/audit/public-key, então qualquer pessoa pode verificar
 * (a página de auditoria refaz a verificação no próprio navegador).
 */

export const GENESIS_HASH = '0'.repeat(64);

const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const seed = crypto.createHash('sha256').update(config.ledgerSigningSecret).digest();
const privateKey = crypto.createPrivateKey({
  key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
  format: 'der',
  type: 'pkcs8',
});
const publicKey = crypto.createPublicKey(privateKey);

export const publicKeyHex = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer)
  .subarray(-32)
  .toString('hex');

export interface BidFields {
  lotId: string;
  seq: number;
  bidderTag: string;
  amountCents: number;
  createdAt: Date;
  prevHash: string;
}

export interface ReceiptFields {
  code: string;
  lotId: string;
  winnerTag: string;
  amountCents: number;
  bidCount: number;
  finalHash: string;
  issuedAt: Date;
}

export const canonicalBid = (b: BidFields) =>
  ['bid-v1', b.lotId, b.seq, b.bidderTag, b.amountCents, b.createdAt.toISOString(), b.prevHash].join('|');

export const canonicalHead = (lotId: string, bidCount: number, headHash: string) =>
  ['head-v1', lotId, bidCount, headHash].join('|');

export const canonicalReceipt = (r: ReceiptFields) =>
  [
    'receipt-v1',
    r.code,
    r.lotId,
    r.winnerTag,
    r.amountCents,
    r.bidCount,
    r.finalHash,
    r.issuedAt.toISOString(),
  ].join('|');

export const sha256 = (text: string) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

export const sign = (message: string) =>
  crypto.sign(null, Buffer.from(message, 'utf8'), privateKey).toString('hex');

export function verifySignature(message: string, signatureHex: string): boolean {
  try {
    return crypto.verify(null, Buffer.from(message, 'utf8'), publicKey, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

export function sealBid(fields: BidFields) {
  const hash = sha256(canonicalBid(fields));
  return { hash, signature: sign(hash) };
}
