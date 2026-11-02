import { Loader2 } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Notice } from '@/components/app/feedback';
import { LotImage } from '@/components/app/lot-bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { lotNumber } from '@/lib/format';
import type { Lot, Role, User } from '@/lib/types';
import { cn } from '@/lib/utils';

const homeFor = (user: User) => (user.role === 'auctioneer' ? '/painel' : '/');

/** Tela dividida: à esquerda, uma obra que está em leilão agora. */
function AuthShell({ children }: { children: ReactNode }) {
  const [lot, setLot] = useState<Lot | null>(null);
  useEffect(() => {
    // Cancela ao sair da tela (ex.: login concluído antes da resposta chegar).
    const controller = new AbortController();
    api<{ lots: Lot[] }>('/lots?phase=live', { signal: controller.signal })
      .then((d) => setLot(d.lots.find((l) => l.imageUrl) ?? null))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <div className="-my-10 grid min-h-[calc(100dvh-3.5rem-5rem)] lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-muted lg:block">
        {lot && (
          <>
            {/* Obra inteira sobre a "parede", sem ampliar a imagem (as do Met têm resolução média). */}
            <div className="absolute inset-x-0 top-0 bottom-24 flex items-center justify-center p-12">
              <LotImage
                src={lot.imageUrl}
                alt={lot.title}
                className="max-h-full max-w-full object-contain! shadow-[0_24px_48px_-24px_rgb(0_0_0/0.45)]"
              />
            </div>
            <Link
              to={`/lotes/${lot.id}`}
              className="absolute inset-x-0 bottom-0 bg-background/90 px-6 py-4 backdrop-blur hover:bg-background"
            >
              <p className="label-mono text-signal">Em leilão agora · Lote {lotNumber(lot.number)}</p>
              <p className="mt-1 line-clamp-1 font-medium">{lot.title}</p>
              <p className="text-sm text-muted-foreground">{lot.attributes.artist}</p>
            </Link>
          </>
        )}
      </div>
      <div className="flex items-center justify-center py-12 lg:px-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      navigate(from ?? homeFor(user), { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="font-display text-3xl">Entrar</h1>
      <p className="mt-2 text-muted-foreground">Para dar lances ou gerenciar seus lotes.</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            className="h-10"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            className="h-10"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" size="lg" className="h-10 w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Entrar
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        Não tem conta?{' '}
        <Link to="/cadastro" className="text-foreground underline underline-offset-4">
          Cadastre-se
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'bidder' as Role });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await register(form);
      navigate(user.role === 'bidder' ? '/carteira' : '/painel', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const roles = [
    { value: 'bidder' as const, title: 'Licitante', text: 'Deposito saldo e dou lances.' },
    { value: 'auctioneer' as const, title: 'Leiloeiro', text: 'Crio e gerencio lotes.' },
  ];

  return (
    <AuthShell>
      <h1 className="font-display text-3xl">Criar conta</h1>
      <p className="mt-2 text-muted-foreground">Escolha como você vai participar.</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        {error && <Notice tone="danger">{error}</Notice>}
        <fieldset>
          <legend className="sr-only">Tipo de conta</legend>
          <div className="grid grid-cols-2 border">
            {roles.map((r, i) => (
              <label
                key={r.value}
                className={cn(
                  'cursor-pointer p-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring',
                  i > 0 && 'border-l',
                  form.role === r.value ? 'bg-foreground text-background' : 'hover:bg-muted',
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={form.role === r.value}
                  onChange={set('role')}
                  className="sr-only"
                />
                <span className="block font-medium">{r.title}</span>
                <span
                  className={cn(
                    'block text-xs',
                    form.role === r.value ? 'text-background/70' : 'text-muted-foreground',
                  )}
                >
                  {r.text}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" className="h-10" required value={form.name} onChange={set('name')} autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            className="h-10"
            required
            value={form.email}
            onChange={set('email')}
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            className="h-10"
            required
            minLength={6}
            value={form.password}
            onChange={set('password')}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres.</p>
        </div>
        <Button type="submit" size="lg" className="h-10 w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Criar conta
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link to="/entrar" className="text-foreground underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}
