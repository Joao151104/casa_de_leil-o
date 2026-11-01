const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatBRL = (cents: number | null | undefined) => (cents == null ? '—' : brl.format(cents / 100));

/** "1.234,56" | "1234.56" | "1234" → centavos. Retorna null se não for um valor válido. */
export function parseBRL(input: string): number | null {
  let text = input.replace(/[R$\s]/g, '');
  if (!text) return null;
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

/** Centavos → texto editável ("1234,50"). */
export const centsToInput = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const timeWithSeconds = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

export const formatDateTime = (iso: string | Date) => dateTime.format(new Date(iso));
export const formatTime = (iso: string | Date) => timeWithSeconds.format(new Date(iso));
export const formatDay = (iso: string | Date) => dayMonth.format(new Date(iso));

export function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return days > 0 ? `${days}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function relativeTime(iso: string, now: number): string {
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 10) return 'agora';
  if (diff < 60) return `há ${diff}s`;
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return formatDateTime(iso);
}

export const shortHash = (hash: string) => `${hash.slice(0, 8)}…${hash.slice(-6)}`;

/** Número de catálogo: 4 → "004". */
export const lotNumber = (n: number) => String(n).padStart(3, '0');
