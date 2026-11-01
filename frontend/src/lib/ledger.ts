import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type { AuditBid, Receipt } from '@/lib/types';

/**
 * Verificação independente, feita no navegador: recalcula cada hash e confere cada
 * assinatura Ed25519 com a chave pública do servidor. Se o servidor (ou alguém com acesso
 * ao banco) mentir sobre a integridade, esta checagem discorda.
 * O formato canônico precisa ser idêntico ao de server/src/lib/ledger.ts.
 */
export const GENESIS_HASH = '0'.repeat(64);

const hashText = (text: string) => bytesToHex(sha256(utf8ToBytes(text)));

function verifySig(message: string, signatureHex: string, publicKeyHex: string) {
  try {
    return ed25519.verify(hexToBytes(signatureHex), utf8ToBytes(message), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

export const canonicalBid = (lotId: string, b: Pick<AuditBid, 'seq' | 'bidderTag' | 'amountCents' | 'createdAt' | 'prevHash'>) =>
  ['bid-v1', lotId, b.seq, b.bidderTag, b.amountCents, new Date(b.createdAt).toISOString(), b.prevHash].join('|');

export interface BidCheck {
  seq: number;
  hashOk: boolean;
  chainOk: boolean;
  signatureOk: boolean;
}

export interface ClientVerification {
  intact: boolean;
  bids: BidCheck[];
  headOk: boolean;
  receiptOk: boolean | null;
}

export function verifyInBrowser(input: {
  lotId: string;
  bids: AuditBid[];
  head: { bidCount: number; headHash: string; headSignature: string | null };
  receipt: Receipt | null;
  publicKey: string;
}): ClientVerification {
  const { lotId, publicKey } = input;
  const sorted = [...input.bids].sort((a, b) => a.seq - b.seq);
  let prevHash = GENESIS_HASH;
  const bids = sorted.map((bid, i) => {
    const check: BidCheck = {
      seq: bid.seq,
      hashOk: hashText(canonicalBid(lotId, bid)) === bid.hash,
      chainOk: bid.prevHash === prevHash && bid.seq === i + 1,
      signatureOk: verifySig(bid.hash, bid.signature, publicKey),
    };
    prevHash = bid.hash;
    return check;
  });

  const { head } = input;
  const headOk =
    head.bidCount === sorted.length &&
    head.headHash === prevHash &&
    (head.bidCount === 0 ||
      (!!head.headSignature && verifySig(['head-v1', lotId, head.bidCount, head.headHash].join('|'), head.headSignature, publicKey)));

  let receiptOk: boolean | null = null;
  if (input.receipt) {
    const r = input.receipt;
    const last = sorted.at(-1);
    const payload = ['receipt-v1', r.code, lotId, r.winnerTag, r.amountCents, r.bidCount, r.finalHash, new Date(r.issuedAt).toISOString()].join('|');
    receiptOk =
      verifySig(payload, r.signature, publicKey) &&
      !!last &&
      r.finalHash === last.hash &&
      r.amountCents === last.amountCents &&
      r.winnerTag === last.bidderTag;
  }

  const intact = bids.every((b) => b.hashOk && b.chainOk && b.signatureOk) && headOk && receiptOk !== false;
  return { intact, bids, headOk, receiptOk };
}
