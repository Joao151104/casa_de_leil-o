import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatCountdown, lotNumber } from '@/lib/format';
import { currentPhase, useNow } from '@/lib/time';
import type { Lot, Phase } from '@/lib/types';
import { cn } from '@/lib/utils';

const PHASES: Record<Phase, { label: string; className: string }> = {
  live: { label: 'Ao vivo', className: 'text-signal' },
  scheduled: { label: 'Agendado', className: 'text-muted-foreground' },
  ended: { label: 'Encerrado', className: 'text-muted-foreground' },
  cancelled: { label: 'Cancelado', className: 'text-muted-foreground line-through' },
};

/** Status do lote como rótulo de catálogo (texto mono), não como pílula. */
export function PhaseLabel({ phase, className }: { phase: Phase; className?: string }) {
  const p = PHASES[phase];
  return (
    <span className={cn('label-mono inline-flex items-center gap-1.5', p.className, className)}>
      {phase === 'live' && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-signal" />
        </span>
      )}
      {p.label}
    </span>
  );
}

export function LotNumber({ lot, className }: { lot: Pick<Lot, 'number'>; className?: string }) {
  return <span className={cn('label-mono text-muted-foreground', className)}>Lote {lotNumber(lot.number)}</span>;
}

/** Contagem regressiva até o início (agendado) ou o fim (ao vivo). */
export function Countdown({ lot, className }: { lot: Lot; className?: string }) {
  const now = useNow();
  const phase = currentPhase(lot, now);
  if (phase === 'cancelled') return <span className={cn('font-mono text-muted-foreground', className)}>—</span>;
  if (phase === 'ended') return <span className={cn('font-mono text-muted-foreground', className)}>Encerrado</span>;
  const remaining = new Date(phase === 'scheduled' ? lot.startsAt : lot.endsAt).getTime() - now;
  const urgent = phase === 'live' && remaining < 2 * 60 * 1000;
  return <span className={cn('font-mono tabular-nums', urgent && 'text-signal', className)}>{formatCountdown(remaining)}</span>;
}

export function LotImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div className={cn('flex items-center justify-center bg-muted', className)}>
        <span className="label-mono text-muted-foreground">Sem imagem</span>
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn('object-cover', className)} />;
}

/**
 * Moldura de proporção fixa com a obra INTEIRA dentro (object-contain), sobre fundo neutro,
 * como numa parede de galeria. Obras têm formatos variados: recortar (object-cover) cortaria
 * bordas, assinaturas e molduras. A área da imagem é posicionada de forma absoluta (`inset`):
 * percentuais de altura dentro de caixas com aspect-ratio não são confiáveis no Safari.
 */
export function ArtworkFrame({
  src,
  alt,
  className,
  inset = 'inset-4',
  imgClassName,
}: {
  src: string | null;
  alt: string;
  className?: string;
  /** Margem entre a moldura e a obra, como classe `inset-*` do Tailwind. */
  inset?: string;
  imgClassName?: string;
}) {
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      <div className={cn('absolute', inset)}>
        <LotImage
          src={src}
          alt={alt}
          className={cn('size-full object-contain! drop-shadow-[0_14px_18px_rgb(0_0_0/0.22)]', imgClassName)}
        />
      </div>
    </div>
  );
}

/** Campo monetário: Input do shadcn com prefixo "R$" e números em mono. */
export function MoneyField({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm text-muted-foreground">R$</span>
      <Input inputMode="decimal" className={cn('h-10 pl-10 font-mono tabular-nums', className)} {...props} />
    </div>
  );
}

/** Rótulo + valor em mono (preços, saldos). */
export function Figure({ label, value, className, valueClassName }: { label: string; value: React.ReactNode; className?: string; valueClassName?: string }) {
  return (
    <div className={className}>
      <p className="label-mono text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-mono text-2xl font-medium tabular-nums', valueClassName)}>{value}</p>
    </div>
  );
}
