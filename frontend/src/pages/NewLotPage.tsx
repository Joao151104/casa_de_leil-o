import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, Notice, PageHeader } from '@/components/app/feedback';
import { ArtworkFrame, MoneyField } from '@/components/app/lot-bits';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatBRL, parseBRL } from '@/lib/format';
import type { CatalogItem, Lot } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SearchResult {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  source: 'live' | 'cache' | 'stale' | 'local';
  warning?: string;
}

const SUGGESTIONS = ['Van Gogh', 'Hokusai', 'Degas', 'Rembrandt', 'Samurai', 'Egyptian', 'Tiffany'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Date → valor de <input type="datetime-local"> no fuso local. */
const toLocalInput = (d: Date) => {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const DURATIONS = [
  { label: '5 min', ms: 5 * 60_000 },
  { label: '30 min', ms: 30 * 60_000 },
  { label: '1 hora', ms: 3_600_000 },
  { label: '1 dia', ms: 86_400_000 },
  { label: '7 dias', ms: 7 * 86_400_000 },
];

export function NewLotPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CatalogItem | null>(null);

  const [form, setForm] = useState(() => ({
    title: '',
    description: '',
    startingPrice: '1.000,00',
    increment: '100,00',
    startNow: true,
    startsAt: toLocalInput(new Date(Date.now() + 3_600_000)),
    endsAt: toLocalInput(new Date(Date.now() + 86_400_000)),
  }));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const search = async (q: string, page = 1) => {
    if (!q.trim()) return;
    setQuery(q);
    setSearching(true);
    setSearchError(null);
    try {
      setResult(await api<SearchResult>(`/catalog/search?${new URLSearchParams({ q, page: String(page) })}`));
    } catch (err) {
      setSearchError((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const select = (item: CatalogItem) => {
    setSelected(item);
    setForm((f) => ({ ...f, title: item.title }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setDuration = (ms: number) => {
    const start = form.startNow ? Date.now() : new Date(form.startsAt).getTime();
    setForm((f) => ({ ...f, endsAt: toLocalInput(new Date(start + ms)) }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const startingPriceCents = parseBRL(form.startingPrice);
    const minIncrementCents = parseBRL(form.increment);
    if (!startingPriceCents || !minIncrementCents)
      return setFormError('Informe valores válidos para o lance inicial e o incremento.');
    const startsAt = form.startNow ? new Date() : new Date(form.startsAt);
    const endsAt = new Date(form.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return setFormError('Datas inválidas.');
    if (endsAt <= startsAt) return setFormError('O encerramento precisa ser depois do início.');

    setSaving(true);
    setFormError(null);
    try {
      const { lot } = await api<{ lot: Lot }>('/lots', {
        body: {
          externalId: selected.externalId,
          title: form.title,
          description: form.description || undefined,
          startingPriceCents,
          minIncrementCents,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        },
      });
      toast.success('Lote publicado!');
      navigate(`/lotes/${lot.id}`);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const totalPages = result ? Math.min(50, Math.ceil(result.total / result.pageSize)) : 0;

  return (
    <div className="space-y-8">
      <nav className="label-mono -mb-2 flex items-center gap-2 text-muted-foreground" aria-label="Navegação">
        <Link to="/painel" className="hover:text-foreground">
          Painel
        </Link>
        <span>/</span>
        <span className="text-foreground">Novo lote</span>
      </nav>
      <PageHeader title="Novo lote" description="Escolha uma obra do acervo do Met e defina as condições do leilão." />

      {selected && (
        <section className="border-t-2 border-foreground pt-6">
          <p className="label-mono text-muted-foreground">Passo 2 · Condições do leilão</p>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            Imagem, título e atributos são copiados do acervo e ficam salvos no lote.
          </p>
          <form onSubmit={submit} className="grid gap-8 md:grid-cols-[260px_1fr]">
            <div>
              <ArtworkFrame src={selected.imageUrl} alt={selected.title} className="aspect-square" inset="inset-5" />
              <p className="mt-3 font-medium">{selected.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {[selected.artist, selected.date, selected.medium].filter(Boolean).join(' · ')}
              </p>
              <Button type="button" variant="ghost" size="sm" className="mt-1 -ml-2" onClick={() => setSelected(null)}>
                Trocar obra
              </Button>
            </div>
            <div className="space-y-4">
              {formError && <Notice tone="danger">{formError}</Notice>}
              <div className="space-y-2">
                <Label htmlFor="title">Título do lote</Label>
                <Input
                  id="title"
                  className="h-10"
                  value={form.title}
                  maxLength={200}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">
                  Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Textarea
                  id="description"
                  rows={3}
                  maxLength={2000}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="start">Lance inicial (valor mínimo)</Label>
                  <MoneyField
                    id="start"
                    value={form.startingPrice}
                    onChange={(e) => setForm({ ...form, startingPrice: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inc">Incremento mínimo</Label>
                  <MoneyField
                    id="inc"
                    value={form.increment}
                    onChange={(e) => setForm({ ...form, increment: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Início</Label>
                  <div className="flex h-10 items-center gap-2">
                    <Checkbox
                      id="start-now"
                      checked={form.startNow}
                      onCheckedChange={(v) => setForm({ ...form, startNow: v === true })}
                    />
                    <Label htmlFor="start-now" className="font-normal">
                      Começar agora
                    </Label>
                  </div>
                  {!form.startNow && (
                    <Input
                      type="datetime-local"
                      className="h-10"
                      value={form.startsAt}
                      onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                      aria-label="Data de início"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ends">Encerramento</Label>
                  <Input
                    id="ends"
                    type="datetime-local"
                    className="h-10"
                    value={form.endsAt}
                    onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {DURATIONS.map((d) => (
                      <Button key={d.label} type="button" variant="outline" size="xs" onClick={() => setDuration(d.ms)}>
                        +{d.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                Primeiro lance ≥ {formatBRL(parseBRL(form.startingPrice) ?? 0)}; os seguintes ≥ lance atual +{' '}
                {formatBRL(parseBRL(form.increment) ?? 0)}. Lances nos últimos 2 minutos prorrogam o fim em 2 minutos.
              </p>
              <div className="flex justify-end">
                <Button type="submit" size="lg" className="h-10" disabled={saving}>
                  {saving && <Loader2 className="animate-spin" />} Publicar lote
                </Button>
              </div>
            </div>
          </form>
        </section>
      )}

      <section className="space-y-4">
        <p className="label-mono text-muted-foreground">{selected ? 'Trocar obra' : 'Passo 1 · Buscar no acervo'}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            search(query);
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-9"
              aria-label="Buscar no acervo"
              placeholder="Busque por artista, obra, período… (em inglês funciona melhor)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button type="submit" size="lg" className="h-10" disabled={searching}>
            {searching && <Loader2 className="animate-spin" />} Buscar
          </Button>
        </form>
        {!result && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Button key={s} variant="outline" size="sm" onClick={() => search(s)}>
                {s}
              </Button>
            ))}
          </div>
        )}
        {searchError && <Notice tone="danger">{searchError}</Notice>}
        {result?.warning && <Notice tone="warning">{result.warning}</Notice>}
        {result && result.items.length === 0 && !searching && (
          <EmptyState
            title={result.total ? 'Nenhuma obra com imagem liberada nesta página' : 'Nenhuma obra encontrada'}
          >
            {result.total
              ? 'O museu só disponibiliza imagens de obras em domínio público. Tente a próxima página ou outro termo.'
              : 'Tente outro termo (o acervo do Met é catalogado em inglês).'}
          </EmptyState>
        )}
        {result && result.total > 0 && (
          <>
            <p className="font-mono text-xs text-muted-foreground">
              {result.total.toLocaleString('pt-BR')} resultados{result.source === 'cache' && ' · do cache'}
            </p>
            <div
              className={cn(
                'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6',
                searching && 'opacity-60',
              )}
            >
              {result.items.map((item) => {
                const isSelected = selected?.externalId === item.externalId;
                return (
                  <button
                    key={item.externalId}
                    type="button"
                    data-catalog-item
                    onClick={() => select(item)}
                    aria-pressed={isSelected}
                    className={cn(
                      'group flex h-full flex-col border bg-card text-left transition-colors hover:border-foreground focus-visible:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
                      isSelected && 'border-signal ring-1 ring-signal hover:border-signal',
                    )}
                  >
                    <ArtworkFrame
                      src={item.imageUrl}
                      alt={item.title}
                      className="aspect-square w-full border-b"
                      inset="inset-3"
                      imgClassName="transition duration-500 group-hover:scale-[1.03]"
                    />
                    <div className="flex flex-1 flex-col p-3">
                      <p className="line-clamp-2 text-sm leading-snug font-medium">{item.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {[item.artist, item.date].filter(Boolean).join(', ') || item.culture || item.department}
                      </p>
                      <p
                        className={cn(
                          'label-mono mt-auto pt-3',
                          isSelected ? 'text-signal' : 'text-muted-foreground group-hover:text-foreground',
                        )}
                      >
                        {isSelected ? 'Selecionada' : 'Selecionar'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="icon-lg"
                  disabled={result.page <= 1 || searching}
                  onClick={() => search(query, result.page - 1)}
                  aria-label="Página anterior"
                >
                  <ChevronLeft />
                </Button>
                <span className="font-mono text-xs text-muted-foreground">
                  {result.page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon-lg"
                  disabled={result.page >= totalPages || searching}
                  onClick={() => search(query, result.page + 1)}
                  aria-label="Próxima página"
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
