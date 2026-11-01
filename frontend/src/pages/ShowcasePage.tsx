import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, PageLoading } from '@/components/app/feedback';
import { LotCard } from '@/components/app/LotCard';
import { ArtworkFrame, Countdown, LotNumber, PhaseLabel } from '@/components/app/lot-bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatBRL, formatDateTime } from '@/lib/format';
import { getSocket } from '@/lib/socket';
import type { Lot, Phase } from '@/lib/types';

type ShowcasePhase = Exclude<Phase, 'cancelled'>;
const TABS: Array<{ phase: ShowcasePhase; label: string }> = [
  { phase: 'live', label: 'Ao vivo' },
  { phase: 'scheduled', label: 'Agendados' },
  { phase: 'ended', label: 'Encerrados' },
];
const SORTS = [
  { value: 'relevance', label: 'Relevância' },
  { value: 'ending', label: 'Terminando antes' },
  { value: 'newest', label: 'Mais recentes' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
];

interface ShowcaseData {
  lots: Lot[];
  counts: Partial<Record<Phase, number>>;
}

/** Destaque: o lote ao vivo que encerra primeiro, em formato de página de catálogo. */
function FeaturedLot({ lot }: { lot: Lot }) {
  return (
    <section className="mb-8 grid gap-5 border-b pb-8 sm:mb-14 sm:gap-8 sm:pb-14 lg:grid-cols-12 lg:gap-12">
      <Link to={`/lotes/${lot.id}`} className="group -mx-5 sm:mx-0 lg:col-span-7" aria-label={`Abrir ${lot.title}`}>
        <ArtworkFrame
          src={lot.imageUrl}
          alt={lot.title}
          className="aspect-square sm:aspect-[4/3]"
          inset="inset-6 sm:inset-10 lg:inset-14"
          imgClassName="transition duration-700 ease-out group-hover:scale-[1.02]"
        />
      </Link>
      <div className="flex flex-col lg:col-span-5">
        <div className="flex items-center justify-between">
          <LotNumber lot={lot} />
          <PhaseLabel phase="live" />
        </div>
        <p className="label-mono mt-4 text-signal sm:mt-6">Em destaque · encerra primeiro</p>
        <h2 className="mt-2 font-display text-2xl leading-[1.05] sm:text-4xl xl:text-5xl">{lot.title}</h2>
        <p className="mt-2 text-muted-foreground sm:mt-3">{[lot.attributes.artist, lot.attributes.date].filter(Boolean).join(', ')}</p>
        {lot.attributes.medium && <p className="line-clamp-2 hidden text-sm text-muted-foreground sm:block">{lot.attributes.medium}</p>}

        <dl className="mt-5 grid grid-cols-2 border-t pt-4 sm:mt-8 sm:pt-5 lg:mt-auto">
          <div>
            <dt className="label-mono text-muted-foreground">{lot.bidCount ? 'Lance atual' : 'Lance inicial'}</dt>
            <dd className="mt-1 font-mono text-xl tabular-nums sm:text-2xl">{formatBRL(lot.currentPriceCents ?? lot.startingPriceCents)}</dd>
          </div>
          <div className="border-l pl-4 sm:pl-5">
            <dt className="label-mono text-muted-foreground">Encerra em</dt>
            <dd className="mt-1 text-xl sm:text-2xl">
              <Countdown lot={lot} />
            </dd>
            <dd className="font-mono text-xs text-muted-foreground">{formatDateTime(lot.endsAt)}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-col gap-2 sm:mt-6 sm:flex-row sm:items-center sm:gap-4">
          <Button size="lg" className="h-11 w-full px-6 sm:w-auto" asChild>
            <Link to={`/lotes/${lot.id}`}>Entrar na sala do lote</Link>
          </Button>
          <span className="text-center font-mono text-xs text-muted-foreground sm:text-left">
            {lot.bidCount} {lot.bidCount === 1 ? 'lance' : 'lances'} até agora
          </span>
        </div>
      </div>
    </section>
  );
}

export function ShowcasePage() {
  const [params, setParams] = useSearchParams();
  const phase = (params.get('fase') as ShowcasePhase) || 'live';
  const sort = params.get('ordem') ?? '';
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);
  const [data, setData] = useState<ShowcaseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const load = useCallback(() => {
    const query = new URLSearchParams({ phase, ...(q && { q }), ...(sort && { sort }) });
    return api<ShowcaseData>(`/lots?${query}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [phase, q, sort]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce da busca textual.
  useEffect(() => {
    const id = setTimeout(() => search !== q && update({ q: search }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Tempo real: preço/lances atualizam no card; lotes que mudam de fase/criados/cancelados recarregam a lista.
  useEffect(() => {
    const socket = getSocket();
    socket.emit('showcase:watch');
    const onUpdate = ({ lot }: { lot: Lot }) => {
      const d = dataRef.current;
      const exists = d?.lots.some((l) => l.id === lot.id);
      if (d && exists && lot.phase === phase) setData({ ...d, lots: d.lots.map((l) => (l.id === lot.id ? lot : l)) });
      else if (exists || lot.phase === phase) load();
    };
    const onReconnect = () => {
      socket.emit('showcase:watch');
      load();
    };
    socket.on('showcase:update', onUpdate);
    socket.on('connect', onReconnect);
    // Lotes que começam/terminam pelo relógio: recarrega periodicamente para mover entre abas.
    const id = setInterval(load, 30_000);
    return () => {
      socket.emit('showcase:unwatch');
      socket.off('showcase:update', onUpdate);
      socket.off('connect', onReconnect);
      clearInterval(id);
    };
  }, [phase, load]);

  const featured =
    data && phase === 'live' && !q && data.lots.length > 0
      ? [...data.lots].sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())[0]
      : null;
  const grid = data ? data.lots.filter((l) => l.id !== featured?.id) : [];

  return (
    <div>
      {featured && <FeaturedLot lot={featured} />}

      {/* Barra do catálogo: fica presa logo abaixo do cabeçalho ao rolar (abas + busca sempre à mão). */}
      <div className="sticky top-14 z-20 -mx-5 mb-6 border-b bg-background/95 px-5 backdrop-blur-md sm:-mx-8 sm:mb-8 sm:px-8 lg:flex lg:items-end lg:justify-between lg:gap-4">
        <Tabs value={phase} onValueChange={(v) => update({ fase: v === 'live' ? '' : v })} className="overflow-x-auto">
          <TabsList variant="line" className="h-11! gap-5 p-0 sm:gap-6">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.phase} value={tab.phase} className="flex-none gap-2 px-0 text-base after:bottom-[-1px]!">
                {tab.label}
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{data?.counts[tab.phase] ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="grid grid-cols-[1fr_auto] gap-2 pt-1 pb-3 lg:pt-0">
          <div className="relative lg:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-9" placeholder="Título, artista, técnica…" aria-label="Buscar lotes" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={sort || 'relevance'} onValueChange={(v) => update({ ordem: v === 'relevance' ? '' : v })}>
            <SelectTrigger className="h-9! w-36 sm:w-44" aria-label="Ordenar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <ErrorState
          message={error}
          action={
            <Button variant="outline" onClick={load}>
              Tentar novamente
            </Button>
          }
        />
      ) : !data ? (
        <PageLoading />
      ) : data.lots.length === 0 ? (
        <EmptyState title={q ? 'Nenhum lote encontrado' : 'Nenhum lote nesta seção'}>
          {q ? 'Tente outros termos de busca.' : 'Volte mais tarde ou confira as outras abas.'}
        </EmptyState>
      ) : (
        grid.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {grid.map((lot) => (
              <LotCard key={lot.id} lot={lot} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
