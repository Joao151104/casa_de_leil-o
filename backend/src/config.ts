import 'dotenv/config';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function required(name: string, devDefault: string): string {
  const value = env[name];
  if (value) return value;
  if (isProd) throw new Error(`A variável de ambiente ${name} é obrigatória em produção.`);
  return devDefault;
}

export const config = {
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT ?? 3333),
  databaseUrl: required('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/leilao'),
  databaseSsl: env.DATABASE_SSL === 'true',
  jwtSecret: required('JWT_SECRET', 'dev-jwt-secret'),
  ledgerSigningSecret: required('LEDGER_SIGNING_SECRET', 'dev-ledger-secret'),
  pseudonymSecret: required('PSEUDONYM_SECRET', 'dev-pseudonym-secret'),
  seedOnBoot: env.SEED_ON_BOOT === 'true',
  corsOrigin: env.CORS_ORIGIN,
  /** Janela do anti-sniping: lance aceito nos últimos 2 min empurra o fim para agora + 2 min. */
  antiSnipingMs: 2 * 60 * 1000,
  settlementIntervalMs: 1000,
  catalog: {
    baseUrl: env.MET_API_URL ?? 'https://collectionapi.metmuseum.org/public/collection',
    timeoutMs: 6000,
    searchTtlMs: 6 * 60 * 60 * 1000,
    itemTtlMs: 7 * 24 * 60 * 60 * 1000,
  },
};
