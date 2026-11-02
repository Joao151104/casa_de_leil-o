# Arremate (backend)

API REST + Socket.IO da casa de leilões (Node.js, Express 5, TypeScript, PostgreSQL).

```bash
npm install
cp .env.example .env   # ajuste DATABASE_URL
npm run db:migrate && npm run db:seed
npm run dev            # http://localhost:3333
npm test               # requer Postgres (ver TEST_DATABASE_URL no README principal)
npm run lint           # oxlint
npm run format         # prettier
```

Docker: `docker build -t arremate-backend .` (porta 3333).

Documentação completa (arquitetura, regras de lance, prova de adulteração, API): [README principal](../README.md).
