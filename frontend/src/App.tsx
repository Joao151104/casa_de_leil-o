import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorState, PageLoading } from '@/components/app/feedback';
import { Layout } from '@/components/app/Layout';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { WalletProvider } from '@/context/WalletContext';
import type { Role } from '@/lib/types';
import { AuditPage } from '@/pages/AuditPage';
import { LoginPage, RegisterPage } from '@/pages/AuthPages';
import { DashboardPage } from '@/pages/DashboardPage';
import { LotRoomPage } from '@/pages/LotRoomPage';
import { MyBidsPage } from '@/pages/MyBidsPage';
import { NewLotPage } from '@/pages/NewLotPage';
import { ReceiptPage } from '@/pages/ReceiptPage';
import { ShowcasePage } from '@/pages/ShowcasePage';
import { WalletPage } from '@/pages/WalletPage';

const BackHome = ({ label = 'Voltar aos leilões' }: { label?: string }) => (
  <Button variant="outline" asChild>
    <Link to="/">{label}</Link>
  </Button>
);

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/entrar" state={{ from: location.pathname }} replace />;
  if (user.role !== role) {
    return (
      <ErrorState
        message={
          role === 'auctioneer' ? 'Esta área é exclusiva para leiloeiros.' : 'Esta área é exclusiva para licitantes.'
        }
        action={<BackHome />}
      />
    );
  }
  return children;
}

export function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <AuthProvider>
          <WalletProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<ShowcasePage />} />
                  <Route path="lotes/:id" element={<LotRoomPage />} />
                  <Route path="lotes/:id/auditoria" element={<AuditPage />} />
                  <Route path="comprovante/:code" element={<ReceiptPage />} />
                  <Route path="entrar" element={<LoginPage />} />
                  <Route path="cadastro" element={<RegisterPage />} />
                  <Route
                    path="carteira"
                    element={
                      <RequireRole role="bidder">
                        <WalletPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="meus-arremates"
                    element={
                      <RequireRole role="bidder">
                        <MyBidsPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="painel"
                    element={
                      <RequireRole role="auctioneer">
                        <DashboardPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="painel/novo-lote"
                    element={
                      <RequireRole role="auctioneer">
                        <NewLotPage />
                      </RequireRole>
                    }
                  />
                  <Route path="*" element={<ErrorState message="Página não encontrada." action={<BackHome />} />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </WalletProvider>
        </AuthProvider>
        <Toaster position="bottom-right" closeButton />
      </TooltipProvider>
    </ThemeProvider>
  );
}
