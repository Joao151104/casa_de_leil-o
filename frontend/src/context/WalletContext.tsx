import { toast } from 'sonner';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { Wallet } from '@/lib/types';
import { useAuth } from './AuthContext';

const WalletContext = createContext<{ wallet: Wallet | null; refresh: () => Promise<void> }>({
  wallet: null,
  refresh: async () => {},
});

/** Carteira do licitante logado, atualizada em tempo real (lance superado, liquidação, estorno...). */
export function WalletProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const isBidder = user?.role === 'bidder';

  const refresh = useCallback(async () => {
    if (!isBidder) return setWallet(null);
    setWallet(await api<Wallet>('/wallet'));
  }, [isBidder]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh, user?.id]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onWallet = () => refresh().catch(() => {});
    const onNotification = (n: { type: string; message: string }) => {
      if (n.type === 'outbid' || n.type === 'cancelled') toast.error(n.message);
      else if (n.type === 'won' || n.type === 'sold') toast.success(n.message);
      else toast.info(n.message);
    };
    socket.on('wallet:changed', onWallet);
    socket.on('notification', onNotification);
    return () => {
      socket.off('wallet:changed', onWallet);
      socket.off('notification', onNotification);
    };
  }, [user, refresh]);

  return <WalletContext.Provider value={{ wallet, refresh }}>{children}</WalletContext.Provider>;
}

export const useWallet = () => useContext(WalletContext);
