import { AppError } from '../../lib/errors.js';
import { formatBRL } from '../../lib/money.js';

export interface RuleLot {
  status: 'active' | 'cancelled' | 'settled';
  startsAt: Date;
  endsAt: Date;
  startingPriceCents: number;
  minIncrementCents: number;
  currentPriceCents: number | null;
  bidCount: number;
  leaderId: string | null;
}

export const minimumBid = (lot: RuleLot) =>
  lot.bidCount === 0 ? lot.startingPriceCents : lot.currentPriceCents! + lot.minIncrementCents;

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

const reject = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(422, code, message, details);

/**
 * Regras de lance (puras, sem I/O). A ordem define qual motivo o usuário vê primeiro.
 * Saldo é verificado à parte, depois do lock da carteira.
 */
export function evaluateBid(lot: RuleLot, bidderId: string, amountCents: number, now: Date): AppError | null {
  if (lot.status === 'cancelled') return reject('LOT_CANCELLED', 'Este lote foi cancelado pelo leiloeiro.');
  if (now < lot.startsAt) {
    return reject(
      'LOT_NOT_STARTED',
      `Este lote ainda não começou. Os lances abrem em ${dateTime.format(lot.startsAt)}.`,
      {
        startsAt: lot.startsAt,
      },
    );
  }
  if (lot.status === 'settled' || now >= lot.endsAt) return reject('LOT_ENDED', 'Este lote já foi encerrado.');
  if (lot.leaderId === bidderId) {
    return reject('ALREADY_WINNING', 'Você já está ganhando este lote. Não dá para cobrir o próprio lance.');
  }
  const minimum = minimumBid(lot);
  if (amountCents < minimum) {
    return reject(
      'BELOW_MINIMUM',
      lot.bidCount === 0
        ? `Lance abaixo do mínimo. O primeiro lance deve ser de pelo menos ${formatBRL(minimum)} (lance inicial).`
        : `Lance abaixo do mínimo. O próximo lance deve ser de pelo menos ${formatBRL(minimum)} (lance atual + incremento mínimo).`,
      { minimumBidCents: minimum },
    );
  }
  return null;
}

export function insufficientFunds(availableCents: number, amountCents: number): AppError | null {
  if (amountCents <= availableCents) return null;
  return reject(
    'INSUFFICIENT_FUNDS',
    `Saldo insuficiente. Seu saldo disponível é ${formatBRL(availableCents)} e o lance é de ${formatBRL(amountCents)}.`,
    { availableCents },
  );
}

/** Anti-sniping: lance aceito nos últimos `windowMs` estende o fim para `now + windowMs`. */
export function extendedEnd(endsAt: Date, now: Date, windowMs: number): Date | null {
  return endsAt.getTime() - now.getTime() <= windowMs ? new Date(now.getTime() + windowMs) : null;
}
