import { Menu, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/context/AuthContext';
import { useWallet } from '@/context/WalletContext';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[\p{L}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-baseline gap-2', className)}>
      <span className="font-display text-lg tracking-tight uppercase">Arremate</span>
      <span className="size-2 translate-y-[-1px] bg-signal" aria-hidden />
    </span>
  );
}

function NavItem({ to, children, onClick }: { to: string; children: ReactNode; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'text-sm underline-offset-[6px] transition-colors hover:text-foreground',
          isActive ? 'text-foreground underline decoration-2' : 'text-muted-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { wallet } = useWallet();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const signOut = () => {
    logout();
    close();
    navigate('/');
  };

  const links = (
    <>
      <NavItem to="/" onClick={close}>
        Leilões
      </NavItem>
      {user?.role === 'bidder' && (
        <>
          <NavItem to="/meus-arremates" onClick={close}>
            Meus arremates
          </NavItem>
          <NavItem to="/carteira" onClick={close}>
            Carteira
          </NavItem>
        </>
      )}
      {user?.role === 'auctioneer' && (
        <NavItem to="/painel" onClick={close}>
          Painel do leiloeiro
        </NavItem>
      )}
    </>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-8 px-5 sm:px-8">
          <Link to="/" aria-label="Arremate, página inicial">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-6 md:flex">{links}</nav>

          <div className="ml-auto flex items-center gap-2">
            {wallet && (
              <Link to="/carteira" className="mr-2 hidden text-right sm:block" title="Saldo disponível para lances">
                <span className="label-mono block text-muted-foreground">Disponível</span>
                <span className="font-mono text-sm tabular-nums">{formatBRL(wallet.availableCents)}</span>
              </Link>
            )}
            <ThemeToggle />
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="hidden size-8 items-center justify-center bg-foreground font-mono text-xs font-medium text-background md:flex"
                    aria-label="Menu da conta"
                  >
                    {initials(user.name)}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <p className="truncate font-medium text-foreground">{user.name}</p>
                    <p className="label-mono font-normal text-muted-foreground">{user.role === 'auctioneer' ? 'Leiloeiro' : 'Licitante'}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {user.role === 'bidder' ? (
                    <>
                      <DropdownMenuItem onSelect={() => navigate('/carteira')}>Carteira</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => navigate('/meus-arremates')}>Meus arremates</DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem onSelect={() => navigate('/painel')}>Painel do leiloeiro</DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={signOut}>
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden items-center gap-2 md:flex">
                <Button variant="ghost" asChild>
                  <Link to="/entrar">Entrar</Link>
                </Button>
                <Button asChild>
                  <Link to="/cadastro">Criar conta</Link>
                </Button>
              </div>
            )}

            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 gap-0">
                <SheetHeader className="border-b">
                  <SheetTitle>
                    <Wordmark />
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-4 p-4 [&_a]:text-base">{links}</nav>
                <div className="mt-auto space-y-3 border-t p-4">
                  {wallet && (
                    <div>
                      <p className="label-mono text-muted-foreground">Disponível</p>
                      <p className="font-mono">{formatBRL(wallet.availableCents)}</p>
                    </div>
                  )}
                  {user ? (
                    <Button variant="outline" className="w-full" onClick={signOut}>
                      Sair ({user.name})
                    </Button>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" asChild onClick={close}>
                        <Link to="/entrar">Entrar</Link>
                      </Button>
                      <Button asChild onClick={close}>
                        <Link to="/cadastro">Criar conta</Link>
                      </Button>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-10 sm:px-8">
        <Outlet />
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Wordmark className="opacity-80" />
          <p className="label-mono text-muted-foreground">Acervo: The Metropolitan Museum of Art · Valores simulados</p>
        </div>
      </footer>
    </div>
  );
}
