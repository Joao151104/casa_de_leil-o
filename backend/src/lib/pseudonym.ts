import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Identificador público de um licitante dentro de UM lote (ex.: "L-3FA9C1D2").
 * É um HMAC de (lote, usuário): estável dentro do lote, mas diferente entre lotes,
 * então não dá para cruzar a atividade de alguém nem descobrir quem é, sem expor nome/e-mail.
 */
export function bidderTag(userId: string, lotId: string): string {
  const digest = crypto.createHmac('sha256', config.pseudonymSecret).update(`${lotId}:${userId}`).digest('hex');
  return `L-${digest.slice(0, 8).toUpperCase()}`;
}
