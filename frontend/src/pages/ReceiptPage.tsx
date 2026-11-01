import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Wordmark } from '@/components/app/Layout';
import { ErrorState, PageLoading } from '@/components/app/feedback';
import { LotImage } from '@/components/app/lot-bits';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatBRL, formatDateTime, lotNumber } from '@/lib/format';
import { shareReceipt } from '@/lib/share';
import type { Lot, Receipt } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ReceiptResponse {
  receipt: Receipt & { lotId: string; signatureValid: boolean };
  lot: Lot;
  publicKey: string;
}

export function ReceiptPage() {
  const { code = '' } = useParams();
  const [data, setData] = useState<ReceiptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ReceiptResponse>(`/receipts/${code}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [code]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <PageLoading />;
  const { receipt, lot } = data;

  const rows: Array<[string, ReactNode]> = [
    ['Lote', lotNumber(lot.number)],
    ['Obra', <span className="font-sans">{lot.title}</span>],
    ['Artista', <span className="font-sans">{lot.attributes.artist ?? '—'}</span>],
    ['Leiloeiro', <span className="font-sans">{lot.seller.name}</span>],
    ['Arrematante', receipt.winnerTag],
    ['Lances no leilão', receipt.bidCount],
    ['Emitido em', formatDateTime(receipt.issuedAt)],
    ['Hash final', <span className="text-xs break-all">{receipt.finalHash}</span>],
  ];

  const share = async () => {
    if (await shareReceipt(receipt.code)) toast.success('Link do comprovante copiado');
  };

  return (
    <div className="mx-auto max-w-3xl">
      <article className="border-2 border-foreground">
        <header className="flex items-center justify-between border-b-2 border-foreground px-6 py-4">
          <Wordmark />
          <span className="label-mono">Comprovante de arremate</span>
        </header>

        <div className="grid sm:grid-cols-[1fr_14rem]">
          <div className="p-6">
            <p className="label-mono text-muted-foreground">Valor do arremate</p>
            <p className="mt-1 font-mono text-4xl font-medium tabular-nums sm:text-5xl">{formatBRL(receipt.amountCents)}</p>
            <p className="label-mono mt-6 text-muted-foreground">Código</p>
            <p className="font-mono text-xl tracking-widest">{receipt.code}</p>
          </div>
          <div className="border-t-2 border-foreground bg-muted sm:border-t-0 sm:border-l-2">
            <LotImage src={lot.imageUrl} alt={lot.title} className="aspect-square size-full" />
          </div>
        </div>

        <dl className="border-t-2 border-foreground font-mono text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 border-b px-6 py-2.5 last:border-b-0 sm:grid-cols-[11rem_1fr]">
              <dt className="label-mono pt-0.5 text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        <footer
          className={cn(
            'border-t-2 border-foreground px-6 py-3 font-mono text-xs',
            receipt.signatureValid ? 'bg-success text-success-foreground' : 'bg-destructive text-white',
          )}
        >
          {receipt.signatureValid
            ? 'ASSINATURA ED25519 VÁLIDA · Arrematante identificado por pseudônimo, sem dados pessoais.'
            : 'ASSINATURA INVÁLIDA · Este comprovante foi alterado.'}
        </footer>
      </article>

      <div className="mt-6 flex flex-wrap gap-2 print:hidden">
        <Button size="lg" className="h-10" onClick={share}>
          Compartilhar link
        </Button>
        <Button variant="outline" size="lg" className="h-10" onClick={() => window.print()}>
          Imprimir
        </Button>
        <Button variant="ghost" size="lg" className="h-10" asChild>
          <Link to={`/lotes/${lot.id}/auditoria`}>Auditar histórico</Link>
        </Button>
      </div>
    </div>
  );
}
