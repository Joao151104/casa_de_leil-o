import {
  GENESIS_HASH,
  canonicalBid,
  canonicalHead,
  canonicalReceipt,
  sha256,
  verifySignature,
} from '../../lib/ledger.js';

export interface LedgerBid {
  seq: number;
  bidderTag: string;
  amountCents: number;
  createdAt: Date;
  prevHash: string;
  hash: string;
  signature: string;
}

export interface LedgerInput {
  lot: {
    id: string;
    startingPriceCents: number;
    minIncrementCents: number;
    startsAt: Date;
    endsAt: Date;
    bidCount: number;
    headHash: string;
    headSignature: string | null;
    currentPriceCents: number | null;
    leaderTag: string | null;
  };
  bids: LedgerBid[];
  receipt?: {
    code: string;
    winnerTag: string;
    amountCents: number;
    bidCount: number;
    finalHash: string;
    issuedAt: Date;
    signature: string;
  } | null;
}

export interface AuditIssue {
  seq?: number;
  type: string;
  message: string;
}

/**
 * Verifica o histórico de lances de um lote. Cada checagem cobre um tipo de adulteração:
 * - hash recalculado ≠ armazenado ......... campo de um lance alterado
 * - assinatura inválida ................... cadeia recalculada sem a chave privada
 * - prev_hash / seq quebrados ............. lance removido, inserido ou reordenado
 * - cabeça (head) do lote divergente ...... lance removido/adicionado no fim da cadeia
 * - regras de lance violadas .............. lance forjado que o sistema nunca aceitaria
 * - comprovante divergente ................ resultado do leilão alterado
 */
export function verifyLedger({ lot, bids, receipt }: LedgerInput) {
  const issues: AuditIssue[] = [];
  const sorted = [...bids].sort((a, b) => a.seq - b.seq);

  let prevHash = GENESIS_HASH;
  let prev: LedgerBid | null = null;
  sorted.forEach((bid, index) => {
    const expectedSeq = index + 1;
    if (bid.seq !== expectedSeq) {
      issues.push({
        seq: bid.seq,
        type: 'sequence',
        message: `Sequência quebrada: esperado o lance nº ${expectedSeq}, encontrado nº ${bid.seq} (lance removido ou inserido).`,
      });
    }
    if (bid.prevHash !== prevHash) {
      issues.push({
        seq: bid.seq,
        type: 'chain',
        message: 'O hash anterior não corresponde ao lance precedente (lance removido, inserido ou reordenado).',
      });
    }
    const recomputed = sha256(canonicalBid({ lotId: lot.id, ...bid }));
    if (recomputed !== bid.hash) {
      issues.push({
        seq: bid.seq,
        type: 'content',
        message: 'O conteúdo do lance foi alterado: o hash recalculado não confere.',
      });
    }
    if (!verifySignature(bid.hash, bid.signature)) {
      issues.push({ seq: bid.seq, type: 'signature', message: 'Assinatura digital inválida para este lance.' });
    }
    const minimum = prev ? prev.amountCents + lot.minIncrementCents : lot.startingPriceCents;
    if (bid.amountCents < minimum) {
      issues.push({ seq: bid.seq, type: 'rule', message: 'Valor abaixo do mínimo permitido no momento do lance.' });
    }
    if (prev && prev.bidderTag === bid.bidderTag) {
      issues.push({ seq: bid.seq, type: 'rule', message: 'O licitante líder cobriu o próprio lance (regra violada).' });
    }
    if (bid.createdAt < lot.startsAt || bid.createdAt > lot.endsAt || (prev && bid.createdAt < prev.createdAt)) {
      issues.push({ seq: bid.seq, type: 'rule', message: 'Horário do lance fora da janela do lote ou fora de ordem.' });
    }
    prevHash = bid.hash;
    prev = bid;
  });

  const last = sorted.at(-1) ?? null;
  if (lot.bidCount !== sorted.length || lot.headHash !== prevHash) {
    issues.push({
      type: 'head',
      message: `O lote registra ${lot.bidCount} lance(s), mas o histórico tem ${sorted.length} ou termina em outro hash (lance removido ou adicionado no fim).`,
    });
  }
  if (
    lot.bidCount > 0 &&
    (!lot.headSignature || !verifySignature(canonicalHead(lot.id, lot.bidCount, lot.headHash), lot.headSignature))
  ) {
    issues.push({ type: 'head', message: 'Assinatura do estado final do lote inválida.' });
  }
  if (last && (lot.currentPriceCents !== last.amountCents || lot.leaderTag !== last.bidderTag)) {
    issues.push({ type: 'head', message: 'O lance atual/líder do lote não corresponde ao último lance do histórico.' });
  }

  if (receipt) {
    const receiptOk = verifySignature(canonicalReceipt({ ...receipt, lotId: lot.id }), receipt.signature);
    if (!receiptOk) issues.push({ type: 'receipt', message: 'Assinatura do comprovante de arremate inválida.' });
    if (
      !last ||
      receipt.finalHash !== last.hash ||
      receipt.amountCents !== last.amountCents ||
      receipt.winnerTag !== last.bidderTag ||
      receipt.bidCount !== sorted.length
    ) {
      issues.push({ type: 'receipt', message: 'O comprovante de arremate não corresponde ao histórico de lances.' });
    }
  }

  return { intact: issues.length === 0, issues };
}
