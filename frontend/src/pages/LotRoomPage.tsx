import { ArrowUpRight, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorState, Notice, PageLoading } from '@/components/app/feedback';
import { Countdown, LotImage, LotNumber, MoneyField, PhaseLabel } from '@/components/app/lot-bits';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/context/AuthContext';
import { useWallet } from '@/context/WalletContext';
import { ApiError, api } from '@/lib/api';
import { centsToInput, formatBRL, formatDateTime, lotNumber, parseBRL, relativeTime } from '@/lib/format';
import { getSocket } from '@/lib/socket';
import { currentPhase, syncServerTime, useNow } from '@/lib/time';
import type { Lot, PublicBid } from '@/lib/types';
import { cn } from '@/lib/utils';

interface LotResponse {
  lot: Lot;
  bids: PublicBid[];
  myTag: string | null;
  serverTime: string;
}

/** Posição do usuário entre os licitantes distintos, ordenados pelo maior lance de cada um. */
function rankOf(bids: PublicBid[], tag: string | null) {
  if (!tag) return null;
  const best = new Map<string, number>();
  for (const b of bids) best.set(b.bidderTag, Math.max(best.get(b.bidderTag) ?? 0, b.amountCents));
  const ranking = [...best.entries()].sort((a, b) => b[1] - a[1]);
  const index = ranking.findIndex(([t]) => t === tag);
  return index === -1 ? null : { position: index + 1, total: ranking.length };
}

export function LotRoomPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { wallet } = useWallet();
  const location = useLocation();
  const now = useNow();
  const [data, setData] = useState<LotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [bidError, setBidError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flashSeq, setFlashSeq] = useState<number | null>(null);

  const load = useCallback(
    () =>
      api<LotResponse>(`/lots/${id}`)
        .then((d) => {
          syncServerTime(d.serverTime);
          setData(d);
          setError(null);
        })
        .catch((e) => setError(e.message)),
    [id],
  );

  useEffect(() => {
    load();
  }, [load, user?.id]);

  // Tempo real: entra na sala do lote e recebe cada lance/alteração sem recarregar a página.
  useEffect(() => {
    const socket = getSocket();
    const watch = () => socket.emit('lot:watch', id);
    watch();
    const onUpdate = (payload: { lot: Lot; bids: PublicBid[] }) => {
      if (payload.lot.id !== id) return;
      setData((d) => (d ? { ...d, lot: payload.lot, bids: payload.bids } : d));
      setFlashSeq(payload.bids[0]?.seq ?? null);
    };
    const onReconnect = () => {
      watch();
      load(); // recupera o que foi perdido durante a desconexão
    };
    socket.on('lot:update', onUpdate);
    socket.on('connect', onReconnect);
    return () => {
      socket.emit('lot:unwatch', id);
      socket.off('lot:update', onUpdate);
      socket.off('connect', onReconnect);
    };
  }, [id, load]);

  const lot = data?.lot;
  const phase = lot ? currentPhase(lot, now) : null;
  const myTag = data?.myTag ?? null;
  const isLeader = Boolean(myTag && lot?.leaderTag === myTag);
  const hasBid = Boolean(myTag && data?.bids.some((b) => b.bidderTag === myTag));
  const rank = useMemo(() => rankOf(data?.bids ?? [], myTag), [data?.bids, myTag]);

  // Sugere sempre o lance mínimo atual enquanto o usuário não digitou um valor maior.
  useEffect(() => {
    if (!lot) return;
    setAmount((current) => {
      const typed = parseBRL(current);
      return typed !== null && typed >= lot.minimumBidCents ? current : centsToInput(lot.minimumBidCents);
    });
  }, [lot?.minimumBidCents]); // eslint-disable-line react-hooks/exhaustive-deps

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
  if (!data || !lot || !phase) return <PageLoading />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBidError(null);
    const cents = parseBRL(amount);
    if (cents === null) {
      setBidError(new ApiError(400, 'VALIDATION_ERROR', 'Digite um valor válido, por exemplo 1.250,00.'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ lot: Lot; extended: boolean }>(`/lots/${id}/bids`, { body: { amountCents: cents } });
      toast.success(`Lance de ${formatBRL(cents)} aceito`, {
        description: res.extended ? 'O lote foi prorrogado por 2 minutos (anti-sniping).' : 'Você está ganhando.',
      });
      load();
    } catch (err) {
      setBidError(err as ApiError);
      if (err instanceof ApiError && err.code === 'BELOW_MINIMUM') load();
    } finally {
      setSubmitting(false);
    }
  };

  const base = lot.bidCount ? lot.currentPriceCents! : lot.startingPriceCents - lot.minIncrementCents;
  const quickBids = [1, 2, 5].map((n) => base + n * lot.minIncrementCents);
  const attrs: Array<[string, string | null | undefined]> = [
    ['Artista', lot.attributes.artist],
    ['Biografia', lot.attributes.artistBio],
    ['Data', lot.attributes.date],
    ['Técnica', lot.attributes.medium],
    ['Dimensões', lot.attributes.dimensions],
    ['Cultura', lot.attributes.culture],
    ['Classificação', lot.attributes.classification],
    ['Departamento', lot.attributes.department],
    ['Procedência', lot.attributes.creditLine],
  ];
  const closed = phase === 'ended' || phase === 'cancelled';
  const price = lot.currentPriceCents ?? lot.startingPriceCents;

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
          {lot.cancelReason ? `Motivo: ${lot.cancelReason}. ` : ''}Valores comprometidos foram estornados automaticamente.
        </Notice>
      )}

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        {/* Obra */}
        <section className="lg:col-span-7">
          <div className="bg-muted lg:sticky lg:top-24">
            <LotImage src={lot.imageUrl} alt={lot.title} className="max-h-[78vh] w-full object-contain!" />
          </div>
        </section>

        {/* Leilão */}
        <section className="lg:col-span-5">
          <div className="flex items-center justify-between">
            <LotNumber lot={lot} />
            <PhaseLabel phase={phase} />
          </div>
          <h1 className="mt-3 font-display text-3xl leading-[1.05] sm:text-4xl">{lot.title}</h1>
          <p className="mt-3 text-lg">{lot.attributes.artist ?? lot.attributes.culture ?? 'Autor desconhecido'}</p>
          <p className="text-muted-foreground">{[lot.attributes.date, lot.attributes.medium].filter(Boolean).join(' · ')}</p>
          <p className="label-mono mt-4 text-muted-foreground">Leiloeiro · {lot.seller.name}</p>

          {/* Painel de lance */}
          <div className="mt-8 border-t-2 border-foreground">
            <div className="grid grid-cols-2 border-b">
              <div className="py-4 pr-4">
                <p className="label-mono text-muted-foreground">
                  {phase === 'ended' ? (lot.bidCount ? 'Lance vencedor' : 'Sem lances') : lot.bidCount ? 'Lance atual' : 'Lance inicial'}
                </p>
                <p className="mt-1 font-mono text-3xl font-medium tabular-nums sm:text-4xl" aria-live="polite">
                  {formatBRL(price)}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {lot.bidCount} {lot.bidCount === 1 ? 'lance' : 'lances'} · incr. {formatBRL(lot.minIncrementCents)}
                </p>
              </div>
              <div className="border-l py-4 pl-4">
                <p className="label-mono text-muted-foreground">{phase === 'scheduled' ? 'Abre em' : phase === 'live' ? 'Encerra em' : 'Encerrou em'}</p>
                <p className="mt-1 text-3xl sm:text-4xl">
                  {closed ? <span className="font-mono text-lg">{formatDateTime(lot.endsAt)}</span> : <Countdown lot={lot} />}
                </p>
                {!closed && <p className="mt-1 font-mono text-xs text-muted-foreground">{formatDateTime(phase === 'scheduled' ? lot.startsAt : lot.endsAt)}</p>}
                {lot.extended && phase === 'live' && <p className="label-mono mt-1 text-signal">Prorrogado · anti-sniping</p>}
              </div>
            </div>

            {/* Você está ganhando / foi superado */}
            {hasBid && phase !== 'cancelled' && (
              <div
                role="status"
                className={cn(
                  'flex items-center justify-between gap-3 px-4 py-3',
                  isLeader ? 'bg-success text-success-foreground' : 'bg-destructive text-white',
                )}
              >
                <p className="font-semibold">
                  {phase === 'ended'
                    ? isLeader
                      ? 'Você arrematou este lote'
                      : 'Você não venceu este lote'
                    : isLeader
                      ? 'Você está ganhando'
                      : 'Você foi superado'}
                </p>
                {rank && (
                  <p className="font-mono text-sm tabular-nums">
                    {rank.position}º de {rank.total}
                  </p>
                )}
              </div>
            )}

            {phase === 'live' && (
              <div className="border-b py-5">
                {!user ? (
                  <Button size="lg" className="h-12 w-full bg-signal text-base text-signal-foreground hover:bg-signal/90" asChild>
                    <Link to="/entrar" state={{ from: location.pathname }}>
                      Entre para dar um lance
                    </Link>
                  </Button>
                ) : user.role === 'auctioneer' ? (
                  <Notice tone="info">Você está logado como leiloeiro. Leiloeiros não podem dar lances.</Notice>
                ) : (
                  <form onSubmit={submit} className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <Label htmlFor="amount">Seu lance</Label>
                      <span className="font-mono text-xs text-muted-foreground">mínimo {formatBRL(lot.minimumBidCents)}</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <MoneyField
                          id="amount"
                          className="h-12 text-lg"
                          value={amount}
                          onChange={(e) => {
                            setAmount(e.target.value);
                            setBidError(null);
                          }}
                          aria-invalid={Boolean(bidError)}
                          aria-describedby="bid-feedback"
                        />
                      </div>
                      <Button type="submit" size="lg" className="h-12 bg-signal px-6 text-base text-signal-foreground hover:bg-signal/90" disabled={submitting}>
                        {submitting && <Loader2 className="animate-spin" />} Dar lance
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {quickBids.map((value) => (
                        <Button key={value} type="button" variant="outline" size="sm" className="font-mono text-xs" onClick={() => setAmount(centsToInput(value))}>
                          {formatBRL(value)}
                        </Button>
                      ))}
                    </div>
                    <div id="bid-feedback">
                      {bidError && (
                        <Notice tone="danger" title="Lance recusado">
                          <p>{bidError.message}</p>
                          {bidError.code === 'INSUFFICIENT_FUNDS' && (
                            <Link to="/carteira" className="mt-1 inline-block font-semibold underline">
                              Depositar saldo
                            </Link>
                          )}
                        </Notice>
                      )}
                    </div>
                    {wallet && (
                      <p className="font-mono text-xs text-muted-foreground">
                        Disponível {formatBRL(wallet.availableCents)}
                        {wallet.committedCents > 0 && <> · comprometido {formatBRL(wallet.committedCents)}</>}
                      </p>
                    )}
                  </form>
                )}
              </div>
            )}
            {phase === 'scheduled' && (
              <p className="border-b py-5 text-sm text-muted-foreground">
                Os lances abrem em <span className="font-mono text-foreground">{formatDateTime(lot.startsAt)}</span>. Primeiro lance a partir de{' '}
                <span className="font-mono text-foreground">{formatBRL(lot.startingPriceCents)}</span>.
              </p>
            )}
            {phase === 'ended' && !lot.settled && lot.bidCount > 0 && (
              <p className="flex items-center gap-2 border-b py-5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Liquidando o lote…
              </p>
            )}
          </div>

          {/* Histórico */}
          <div className="mt-10">
            <div className="flex items-baseline justify-between border-b pb-2">
              <h2 className="font-display text-lg">Histórico de lances</h2>
              <Link to={`/lotes/${lot.id}/auditoria`} className="label-mono inline-flex items-center gap-1 hover:text-signal">
                Auditar <ArrowUpRight className="size-3" />
              </Link>
            </div>
            {data.bids.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">Nenhum lance ainda.{phase === 'live' && ' Seja o primeiro.'}</p>
            ) : (
              <ol className="max-h-80 overflow-y-auto">
                {data.bids.map((bid, i) => (
                  <li
                    key={bid.seq}
                    className={cn('grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-3 border-b py-2.5 font-mono text-sm', bid.seq === flashSeq && 'animate-flash')}
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
                    <span className={cn('tabular-nums', i === 0 ? 'font-semibold' : 'text-muted-foreground')}>{formatBRL(bid.amountCents)}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Licitantes aparecem por pseudônimo, diferente em cada lote. Lances nos últimos 2 minutos prorrogam o encerramento em 2 minutos.
            </p>
          </div>

          {/* Ficha da obra */}
          <div className="mt-10">
            <h2 className="border-b pb-2 font-display text-lg">Sobre a obra</h2>
            {lot.description && <p className="mt-4 leading-relaxed">{lot.description}</p>}
            <dl className="mt-2">
              {attrs
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[8rem_1fr] gap-4 border-b py-2.5 text-sm">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            {lot.attributes.objectUrl && (
              <a href={lot.attributes.objectUrl} target="_blank" rel="noreferrer" className="label-mono mt-4 inline-flex items-center gap-1 hover:text-signal">
                Ver no acervo do Met <ArrowUpRight className="size-3" />
              </a>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
