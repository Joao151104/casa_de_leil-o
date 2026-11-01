import { Loader2, MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, Notice, PageHeader, PageLoading } from '@/components/app/feedback';
import { Countdown, Figure, LotImage, PhaseLabel } from '@/components/app/lot-bits';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError, api } from '@/lib/api';
import { formatBRL, formatDateTime, lotNumber } from '@/lib/format';
import { getSocket } from '@/lib/socket';
import { currentPhase, useNow } from '@/lib/time';
import type { Lot } from '@/lib/types';

type DashboardLot = Lot & { receiptCode: string | null };
interface Dashboard {
  lots: DashboardLot[];
  summary: { totalReceivedCents: number; balanceCents: number; sold: number; unsold: number; live: number; scheduled: number; cancelled: number };
}

function LotResult({ lot }: { lot: DashboardLot }) {
  if (lot.phase === 'cancelled') return <span className="text-muted-foreground">Cancelado</span>;
  if (lot.settled) {
    return lot.sold ? (
      <span className="text-success">
        {formatBRL(lot.currentPriceCents)} <span className="text-xs">· {lot.leaderTag}</span>
      </span>
    ) : (
      <span className="text-muted-foreground">Sem lances</span>
    );
  }
  return lot.bidCount ? <span>{formatBRL(lot.currentPriceCents)}</span> : <span className="text-muted-foreground">{formatBRL(lot.startingPriceCents)} (inicial)</span>;
}

export function DashboardPage() {
  const now = useNow();
  const navigate = useNavigate();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Lot | null>(null);
  const [reason, setReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api<Dashboard>('/me/lots')
        .then(setData)
        .catch((e) => setError(e.message)),
    [],
  );

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.emit('showcase:watch');
    socket.on('showcase:update', load);
    socket.on('notification', load);
    return () => {
      socket.emit('showcase:unwatch');
      socket.off('showcase:update', load);
      socket.off('notification', load);
    };
  }, [load]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <PageLoading />;

  const confirmCancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    setCancelError(null);
    try {
      await api(`/lots/${cancelling.id}/cancel`, { body: { reason, confirmRefund: cancelling.bidCount > 0 } });
      toast.success(cancelling.bidCount > 0 ? 'Lote cancelado e licitantes estornados' : 'Lote cancelado');
      setCancelling(null);
      setReason('');
      load();
    } catch (err) {
      setCancelError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const s = data.summary;
  const stats = [
    { label: 'Ao vivo', value: s.live },
    { label: 'Agendados', value: s.scheduled },
    { label: 'Arrematados', value: s.sold },
    { label: 'Sem lances', value: s.unsold },
    { label: 'Cancelados', value: s.cancelled },
  ];

  return (
    <div>
      <PageHeader
        title="Painel do leiloeiro"
        description="Seus lotes, o resultado de cada um e o total recebido."
        actions={
          <Button size="lg" className="h-10 px-5" asChild>
            <Link to="/painel/novo-lote">Novo lote</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 border-y sm:grid-cols-3 lg:grid-cols-6">
        <Figure label="Total recebido" value={formatBRL(s.totalReceivedCents)} className="col-span-2 py-5 sm:col-span-1 sm:pr-6" valueClassName="text-signal" />
        {stats.map((st) => (
          <Figure key={st.label} label={st.label} value={st.value} className="border-t py-5 pl-0 sm:border-t-0 sm:border-l sm:pl-6 max-sm:even:pl-0 max-sm:odd:border-l max-sm:odd:pl-4" />
        ))}
      </div>

      {data.lots.length === 0 ? (
        <div className="mt-10">
          <EmptyState title="Você ainda não criou lotes">
            <Link to="/painel/novo-lote" className="text-foreground underline underline-offset-4">
              Crie o primeiro lote
            </Link>{' '}
            a partir de uma obra do acervo.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-10">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="label-mono pl-0">Lote</TableHead>
                <TableHead className="label-mono">Obra</TableHead>
                <TableHead className="label-mono">Status</TableHead>
                <TableHead className="label-mono text-right">Lances</TableHead>
                <TableHead className="label-mono text-right">Preço / resultado</TableHead>
                <TableHead className="label-mono text-right">Encerramento</TableHead>
                <TableHead className="w-10 pr-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.lots.map((lot) => {
                const phase = currentPhase(lot, now);
                const cancellable = phase === 'live' || phase === 'scheduled';
                return (
                  <TableRow key={lot.id} className="cursor-pointer" onClick={() => navigate(`/lotes/${lot.id}`)}>
                    <TableCell className="pl-0 font-mono text-xs text-muted-foreground">{lotNumber(lot.number)}</TableCell>
                    <TableCell className="max-w-0 w-full">
                      <div className="flex items-center gap-3">
                        <LotImage src={lot.imageUrl} alt="" className="size-11 shrink-0" />
                        <span className="truncate font-medium">{lot.title}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PhaseLabel phase={phase} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{lot.bidCount}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      <LotResult lot={lot} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {phase === 'live' ? <Countdown lot={lot} className="text-sm" /> : <span className="text-muted-foreground">{formatDateTime(lot.endsAt)}</span>}
                    </TableCell>
                    <TableCell className="pr-0" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Ações do lote ${lotNumber(lot.number)}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => navigate(`/lotes/${lot.id}`)}>Abrir sala do lote</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => navigate(`/lotes/${lot.id}/auditoria`)}>Auditoria</DropdownMenuItem>
                          {lot.receiptCode && <DropdownMenuItem onSelect={() => navigate(`/comprovante/${lot.receiptCode}`)}>Comprovante</DropdownMenuItem>}
                          {cancellable && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => {
                                  setCancelError(null);
                                  setCancelling(lot);
                                }}
                              >
                                Cancelar lote
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={Boolean(cancelling)} onOpenChange={(open) => !open && !busy && setCancelling(null)}>
        <AlertDialogContent>
          {cancelling && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancelar o lote {lotNumber(cancelling.number)}?</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="text-foreground">{cancelling.title}</span> sai da vitrine e não aceitará mais lances.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {cancelling.bidCount > 0 && (
                <Notice tone="warning" title={`Este lote já tem ${cancelling.bidCount} lance(s)`}>
                  O valor comprometido do licitante líder volta automaticamente para o saldo disponível dele.
                </Notice>
              )}
              <div className="space-y-2">
                <Label htmlFor="reason">Motivo (opcional)</Label>
                <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ex.: peça retirada pelo consignante" />
              </div>
              {cancelError && <Notice tone="danger">{cancelError}</Notice>}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
                {/* Botão comum (e não AlertDialogAction) para o diálogo só fechar após a API confirmar. */}
                <Button variant="destructive" disabled={busy} onClick={confirmCancel}>
                  {busy && <Loader2 className="animate-spin" />}
                  {cancelling.bidCount > 0 ? 'Cancelar e estornar' : 'Cancelar lote'}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
