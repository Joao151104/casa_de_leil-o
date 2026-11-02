import { Link } from 'react-router-dom';
import { formatBRL, formatDateTime } from '@/lib/format';
import { currentPhase, useNow } from '@/lib/time';
import type { Lot } from '@/lib/types';
import { ArtworkFrame, Countdown, LotNumber, PhaseLabel } from './lot-bits';

/**
 * Card de uma obra: caixa com contorno (onde começa e termina fica claro), moldura no topo
 * separada das informações por uma linha, e preço/tempo presos na base para que todos os
 * cards da mesma fileira tenham a mesma altura.
 */
export function LotCard({ lot }: { lot: Lot }) {
  const now = useNow();
  const phase = currentPhase(lot, now);
  const ended = phase === 'ended';
  const priceLabel = ended
    ? lot.sold
      ? 'Arrematado'
      : 'Sem lances'
    : lot.bidCount
      ? `Lance atual · ${lot.bidCount}`
      : 'Lance inicial';

  return (
    <Link
      to={`/lotes/${lot.id}`}
      className="group flex h-full flex-col border bg-card transition-colors hover:border-foreground focus-visible:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      <ArtworkFrame
        src={lot.imageUrl}
        alt={lot.title}
        className="aspect-square border-b"
        inset="inset-3 sm:inset-6"
        imgClassName="transition duration-700 ease-out group-hover:scale-[1.03]"
      />
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <LotNumber lot={lot} />
          <PhaseLabel phase={phase} />
        </div>
        <h3 className="mt-1.5 line-clamp-2 text-sm leading-snug font-medium sm:text-base">{lot.title}</h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:text-sm">
          {[lot.attributes.artist, lot.attributes.date].filter(Boolean).join(', ') ||
            lot.attributes.culture ||
            'Autor desconhecido'}
        </p>

        {/* mt-auto: a faixa de preço fica na base do card, alinhada entre os cards da fileira. */}
        <div className="mt-auto pt-4">
          <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="label-mono text-muted-foreground">{priceLabel}</p>
              <p className="font-mono text-[13px] font-medium tabular-nums sm:text-[15px]">
                {ended && !lot.sold ? '—' : formatBRL(lot.currentPriceCents ?? lot.startingPriceCents)}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="label-mono text-muted-foreground">
                {ended ? 'Encerrou' : phase === 'scheduled' ? 'Abre em' : 'Encerra em'}
              </p>
              {ended ? (
                <p className="font-mono text-xs text-muted-foreground sm:text-[13px]">{formatDateTime(lot.endsAt)}</p>
              ) : (
                <Countdown lot={lot} className="text-[13px] sm:text-[15px]" />
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
