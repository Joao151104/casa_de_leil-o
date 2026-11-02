import { Loader2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Notice } from '@/components/app/feedback';
import { MoneyField } from '@/components/app/lot-bits';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useWallet } from '@/context/WalletContext';
import { ApiError, api } from '@/lib/api';
import { centsToInput, formatBRL, parseBRL } from '@/lib/format';
import type { Lot } from '@/lib/types';

interface BidFormProps {
  lot: Lot;
  /** Chamado após um lance aceito, ou recusado por estar abaixo de um mínimo que mudou. */
  onStale: () => void;
}

export function BidForm({ lot, onStale }: BidFormProps) {
  const { wallet } = useWallet();
  const [amount, setAmount] = useState('');
  const [bidError, setBidError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sugere sempre o lance mínimo atual enquanto o usuário não digitou um valor maior.
  const minimum = lot.minimumBidCents;
  useEffect(() => {
    setAmount((current) => {
      const typed = parseBRL(current);
      return typed !== null && typed >= minimum ? current : centsToInput(minimum);
    });
  }, [minimum]);

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
      const res = await api<{ lot: Lot; extended: boolean }>(`/lots/${lot.id}/bids`, { body: { amountCents: cents } });
      toast.success(`Lance de ${formatBRL(cents)} aceito`, {
        description: res.extended ? 'O lote foi prorrogado por 2 minutos (anti-sniping).' : 'Você está ganhando.',
      });
      onStale();
    } catch (err) {
      setBidError(err as ApiError);
      if (err instanceof ApiError && err.code === 'BELOW_MINIMUM') onStale();
    } finally {
      setSubmitting(false);
    }
  };

  const base = lot.bidCount ? lot.currentPriceCents! : lot.startingPriceCents - lot.minIncrementCents;
  const quickBids = [1, 2, 5].map((n) => base + n * lot.minIncrementCents);

  return (
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
        <Button
          type="submit"
          size="lg"
          className="h-12 bg-signal px-6 text-base text-signal-foreground hover:bg-signal/90"
          disabled={submitting}
        >
          {submitting && <Loader2 className="animate-spin" />} Dar lance
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {quickBids.map((value) => (
          <Button
            key={value}
            type="button"
            variant="outline"
            size="sm"
            className="font-mono text-xs"
            onClick={() => setAmount(centsToInput(value))}
          >
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
  );
}
