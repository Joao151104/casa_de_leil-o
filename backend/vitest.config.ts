import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Os testes de integração compartilham o mesmo banco: rodar em série evita interferência.
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/leilao_test',
      SEED_ON_BOOT: 'false',
      // Segredos fixos: os testes não dependem do .env local e o vetor de teste do ledger é reproduzível.
      JWT_SECRET: 'test-jwt-secret',
      LEDGER_SIGNING_SECRET: 'test-ledger-secret',
      PSEUDONYM_SECRET: 'test-pseudonym-secret',
    },
  },
});
