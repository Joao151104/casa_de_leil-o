import { useMemo } from 'react';
import type { Phase, PublicBid } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Posição do usuário entre os licitantes distintos, ordenados pelo maior lance de cada um. */
function rankOf(bids: PublicBid[], tag: string) {
  const best = new Map<string, number>();
  for (const b of bids) best.set(b.bidderTag, Math.max(best.get(b.bidderTag) ?? 0, b.amountCents));
  const ranking = [...best.entries()].toSorted((a, b) => b[1] - a[1]);
  const index = ranking.findIndex(([t]) => t === tag);
  return index === -1 ? null : { position: index + 1, total: ranking.length };
}

function message(phase: Phase, isLeader: boolean) {
  if (phase === 'ended') return isLeader ? 'Você arrematou este lote' : 'Você não venceu este lote';
  return isLeader ? 'Você está ganhando' : 'Você foi superado';
}

interface LeaderBannerProps {
  bids: PublicBid[];
  myTag: string;
  isLeader: boolean;
  phase: Phase;
}

/** "Você está ganhando" / "Você foi superado", com a posição do usuário na disputa. */
export function LeaderBanner({ bids, myTag, isLeader, phase }: LeaderBannerProps) {
  const rank = useMemo(() => rankOf(bids, myTag), [bids, myTag]);

  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-3',
        isLeader ? 'bg-success text-success-foreground' : 'bg-destructive text-white',
      )}
    >
      <p className="font-semibold">{message(phase, isLeader)}</p>
      {rank && (
        <p className="font-mono text-sm tabular-nums">
          {rank.position}º de {rank.total}
        </p>
      )}
    </div>
  );
}
