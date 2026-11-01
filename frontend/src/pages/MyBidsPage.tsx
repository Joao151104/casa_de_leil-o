import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, PageHeader, PageLoading } from '@/components/app/feedback';
import { LotImage, LotNumber, PhaseLabel } from '@/components/app/lot-bits';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatBRL, formatDateTime } from '@/lib/format';
import { shareReceipt } from '@/lib/share';
import { getSocket } from '@/lib/socket';
import type { Lot } from '@/lib/types';
import { cn } from '@/lib/utils';

type Outcome = 'winning' | 'outbid' | 'won' | 'won_pending' | 'lost' | 'cancelled';
interface Item {
  lot: Lot;
  myMaxBidCents: number;
  myBidCount: number;
  lastBidAt: string;
  outcome: Outcome;
  receiptCode: string | null;
}

const OUTCOME: Record<Outcome, { label: string; className: string }> = {
  winning: { label: 'Ganhando', className: 'text-success' },
  outbid: { label: 'Superado', className: 'text-destructive' },
  won: { label: 'Arrematado', className: 'text-success' },
  won_pending: { label: 'Arrematado · liquidando', className: 'text-success' },
  lost: { label: 'Não venceu', className: 'text-muted-foreground' },
  cancelled: { label: 'Cancelado · estornado', className: 'text-muted-foreground' },
};

const TABS = [
  { key: 'active', label: 'Em andamento', match: (o: Outcome) => o === 'winning' || o === 'outbid' },
  { key: 'won', label: 'Arrematados', match: (o: Outcome) => o === 'won' || o === 'won_pending' },
  { key: 'closed', label: 'Encerrados', match: (o: Outcome) => o === 'lost' || o === 'cancelled' },
];

export function MyBidsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('active');

  const load = useCallback(
    () =>
      api<{ items: Item[] }>('/me/bids')
        .then((d) => setItems(d.items))
        .catch((e) => setError(e.message)),
    [],
  );

  useEffect(() => {
    load();
    // Superado, arrematado ou estornado: a carteira muda → recarrega a lista.
    const socket = getSocket();
    socket.on('wallet:changed', load);
    return () => {
      socket.off('wallet:changed', load);
    };
  }, [load]);

  if (error) return <ErrorState message={error} />;
  if (!items) return <PageLoading />;

  const current = TABS.find((t) => t.key === tab)!;
  const visible = items.filter((i) => current.match(i.outcome));

  const share = async (code: string) => {
    if (await shareReceipt(code)) toast.success('Link do comprovante copiado');
  };

  return (
    <div>
      <PageHeader title="Meus arremates" description="Os lotes em que você deu lance e os que você venceu." />

      <Tabs value={tab} onValueChange={setTab} className="mb-2 border-b">
        <TabsList variant="line" className="h-11! gap-6 p-0">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="flex-none gap-2 px-0 text-base after:bottom-[-1px]!">
              {t.label}
              <span className="font-mono text-xs text-muted-foreground">{items.filter((i) => t.match(i.outcome)).length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {visible.length === 0 ? (
        <EmptyState title="Nada por aqui">
          <Link to="/" className="text-foreground underline underline-offset-4">
            Veja os leilões
          </Link>{' '}
          e dê seu primeiro lance.
        </EmptyState>
      ) : (
        <ul>
          {visible.map((item) => (
            <li key={item.lot.id} className="grid gap-4 border-b py-5 sm:grid-cols-[6rem_1fr_auto] sm:items-center">
              <Link to={`/lotes/${item.lot.id}`} className="bg-muted">
                <LotImage src={item.lot.imageUrl} alt={item.lot.title} className="aspect-[4/5] w-full" />
              </Link>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <LotNumber lot={item.lot} />
                  <PhaseLabel phase={item.lot.phase} />
                  <span className={cn('label-mono font-semibold', OUTCOME[item.outcome].className)}>{OUTCOME[item.outcome].label}</span>
                </div>
                <Link to={`/lotes/${item.lot.id}`} className="mt-1 line-clamp-1 text-lg font-medium hover:underline">
                  {item.lot.title}
                </Link>
                <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-1 font-mono text-sm">
                  <div>
                    <dt className="label-mono inline text-muted-foreground">Seu maior lance </dt>
                    <dd className="inline tabular-nums">{formatBRL(item.myMaxBidCents)}</dd>
                  </div>
                  <div>
                    <dt className="label-mono inline text-muted-foreground">Lance atual </dt>
                    <dd className="inline tabular-nums">{formatBRL(item.lot.currentPriceCents)}</dd>
                  </div>
                  <div className="text-muted-foreground">
                    {item.myBidCount} lance{item.myBidCount > 1 ? 's' : ''} · {formatDateTime(item.lastBidAt)}
                  </div>
                </dl>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {item.receiptCode && (
                  <>
                    <Button asChild>
                      <Link to={`/comprovante/${item.receiptCode}`}>Comprovante</Link>
                    </Button>
                    <Button variant="outline" onClick={() => share(item.receiptCode!)}>
                      Compartilhar
                    </Button>
                  </>
                )}
                {(item.outcome === 'winning' || item.outcome === 'outbid') && (
                  <Button className={cn(item.outcome === 'outbid' && 'bg-signal text-signal-foreground hover:bg-signal/90')} asChild>
                    <Link to={`/lotes/${item.lot.id}`}>{item.outcome === 'outbid' ? 'Cobrir lance' : 'Ir para a sala'}</Link>
                  </Button>
                )}
                <Button variant="ghost" asChild>
                  <Link to={`/lotes/${item.lot.id}/auditoria`}>Auditoria</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
