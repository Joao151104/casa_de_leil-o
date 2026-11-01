import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Tone = 'danger' | 'success' | 'warning' | 'info';
const TONES: Record<Tone, string> = {
  danger: 'border-l-destructive [&_[data-slot=alert-title]]:text-destructive',
  success: 'border-l-success [&_[data-slot=alert-title]]:text-success',
  warning: 'border-l-signal [&_[data-slot=alert-title]]:text-signal',
  info: 'border-l-foreground',
};

/** Alert do shadcn no estilo do catálogo: fundo neutro e uma régua lateral na cor do status. */
export function Notice({ tone, title, children, className }: { tone: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <Alert className={cn('rounded-none border-0 border-l-2 bg-muted px-4 py-3', TONES[tone], className)}>
      {title && <AlertTitle className="font-semibold">{title}</AlertTitle>}
      {children && <AlertDescription className="text-foreground/80">{children}</AlertDescription>}
    </Alert>
  );
}

export function PageLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-10 w-80 max-w-full" />
      <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-[4/5] rounded-none" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md border-t-2 border-foreground py-10">
      <p className="label-mono text-destructive">Erro</p>
      <p className="mt-2 text-lg">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-y py-16 text-center">
      <p className="font-display text-xl">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

/** Título de página: display expandido + linha de apoio opcional. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
