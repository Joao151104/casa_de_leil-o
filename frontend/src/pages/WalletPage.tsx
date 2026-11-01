import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Notice, PageHeader, PageLoading } from '@/components/app/feedback';
import { Figure, MoneyField, PhaseLabel } from '@/components/app/lot-bits';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWallet } from '@/context/WalletContext';
import { api } from '@/lib/api';
import { formatBRL, formatDateTime, parseBRL } from '@/lib/format';
import { cn } from '@/lib/utils';

const KIND_LABEL = { deposit: 'Depósito', purchase: 'Arremate', sale: 'Venda' };

export function WalletPage() {
  const { wallet, refresh } = useWallet();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!wallet) return <PageLoading />;

  const deposit = async (e: FormEvent, value = amount) => {
    e.preventDefault();
    const cents = parseBRL(value);
    if (cents === null || cents <= 0) return setError('Digite um valor válido, por exemplo 5.000,00.');
    setBusy(true);
    setError(null);
    try {
      await api('/wallet/deposit', { body: { amountCents: cents } });
      await refresh();
      setAmount('');
      toast.success(`Depósito de ${formatBRL(cents)} realizado`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Carteira" description="Saldo simulado. O valor do lote em que você lidera fica comprometido até ser superado ou liquidado." />

      <div className="grid border-y sm:grid-cols-3">
        <Figure label="Saldo total" value={formatBRL(wallet.balanceCents)} className="py-5 sm:pr-6" valueClassName="text-3xl" />
        <Figure label="Comprometido em lances" value={formatBRL(wallet.committedCents)} className="border-t py-5 sm:border-t-0 sm:border-l sm:px-6" valueClassName="text-3xl" />
        <Figure label="Disponível para lances" value={formatBRL(wallet.availableCents)} className="border-t py-5 sm:border-t-0 sm:border-l sm:pl-6" valueClassName="text-3xl text-signal" />
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-12">
        <div className="space-y-12 lg:col-span-5">
          <section>
            <h2 className="border-b pb-2 font-display text-lg">Depósito simulado</h2>
            <form onSubmit={deposit} className="mt-4 space-y-3">
              {error && <Notice tone="danger">{error}</Notice>}
              <div className="flex gap-2">
                <div className="flex-1">
                  <MoneyField placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Valor do depósito" />
                </div>
                <Button type="submit" size="lg" className="h-10" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />} Depositar
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['1.000,00', '5.000,00', '10.000,00', '50.000,00'].map((v) => (
                  <Button key={v} type="button" variant="outline" size="sm" className="font-mono text-xs" disabled={busy} onClick={(e) => deposit(e, v)}>
                    +{v}
                  </Button>
                ))}
              </div>
            </form>
          </section>

          <section>
            <h2 className="border-b pb-2 font-display text-lg">Comprometido</h2>
            {wallet.commitments.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Você não lidera nenhum lote no momento.</p>
            ) : (
              <ul>
                {wallet.commitments.map((c) => (
                  <li key={c.lotId} className="flex items-center justify-between gap-4 border-b py-3">
                    <div className="min-w-0">
                      <Link to={`/lotes/${c.lotId}`} className="line-clamp-1 hover:underline">
                        {c.title}
                      </Link>
                      <PhaseLabel phase={c.phase} />
                    </div>
                    <span className="font-mono tabular-nums">{formatBRL(c.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="lg:col-span-7">
          <h2 className="border-b pb-2 font-display text-lg">Extrato</h2>
          {wallet.transactions.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nenhuma movimentação ainda. Faça um depósito para começar a dar lances.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="label-mono pl-0">Data</TableHead>
                  <TableHead className="label-mono">Movimento</TableHead>
                  <TableHead className="label-mono pr-0 text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallet.transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="pl-0 font-mono text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</TableCell>
                    <TableCell className="max-w-0 w-full">
                      <span className="font-medium">{KIND_LABEL[t.kind]}</span>
                      {t.lotTitle && <span className="block truncate text-xs text-muted-foreground">{t.lotTitle}</span>}
                    </TableCell>
                    <TableCell className={cn('pr-0 text-right font-mono tabular-nums', t.amountCents > 0 && 'text-success')}>
                      {t.amountCents > 0 ? '+' : '−'}
                      {formatBRL(Math.abs(t.amountCents))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </div>
  );
}
