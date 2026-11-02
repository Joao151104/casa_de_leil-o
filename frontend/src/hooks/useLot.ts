import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { getSocket } from '@/lib/socket';
import { syncServerTime } from '@/lib/time';
import type { Lot, PublicBid } from '@/lib/types';

export interface LotResponse {
  lot: Lot;
  bids: PublicBid[];
  myTag: string | null;
  serverTime: string;
}

/** Estado da sala do lote: carrega o lote e acompanha cada lance em tempo real. */
export function useLot(id: string) {
  const { data, error, reload, setData } = useApi<LotResponse>(`/lots/${id}`);
  // Lance recém-chegado pelo socket, destacado no histórico.
  const [flashSeq, setFlashSeq] = useState<number | null>(null);

  const serverTime = data?.serverTime;
  useEffect(() => {
    if (serverTime) syncServerTime(serverTime);
  }, [serverTime]);

  useEffect(() => {
    const socket = getSocket();
    const watch = () => socket.emit('lot:watch', id);
    watch();
    const onUpdate = (payload: { lot: Lot; bids: PublicBid[] }) => {
      if (payload.lot.id !== id) return;
      setData((d) => (d ? { ...d, lot: payload.lot, bids: payload.bids } : d));
      setFlashSeq(payload.bids[0]?.seq ?? null);
    };
    const onReconnect = () => {
      watch();
      reload(); // recupera o que foi perdido durante a desconexão
    };
    socket.on('lot:update', onUpdate);
    socket.on('connect', onReconnect);
    return () => {
      socket.emit('lot:unwatch', id);
      socket.off('lot:update', onUpdate);
      socket.off('connect', onReconnect);
    };
  }, [id, reload, setData]);

  return { data, error, reload, flashSeq };
}
