import type { Db } from '../db/pool.js';

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Baixa a imagem do item e guarda uma cópia no banco. Retorna null se não conseguir:
 * nesse caso o lote usa a URL externa como fallback (a criação do lote não é bloqueada).
 */
export async function storeRemoteImage(db: Db, url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok || !contentType.startsWith('image/')) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_BYTES) return null;
    const { rows } = await db.query<{ id: string }>(
      'INSERT INTO images (content_type, bytes, source_url) VALUES ($1, $2, $3) RETURNING id',
      [contentType, bytes, url],
    );
    return rows[0].id;
  } catch {
    return null;
  }
}
