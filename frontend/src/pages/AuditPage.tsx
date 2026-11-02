import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, PageLoading } from '@/components/app/feedback';
import { LotImage, LotNumber, PhaseLabel } from '@/components/app/lot-bits';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useApi } from '@/hooks/useApi';
import { formatBRL, formatDateTime, lotNumber, shortHash } from '@/lib/format';
import { verifyInBrowser, type ClientVerification } from '@/lib/ledger';
import type { AuditBid, AuditIssue, Lot, Receipt } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AuditResponse {
  lot: Lot;
  head: { bidCount: number; headHash: string; headSignature: string | null };
  bids: AuditBid[];
  receipt: Receipt | null;
  publicKey: string;
  verification: { intact: boolean; issues: AuditIssue[]; verifiedAt: string };
}

const Mark = ({ ok, label }: { ok: boolean; label: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        className={cn('font-mono text-xs', ok ? 'text-success' : 'font-bold text-destructive')}
        aria-label={`${label}: ${ok ? 'ok' : 'falhou'}`}
      >
        {ok ? 'OK' : 'FALHA'}
      </span>
    </TooltipTrigger>
    <TooltipContent>
      {label}: {ok ? 'confere' : 'não confere'}
    </TooltipContent>
  </Tooltip>
);

export function AuditPage() {
  const { id = '' } = useParams();
  const { data, error } = useApi<AuditResponse>(`/audit/lots/${id}`);
  const [client, setClient] = useState<ClientVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  if (error) return <ErrorState message={error} />;
  if (!data) return <PageLoading />;

  const runClientCheck = () => {
    setVerifying(true);
    // setTimeout para o spinner aparecer antes do cálculo síncrono.
    setTimeout(() => {
      setClient(
        verifyInBrowser({
          lotId: data.lot.id,
          bids: data.bids,
          head: data.head,
          receipt: data.receipt,
          publicKey: data.publicKey,
        }),
      );
      setVerifying(false);
    }, 50);
  };

  const { lot, verification } = data;
  const checkBySeq = new Map(client?.bids.map((b) => [b.seq, b]));

  return (
    <div>
      <nav className="label-mono mb-6 flex items-center gap-2 text-muted-foreground" aria-label="Navegação">
        <Link to="/" className="hover:text-foreground">
          Leilões
        </Link>
        <span>/</span>
        <Link to={`/lotes/${lot.id}`} className="hover:text-foreground">
          Lote {lotNumber(lot.number)}
        </Link>
        <span>/</span>
        <span className="text-foreground">Auditoria</span>
      </nav>

      <div className="flex items-start gap-5 border-b pb-6">
        <LotImage src={lot.imageUrl} alt={lot.title} className="size-20 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <LotNumber lot={lot} />
            <PhaseLabel phase={lot.phase} />
          </div>
          <h1 className="mt-1 line-clamp-2 font-display text-2xl sm:text-3xl">{lot.title}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {lot.bidCount} lances · inicial {formatBRL(lot.startingPriceCents)} · incremento{' '}
            {formatBRL(lot.minIncrementCents)}
          </p>
        </div>
      </div>

      {/* Veredito */}
      <section className="grid gap-6 border-b py-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <p className="label-mono text-muted-foreground">Veredito da auditoria</p>
          <p
            className={cn(
              'mt-2 font-display text-5xl uppercase sm:text-7xl',
              verification.intact ? 'text-success' : 'text-destructive',
            )}
          >
            {verification.intact ? 'Íntegro' : 'Adulterado'}
          </p>
          <p className="mt-4 max-w-2xl">
            {verification.intact
              ? 'Todos os lances conferem: hashes, encadeamento, assinaturas digitais e regras de lance.'
              : `${verification.issues.length} inconsistência(s) encontrada(s). O histórico foi alterado fora do sistema.`}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Verificado pelo servidor em {formatDateTime(verification.verifiedAt)}
          </p>
        </div>
        <div className="flex flex-col justify-end gap-3 lg:col-span-4">
          <p className="text-sm text-muted-foreground">
            Não precisa confiar no servidor: refaça os cálculos no seu navegador com a chave pública.
          </p>
          <Button variant="outline" size="lg" className="h-11" onClick={runClientCheck} disabled={verifying}>
            {verifying && <Loader2 className="animate-spin" />} Verificar no meu navegador
          </Button>
          {client && (
            <p role="status" className={cn('font-mono text-sm', client.intact ? 'text-success' : 'text-destructive')}>
              {client.intact
                ? `${client.bids.length} lances recalculados (SHA-256 + Ed25519). Resultado: íntegro.`
                : `Divergência encontrada${!client.headOk ? ' · estado final não confere' : ''}${client.receiptOk === false ? ' · comprovante não confere' : ''}.`}
            </p>
          )}
        </div>
      </section>

      {verification.issues.length > 0 && (
        <section className="border-b py-8">
          <h2 className="font-display text-lg text-destructive">Inconsistências</h2>
          <ol className="mt-3">
            {verification.issues.map((issue, i) => (
              <li key={i} className="grid grid-cols-[5rem_1fr] gap-4 border-t py-2.5 text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {issue.seq !== undefined ? `Lance ${String(issue.seq).padStart(2, '0')}` : 'Lote'}
                </span>
                <span>{issue.message}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Histórico */}
      <section className="py-10">
        <h2 className="border-b pb-2 font-display text-lg">Histórico completo · {data.bids.length}</h2>
        {data.bids.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Este lote não recebeu lances.</p>
        ) : (
          <Table className="min-w-[760px] font-mono text-xs">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="label-mono pl-0">Nº</TableHead>
                <TableHead className="label-mono">Licitante</TableHead>
                <TableHead className="label-mono text-right">Valor</TableHead>
                <TableHead className="label-mono">Horário</TableHead>
                <TableHead className="label-mono">Hash anterior → hash</TableHead>
                {client && <TableHead className="label-mono pr-0">Hash · Cadeia · Assin.</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.bids.map((bid) => {
                const check = checkBySeq.get(bid.seq);
                return (
                  <TableRow key={bid.seq}>
                    <TableCell className="pl-0 text-muted-foreground">{String(bid.seq).padStart(2, '0')}</TableCell>
                    <TableCell>{bid.bidderTag}</TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {formatBRL(bid.amountCents)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(bid.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            {shortHash(bid.prevHash)} → <span className="text-foreground">{shortHash(bid.hash)}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md font-mono break-all">{bid.hash}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    {client && (
                      <TableCell className="pr-0">
                        {check && (
                          <span className="flex gap-3">
                            <Mark ok={check.hashOk} label="Hash" />
                            <Mark ok={check.chainOk} label="Encadeamento" />
                            <Mark ok={check.signatureOk} label="Assinatura" />
                          </span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {data.receipt && (
          <p className="mt-6 text-sm">
            Arrematado por <span className="font-mono">{data.receipt.winnerTag}</span> em{' '}
            <span className="font-mono">{formatBRL(data.receipt.amountCents)}</span> ·{' '}
            <Link to={`/comprovante/${data.receipt.code}`} className="underline underline-offset-4">
              comprovante {data.receipt.code}
            </Link>
          </p>
        )}
      </section>

      {/* Como funciona */}
      <section className="grid gap-8 border-t pt-10 lg:grid-cols-12">
        <h2 className="font-display text-lg lg:col-span-3">Como funciona a prova de adulteração</h2>
        <div className="grid gap-6 text-sm leading-relaxed text-muted-foreground sm:grid-cols-3 lg:col-span-9">
          <div>
            <p className="label-mono mb-2 text-foreground">01 · Cadeia de hashes</p>
            <p>
              Cada lance vira{' '}
              <code className="font-mono text-xs break-all text-foreground">
                bid-v1|lote|nº|licitante|valor|horário|hash_anterior
              </code>
              . O SHA-256 dessa linha inclui o hash do lance anterior: mexer em um lance quebra todos os seguintes.
            </p>
          </div>
          <div>
            <p className="label-mono mb-2 text-foreground">02 · Assinatura Ed25519</p>
            <p>
              Cada hash é assinado por uma chave privada que fica fora do banco. Quem altera o banco não consegue
              refazer as assinaturas. O estado final do lote também é assinado, o que detecta remoções no fim.
            </p>
          </div>
          <div>
            <p className="label-mono mb-2 text-foreground">03 · Pseudônimos</p>
            <p>
              Licitantes aparecem por um HMAC de usuário + lote: não revela nome nem e-mail e não permite cruzar
              participações entre lotes.
            </p>
          </div>
          <p className="font-mono text-xs break-all sm:col-span-3">
            <span className="text-foreground">Chave pública Ed25519 </span>
            {data.publicKey}
          </p>
        </div>
      </section>
    </div>
  );
}
