import { Loader2 } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ErrorState, Notice, PageLoading } from '@/components/app/feedback';
import { Countdown, LotImage, LotNumber, PhaseLabel } from '@/components/app/lot-bits';
import { ArtworkDetails } from '@/components/lot-room/ArtworkDetails';
import { BidForm } from '@/components/lot-room/BidForm';
import { BidHistory } from '@/components/lot-room/BidHistory';
import { LeaderBanner } from '@/components/lot-room/LeaderBanner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useLot } from '@/hooks/useLot';
import { formatBRL, formatDateTime, lotNumber } from '@/lib/format';
import { currentPhase, useNow } from '@/lib/time';
import type { Lot, Phase } from '@/lib/types';

function priceLabel(lot: Lot, phase: Phase) {
  if (phase === 'ended') return lot.bidCount ? 'Lance vencedor' : 'Sem lances';
  return lot.bidCount ? 'Lance atual' : 'Lance inicial';
}

function timeLabel(phase: Phase) {
  if (phase === 'scheduled') return 'Abre em';
  return phase === 'live' ? 'Encerra em' : 'Encerrou em';
}

export function LotRoomPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const now = useNow();
  const { data, error, reload, flashSeq } = useLot(id);

  if (error) {
    return (
      <ErrorState
        message={error}
        action={
          <Button variant="outline" asChild>
            <Link to="/">Voltar aos leilões</Link>
          </Button>
        }
      />
    );
  }
  if (!data) return <PageLoading />;

  const { lot, bids, myTag } = data;
  const phase = currentPhase(lot, now);
  const isLeader = Boolean(myTag && lot.leaderTag === myTag);
  const hasBid = Boolean(myTag && bids.some((b) => b.bidderTag === myTag));
  const closed = phase === 'ended' || phase === 'cancelled';

  return (
    <div>
      <nav className="label-mono mb-6 flex items-center gap-2 text-muted-foreground" aria-label="Navegação">
        <Link to="/" className="hover:text-foreground">
          Leilões
        </Link>
        <span>/</span>
        <span className="text-foreground">Lote {lotNumber(lot.number)}</span>
      </nav>

      {phase === 'cancelled' && (
        <Notice tone="warning" title="Lote cancelado pelo leiloeiro" className="mb-8">
          {lot.cancelReason ? `Motivo: ${lot.cancelReason}. ` : ''}Valores comprometidos foram estornados
          automaticamente.
        </Notice>
      )}

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        <section className="lg:col-span-7">
          <div className="bg-muted lg:sticky lg:top-24">
            <LotImage src={lot.imageUrl} alt={lot.title} className="max-h-[78vh] w-full object-contain!" />
          </div>
        </section>

        <section className="lg:col-span-5">
          <div className="flex items-center justify-between">
            <LotNumber lot={lot} />
            <PhaseLabel phase={phase} />
          </div>
          <h1 className="mt-3 font-display text-3xl leading-[1.05] sm:text-4xl">{lot.title}</h1>
          <p className="mt-3 text-lg">{lot.attributes.artist ?? lot.attributes.culture ?? 'Autor desconhecido'}</p>
          <p className="text-muted-foreground">
            {[lot.attributes.date, lot.attributes.medium].filter(Boolean).join(' · ')}
          </p>
          <p className="label-mono mt-4 text-muted-foreground">Leiloeiro · {lot.seller.name}</p>

          <div className="mt-8 border-t-2 border-foreground">
            <div className="grid grid-cols-2 border-b">
              <div className="py-4 pr-4">
                <p className="label-mono text-muted-foreground">{priceLabel(lot, phase)}</p>
                <p className="mt-1 font-mono text-3xl font-medium tabular-nums sm:text-4xl" aria-live="polite">
                  {formatBRL(lot.currentPriceCents ?? lot.startingPriceCents)}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {lot.bidCount} {lot.bidCount === 1 ? 'lance' : 'lances'} · incr. {formatBRL(lot.minIncrementCents)}
                </p>
              </div>
              <div className="border-l py-4 pl-4">
                <p className="label-mono text-muted-foreground">{timeLabel(phase)}</p>
                <p className="mt-1 text-3xl sm:text-4xl">
                  {closed ? (
                    <span className="font-mono text-lg">{formatDateTime(lot.endsAt)}</span>
                  ) : (
                    <Countdown lot={lot} />
                  )}
                </p>
                {!closed && (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {formatDateTime(phase === 'scheduled' ? lot.startsAt : lot.endsAt)}
                  </p>
                )}
                {lot.extended && phase === 'live' && (
                  <p className="label-mono mt-1 text-signal">Prorrogado · anti-sniping</p>
                )}
              </div>
            </div>

            {myTag && hasBid && phase !== 'cancelled' && (
              <LeaderBanner bids={bids} myTag={myTag} isLeader={isLeader} phase={phase} />
            )}

            {phase === 'live' && (
              <div className="border-b py-5">
                {!user ? (
                  <Button
                    size="lg"
                    className="h-12 w-full bg-signal text-base text-signal-foreground hover:bg-signal/90"
                    asChild
                  >
                    <Link to="/entrar" state={{ from: location.pathname }}>
                      Entre para dar um lance
                    </Link>
                  </Button>
                ) : user.role === 'auctioneer' ? (
                  <Notice tone="info">Você está logado como leiloeiro. Leiloeiros não podem dar lances.</Notice>
                ) : (
                  <BidForm lot={lot} onStale={reload} />
                )}
              </div>
            )}
            {phase === 'scheduled' && (
              <p className="border-b py-5 text-sm text-muted-foreground">
                Os lances abrem em <span className="font-mono text-foreground">{formatDateTime(lot.startsAt)}</span>.
                Primeiro lance a partir de{' '}
                <span className="font-mono text-foreground">{formatBRL(lot.startingPriceCents)}</span>.
              </p>
            )}
            {phase === 'ended' && !lot.settled && lot.bidCount > 0 && (
              <p className="flex items-center gap-2 border-b py-5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Liquidando o lote…
              </p>
            )}
          </div>

          <BidHistory lotId={lot.id} bids={bids} phase={phase} myTag={myTag} flashSeq={flashSeq} now={now} />
          <ArtworkDetails lot={lot} />
        </section>
      </div>
    </div>
  );
}
