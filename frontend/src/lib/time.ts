import { useEffect, useState } from 'react';
import type { Lot, Phase } from '@/lib/types';

/** Diferença entre o relógio do servidor e o do navegador: countdowns não dependem do relógio local estar certo. */
let serverOffsetMs = 0;
export const syncServerTime = (serverTime: string) => {
  serverOffsetMs = new Date(serverTime).getTime() - Date.now();
};
export const serverNow = () => Date.now() + serverOffsetMs;

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Recalcula a fase localmente para virar "ao vivo"/"encerrado" no segundo exato, sem esperar o servidor. */
export function currentPhase(lot: Lot, now: number): Phase {
  if (lot.phase === 'cancelled') return 'cancelled';
  if (lot.settled) return 'ended';
  if (now < new Date(lot.startsAt).getTime()) return 'scheduled';
  if (now < new Date(lot.endsAt).getTime()) return 'live';
  return 'ended';
}

fetch('/api/health')
  .then((r) => r.json())
  .then((d) => d.serverTime && syncServerTime(d.serverTime))
  .catch(() => {});
