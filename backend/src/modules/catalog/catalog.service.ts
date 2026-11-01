import { config } from '../../config.js';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { breaker, fetchObject, searchIds, type CatalogItem } from './met.client.js';

/**
 * IDs por página. Parte dos objetos do Met não tem imagem liberada (não é domínio público) e
 * é descartada, então pedimos uma janela maior e devolvemos só os que têm imagem.
 */
export const PAGE_SIZE = 30;

export interface SearchResult {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  /** 'live' = API respondeu; 'cache' = cache válido; 'stale' = API fora, cache vencido; 'local' = API fora, busca nos itens já conhecidos. */
  source: 'live' | 'cache' | 'stale' | 'local';
  warning?: string;
}

const OUTAGE_WARNING =
  'A API do museu está instável no momento. Exibindo resultados salvos anteriormente — a criação de lotes continua funcionando.';

/** Objetos sem imagem também são cacheados (marcador `unavailable`) para não serem buscados de novo. */
type CachedItem = { item: CatalogItem | null; fresh: boolean };

async function getCachedItems(ids: string[]): Promise<Map<string, CachedItem>> {
  if (!ids.length) return new Map();
  const { rows } = await pool.query(
    `SELECT external_id, data, fetched_at > now() - make_interval(secs => $2::double precision / 1000) AS fresh
       FROM catalog_items WHERE source = 'met' AND external_id = ANY($1)`,
    [ids, config.catalog.itemTtlMs],
  );
  return new Map(rows.map((r) => [r.external_id, { item: r.data.unavailable ? null : (r.data as CatalogItem), fresh: r.fresh }]));
}

async function cacheUnavailable(externalId: string) {
  await pool.query(
    `INSERT INTO catalog_items (source, external_id, data, fetched_at) VALUES ('met', $1, $2, now())
     ON CONFLICT (source, external_id) DO UPDATE SET data = EXCLUDED.data, fetched_at = now()`,
    [externalId, { unavailable: true }],
  );
}

async function cacheItem(item: CatalogItem) {
  await pool.query(
    `INSERT INTO catalog_items (source, external_id, data, fetched_at) VALUES ('met', $1, $2, now())
     ON CONFLICT (source, external_id) DO UPDATE SET data = EXCLUDED.data, fetched_at = now()`,
    [item.externalId, item],
  );
}

/** Busca vários objetos respeitando o cache e com concorrência limitada (a API do Met pede ≤ 80 req/s). */
async function resolveItems(ids: string[]): Promise<CatalogItem[]> {
  const cached = await getCachedItems(ids);
  const result = new Map<string, CatalogItem>();
  const missing: string[] = [];
  for (const id of ids) {
    const hit = cached.get(id);
    if (hit?.fresh) {
      if (hit.item) result.set(id, hit.item);
    } else missing.push(id);
  }
  const queue = [...missing];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        const item = await fetchObject(id);
        if (item) {
          result.set(id, item);
          await cacheItem(item);
        } else {
          await cacheUnavailable(id);
        }
      } catch {
        const stale = cached.get(id);
        if (stale?.item) result.set(id, stale.item);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return ids.map((id) => result.get(id)).filter((i): i is CatalogItem => Boolean(i));
}

async function localSearch(query: string, page: number): Promise<SearchResult> {
  const like = `%${query}%`;
  const { rows } = await pool.query(
    `SELECT data, count(*) OVER () AS total FROM catalog_items
      WHERE source = 'met' AND data->>'unavailable' IS NULL AND (data->>'title' ILIKE $1 OR data->>'artist' ILIKE $1 OR data->>'medium' ILIKE $1)
      ORDER BY fetched_at DESC LIMIT $2 OFFSET $3`,
    [like, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  return {
    items: rows.map((r) => r.data),
    total: rows[0] ? Number(rows[0].total) : 0,
    page,
    pageSize: PAGE_SIZE,
    source: 'local',
    warning: OUTAGE_WARNING,
  };
}

export async function searchCatalog(rawQuery: string, page = 1): Promise<SearchResult> {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return { items: [], total: 0, page, pageSize: PAGE_SIZE, source: 'live' };
  const cacheKey = `met:${query}:${page}`;

  const { rows } = await pool.query(
    `SELECT external_ids, total, fetched_at > now() - make_interval(secs => $2::double precision / 1000) AS fresh
       FROM catalog_searches WHERE cache_key = $1`,
    [cacheKey, config.catalog.searchTtlMs],
  );
  const cached = rows[0] as { external_ids: string[]; total: number; fresh: boolean } | undefined;
  if (cached?.fresh) {
    return { items: await resolveItems(cached.external_ids), total: cached.total, page, pageSize: PAGE_SIZE, source: 'cache' };
  }

  try {
    const { ids, total } = await searchIds(query, (page - 1) * PAGE_SIZE, PAGE_SIZE);
    await pool.query(
      `INSERT INTO catalog_searches (cache_key, external_ids, total, fetched_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (cache_key) DO UPDATE SET external_ids = EXCLUDED.external_ids, total = EXCLUDED.total, fetched_at = now()`,
      [cacheKey, ids, total],
    );
    return { items: await resolveItems(ids), total, page, pageSize: PAGE_SIZE, source: 'live' };
  } catch {
    if (cached) {
      return {
        items: await resolveItems(cached.external_ids),
        total: cached.total,
        page,
        pageSize: PAGE_SIZE,
        source: 'stale',
        warning: OUTAGE_WARNING,
      };
    }
    return localSearch(query, page);
  }
}

/** Item por ID: cache primeiro; se a API falhar, usa a cópia antiga do cache. */
export async function getCatalogItem(externalId: string): Promise<CatalogItem> {
  const cached = (await getCachedItems([externalId])).get(externalId);
  if (cached?.fresh && cached.item) return cached.item;
  try {
    const item = await fetchObject(externalId);
    if (!item) {
      await cacheUnavailable(externalId);
      throw new AppError(404, 'NOT_FOUND', 'Item não encontrado no catálogo (ou sem imagem de domínio público).');
    }
    await cacheItem(item);
    return item;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (cached?.item) return cached.item;
    throw new AppError(503, 'CATALOG_UNAVAILABLE', 'A API do museu está indisponível e este item ainda não está em cache. Tente novamente em instantes.');
  }
}

export const catalogHealth = () => ({ circuit: breaker.state });
