import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatBRL, formatDateTime, relativeTime } from '@/lib/format';
import type { Phase, PublicBid } from '@/lib/types';
import { cn } from '@/lib/utils';

interface BidHistoryProps {
  lotId: string;
  bids: PublicBid[];
  phase: Phase;
  myTag: string | null;
  flashSeq: number | null;
  now: number;
}

export function BidHistory({ lotId, bids, phase, myTag, flashSeq, now }: BidHistoryProps) {
  return (
    <div className="mt-10">
      <div className="flex items-baseline justify-between border-b pb-2">
        <h2 className="font-display text-lg">Histórico de lances</h2>
        <Link to={`/lotes/${lotId}/auditoria`} className="label-mono inline-flex items-center gap-1 hover:text-signal">
          Auditar <ArrowUpRight className="size-3" />
        </Link>
      </div>
      {bids.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Nenhum lance ainda.{phase === 'live' && ' Seja o primeiro.'}
        </p>
      ) : (
        <ol className="max-h-80 overflow-y-auto">
          {bids.map((bid, i) => (
            <li
              key={bid.seq}
              className={cn(
                'grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-3 border-b py-2.5 font-mono text-sm',
                bid.seq === flashSeq && 'animate-flash',
              )}
            >
              <span className="text-muted-foreground tabular-nums">{String(bid.seq).padStart(2, '0')}</span>
              <span className="min-w-0 truncate">
                {bid.bidderTag}
                {bid.bidderTag === myTag && <span className="ml-2 text-signal">você</span>}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 text-xs text-muted-foreground">{relativeTime(bid.createdAt, now)}</span>
                  </TooltipTrigger>
                  <TooltipContent>{formatDateTime(bid.createdAt)}</TooltipContent>
                </Tooltip>
              </span>
              <span className={cn('tabular-nums', i === 0 ? 'font-semibold' : 'text-muted-foreground')}>
                {formatBRL(bid.amountCents)}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Licitantes aparecem por pseudônimo, diferente em cada lote. Lances nos últimos 2 minutos prorrogam o
        encerramento em 2 minutos.
      </p>
    </div>
  );
}
