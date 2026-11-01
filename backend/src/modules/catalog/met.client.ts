import { config } from '../../config.js';
import { CircuitBreaker } from './circuit-breaker.js';

/** Item normalizado do catálogo externo (The Metropolitan Museum of Art Collection API). */
export interface CatalogItem {
  source: 'met';
  externalId: string;
  title: string;
  artist: string | null;
  artistBio: string | null;
  date: string | null;
  medium: string | null;
  dimensions: string | null;
  department: string | null;
  culture: string | null;
  classification: string | null;
  creditLine: string | null;
  imageUrl: string;
  objectUrl: string | null;
}

export const breaker = new CircuitBreaker(3, 30_000);

async function getJson<T>(path: string): Promise<T> {
  return breaker.exec(async () => {
    const res = await fetch(`${config.catalog.baseUrl}${path}`, {
      signal: AbortSignal.timeout(config.catalog.timeoutMs),
      headers: { accept: 'application/json' },
    });
    // 404 é resposta válida (objeto inexistente), não falha da API.
    if (res.status === 404) return null as T;
    if (!res.ok) throw new Error(`Met API respondeu ${res.status}`);
    return (await res.json()) as T;
  });
}

// Alguns títulos do Met vêm com marcação HTML (ex.: "<i>Gusoku</i>").
const clean = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const text = value.replace(/<[^>]+>/g, '').trim();
  return text || null;
};

export function normalizeMetObject(o: Record<string, unknown>): CatalogItem | null {
  const imageUrl = clean(o.primaryImageSmall) ?? clean(o.primaryImage);
  if (!imageUrl || !clean(o.title)) return null;
  return {
    source: 'met',
    externalId: String(o.objectID),
    title: clean(o.title)!,
    artist: clean(o.artistDisplayName),
    artistBio: clean(o.artistDisplayBio),
    date: clean(o.objectDate),
    medium: clean(o.medium),
    dimensions: clean(o.dimensions),
    department: clean(o.department),
    culture: clean(o.culture),
    classification: clean(o.classification) ?? clean(o.objectName),
    creditLine: clean(o.creditLine),
    imageUrl,
    objectUrl: clean(o.objectURL),
  };
}

export async function searchIds(query: string, offset: number, limit: number) {
  const params = new URLSearchParams({ q: query, hasImages: 'true', offset: String(offset), limit: String(limit) });
  const data = await getJson<{ total: number; objectIDs: number[] | null }>(`/v1.1/search?${params}`);
  return { total: data?.total ?? 0, ids: (data?.objectIDs ?? []).map(String) };
}

export async function fetchObject(id: string): Promise<CatalogItem | null> {
  const data = await getJson<Record<string, unknown> | null>(`/v1/objects/${encodeURIComponent(id)}`);
  return data ? normalizeMetObject(data) : null;
}
