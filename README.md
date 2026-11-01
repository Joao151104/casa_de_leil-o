# Arremate — Casa de Leilões Online

Casa de leilões de obras de arte com lances ao vivo. O leiloeiro monta lotes a partir de obras do acervo público do **The Metropolitan Museum of Art**, e os licitantes depositam saldo simulado e disputam cada lote em tempo real. Ao final, o vencedor recebe um comprovante assinado que pode ser compartilhado por link. Qualquer pessoa, mesmo sem login, pode auditar o histórico de lances de um lote e verificar, inclusive no próprio navegador, que ele não foi adulterado.

> **Deploy:** _adicione aqui o link público após o deploy_ (ver [Deploy](#deploy))

### Contas de demonstração (senha `demo1234` para todas)

| Papel | E-mail | Situação inicial |
|---|---|---|
| Leiloeiro | `leiloeiro@demo.com` | 8 lotes: ao vivo, agendados, encerrados (1 arrematado, 1 sem lances) e 1 cancelado |
| Licitante | `ana@demo.com` | R$ 50.000 de saldo, liderando "Sunflowers" |
| Licitante | `bruno@demo.com` | R$ 30.000 de saldo, liderando "Two Dancers" e vencedor do lote do gato egípcio (tem comprovante) |

A tela de login tem botões de acesso rápido para cada conta. Para ver a disputa ao vivo, abra duas janelas (uma anônima) com Ana e Bruno na mesma sala de lote.

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Stack e arquitetura](#stack-e-arquitetura)
- [Como executar](#como-executar)
- [Testes automatizados](#testes-automatizados)
- [Deploy](#deploy)
- [Decisões técnicas](#decisões-técnicas)
- [API](#api)
- [Comportamentos que valem conhecer / limitações](#comportamentos-que-valem-conhecer--limitações)

---

## Funcionalidades

### Requisitos base

| Requisito | Onde |
|---|---|
| Dois papéis: leiloeiro (cria/gerencia lotes, não dá lances) e licitante | `requireRole` no back; telas e menus por papel |
| **Vitrine** com abas Ao vivo / Agendados / Encerrados; cancelados não aparecem | `/` |
| **Painel do leiloeiro**: busca na API, cria lote (imagem, título, atributos, início/fim, lance inicial, incremento), cancela, vê resultado de cada lote e total recebido | `/painel`, `/painel/novo-lote` |
| **Sala do lote ao vivo**: lance atual, histórico, posição do usuário, contagem regressiva, "você está ganhando" / "você foi superado", tudo sem recarregar | `/lotes/:id` |
| **Carteira**: saldo total, comprometido, disponível e depósito simulado | `/carteira` |
| **Meus arremates**: lotes em que deu lance e os vencidos, com comprovante e link de compartilhamento | `/meus-arremates` |
| **Auditoria pública** (sem login): histórico completo e veredito íntegro/adulterado | `/lotes/:id/auditoria` |
| **Comprovante público** compartilhável | `/comprovante/:codigo` |
| **Mensagens de lance recusado** com o motivo: abaixo do mínimo (informa o mínimo), saldo insuficiente (informa o disponível), você já está ganhando, lote não iniciado (informa quando abre), lote encerrado | sala do lote |
| Regras de lance, saldo comprometido, anti-sniping, liquidação, histórico à prova de adulteração e privacidade | [Decisões técnicas](#decisões-técnicas) |
| A aplicação continua funcionando com a API externa fora do ar | [Gestão da API externa](#gestão-da-api-externa) |
| Dados de teste semeados | 1 leiloeiro, 2 licitantes e lotes com lances abertos |

### Opcionais implementados

- **Busca e filtro de lotes**: busca por título, artista, técnica e cultura, além de ordenação (terminando antes, mais recentes, preço).
- **Cancelamento com estorno automático**: lotes sem lances são cancelados direto. Lotes com lances exigem uma confirmação explícita e o valor comprometido do líder volta na hora para o saldo disponível. Os licitantes afetados recebem notificação.
- **Docker Compose**: `docker compose up --build` sobe banco, backend e frontend, cada um em seu container.
- **Testes automatizados**: 43 testes, entre unitários, de integração com Postgres real, de concorrência e de contrato entre front e back.
- **Dark mode**: tema claro/escuro com os tokens do shadcn/ui, que respeita a preferência do sistema e fica salvo.

Extras: verificação criptográfica independente no navegador, notificações em tempo real (superado, arrematado, vendido, estornado), layout responsivo para celular e sincronização do relógio com o servidor nas contagens regressivas.

---

## Stack e arquitetura

O projeto tem dois projetos independentes, cada um com seu `package.json`, lockfile, testes e `Dockerfile`:

| Projeto | Tecnologia |
|---|---|
| [`frontend/`](frontend/) | React 19 + Vite + TypeScript, **[shadcn/ui](https://ui.shadcn.com)** (Radix + Tailwind CSS 4), React Router, Socket.IO client, sonner (toasts), next-themes (dark mode), `@noble/curves` (verificação Ed25519 no navegador). Em produção, nginx serve o build |
| [`backend/`](backend/) | Node.js + Express 5 + TypeScript, Socket.IO, Zod (validação), `pg` com SQL puro (sem ORM), JWT + bcrypt |
| Banco | PostgreSQL (14+) |
| API externa | [The Met Collection API](https://metmuseum.github.io/), pública e sem chave |
| Testes | Vitest (os dois projetos) + Supertest (backend) |

```
┌──────────────────────── navegador ────────────────────────┐
│ React SPA (shadcn/ui) ── REST /api ──┐  ┌── WebSocket      │
└──────────────────────────────────────┼──┼──────────────────┘
                                       ▼  ▼
┌──────────── frontend (nginx) ────────────┐
│ serve o build do Vite (SPA)              │
│ proxy /api e /socket.io ──► BACKEND_URL  │
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────── backend (Node) ────────────────────────────────┐
│ Express: auth · lots · bids · wallet · audit · receipts · catalog  │
│ Serviços ── eventos de domínio (após COMMIT) ──► realtime (rooms)  │
│ Job de liquidação (1 s, SKIP LOCKED)                               │
│ Catálogo: cache + timeout + circuit breaker ──► API do Met         │
└───────────────────────────────┬────────────────────────────────────┘
                                ▼
                           PostgreSQL
```

O nginx do frontend repassa `/api` e `/socket.io` para o backend. Para o navegador, tudo fica na mesma origem, sem CORS e sem URLs de API embutidas no build. Em desenvolvimento, o Vite faz o mesmo proxy.

```
.
├── backend/
│   ├── migrations/001_init.sql      # schema (aplicado automaticamente no boot)
│   ├── src/
│   │   ├── lib/ledger.ts            # cadeia de hashes + assinaturas Ed25519
│   │   ├── lib/pseudonym.ts         # pseudônimo do licitante por lote
│   │   ├── modules/bids/            # regras de lance (puras) + registro com locks
│   │   ├── modules/lots/            # lotes, vitrine, painel, liquidação
│   │   ├── modules/wallet/          # saldo total / comprometido / disponível
│   │   ├── modules/audit/verify.ts  # verificação de integridade
│   │   ├── modules/catalog/         # cliente do Met, cache, circuit breaker
│   │   ├── realtime.ts              # Socket.IO (salas por lote, vitrine e usuário)
│   │   └── db/seed.ts               # dados de demonstração
│   ├── tests/
│   └── Dockerfile
├── frontend/
│   ├── components.json              # configuração do shadcn/ui
│   ├── src/
│   │   ├── components/ui/           # componentes do shadcn/ui (gerados pelo CLI)
│   │   ├── components/app/          # componentes da aplicação montados sobre eles
│   │   ├── pages/                   # vitrine, sala, painel, carteira, auditoria…
│   │   └── lib/ledger.ts            # verificação independente no navegador
│   ├── nginx/                       # template do nginx (SPA + proxy)
│   └── Dockerfile
├── db-init/                         # cria o banco de testes no Postgres do compose
├── docker-compose.yml               # db + backend + frontend
└── render.yaml                      # deploy no Render (3 serviços)
```

### Interface

**Direção visual: catálogo de leilão impresso.** Preto sobre branco, linhas finas no lugar de cards com sombra, cantos quase retos e um único acento (laranja-sinal) reservado para o que está **ao vivo** e para a ação de **dar lance**. Cada lote tem número de catálogo ("Lote 004"), e a vitrine abre com o lote que encerra primeiro em destaque.

- **Tipografia:** [Archivo](https://fonts.google.com/specimen/Archivo) (grotesca com eixo de largura: expandida nos títulos, normal no texto) e [JetBrains Mono](https://www.jetbrains.com/lp/mono/) em tudo que é número: preços, contagens, nº do lote, hashes. As fontes são servidas localmente via Fontsource.
- **Componentes:** [shadcn/ui](https://ui.shadcn.com), instalados pelo CLI oficial (`npx shadcn@latest init`/`add`, estilo `radix-nova`): Button, Input, Label, Textarea, Checkbox, Select, Tabs (variante sublinhada), Alert, AlertDialog, Sheet (menu mobile), DropdownMenu (menu da conta e ações dos lotes), Table (painel, extrato, auditoria), Tooltip, Skeleton e Sonner (notificações).
- **Tema:** variáveis padrão do shadcn (`--primary`, `--muted-foreground`…) mais `--signal` e `--success`, nas versões clara e escura, em [`frontend/src/styles.css`](frontend/src/styles.css).

---

## Como executar

### Opção 1: Docker Compose (mais simples)

Pré-requisito: Docker.

```bash
docker compose up --build
```

São três containers:

| Serviço | Endereço | O que é |
|---|---|---|
| `frontend` | **http://localhost:8080** | nginx com o build do React e proxy para a API. **Abra este** |
| `backend` | http://localhost:3333 | API (`/api/health` para checar) |
| `db` | `localhost:5432` | PostgreSQL (usuário/senha `postgres`) |

Na primeira subida, o backend roda as migrações e popula os dados de demonstração. Para recomeçar do zero: `docker compose down -v`.

### Opção 2: localmente (Node + PostgreSQL)

Pré-requisitos: **Node.js 22+** e **PostgreSQL 14+**. Cada projeto é instalado e executado separadamente, em dois terminais.

**Banco:** use um Postgres local (`createdb leilao`) ou suba só o do compose: `docker compose up db -d`.

**Terminal 1, backend** (http://localhost:3333):

```bash
cd backend
npm install
cp .env.example .env      # ajuste DATABASE_URL se necessário
npm run db:migrate
npm run db:seed           # popula se o banco estiver vazio
# npm run db:reset        # apaga tudo e recria os dados de demonstração
npm run dev
```

O backend também aplica migrações ao subir e, com `SEED_ON_BOOT=true`, popula o banco vazio.

**Terminal 2, frontend** (http://localhost:5173):

```bash
cd frontend
npm install
npm run dev
```

O Vite faz proxy de `/api` e `/socket.io` para `http://localhost:3333`. Para apontar para outro backend: `VITE_API_PROXY=http://host:porta npm run dev`.

**Build de produção (sem Docker):** `npm run build && npm start` no backend, e `npm run build` no frontend (gera `frontend/dist`, para servir com qualquer servidor estático que faça o proxy de `/api` e `/socket.io`).

### Variáveis de ambiente

**Backend** (`backend/.env`):

| Variável | Obrigatória em produção | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | String de conexão do PostgreSQL |
| `DATABASE_SSL` | não | `true` se o provedor exigir SSL (ex.: URL externa do Render/Neon) |
| `PORT` | não | Porta HTTP (padrão 3333) |
| `JWT_SECRET` | sim | Assinatura dos tokens de sessão |
| `LEDGER_SIGNING_SECRET` | sim | Semente da chave Ed25519 que assina os lances. **Não troque depois de ter lances**: as assinaturas antigas deixariam de conferir |
| `PSEUDONYM_SECRET` | sim | Gera os pseudônimos dos licitantes. **Também não deve ser trocado** |
| `SEED_ON_BOOT` | não | `true` popula os dados de demonstração se o banco estiver vazio |
| `CORS_ORIGIN` | não | Só se o frontend chamar a API direto de outra origem (sem o proxy do nginx) |
| `MET_API_URL` | não | URL base da API do Met (útil para simular queda: aponte para um host inválido) |

Fora de produção, os segredos têm valores padrão de desenvolvimento.

**Frontend (container nginx):**

| Variável | Padrão | Descrição |
|---|---|---|
| `BACKEND_URL` | `http://backend:3333` | Para onde o nginx repassa `/api` e `/socket.io` |
| `PORT` | `80` | Porta de escuta do nginx (o Render injeta a dele) |

---

## Testes automatizados

```bash
cd backend && npm test     # 28 testes
cd frontend && npm test    # 15 testes
```

Os testes de integração do backend precisam de um PostgreSQL. Por padrão usam `postgres://postgres:postgres@localhost:5432/leilao_test`, o banco que o `docker compose up db -d` já cria. Para usar outro, crie um banco vazio e defina `TEST_DATABASE_URL`:

```bash
createdb leilao_test
TEST_DATABASE_URL=postgres://localhost:5432/leilao_test npm test
```

O banco de testes é apagado a cada teste. Não aponte para o banco de desenvolvimento.

O que é coberto (43 testes):

- **Regras de lance** (unitários): lance inicial, incremento, janela de início/fim, líder não cobre o próprio lance, saldo, anti-sniping.
- **Prova de adulteração** (unitários): detecção de valor alterado, lance removido no meio, lance removido no fim, assinatura forjada, lance inserido e troca de licitante.
- **Integração com Postgres**: comprometimento e liberação do saldo ao ser superado, saldo comprometido entre lotes, liquidação (débito, crédito, comprovante, idempotência), lote sem lances, cancelamento com estorno, auditoria detectando um `UPDATE` feito direto no banco, e ausência de IDs ou nomes nas respostas públicas.
- **Concorrência**: 8 licitantes dando o mesmo lance ao mesmo tempo (só 1 é aceito), e o mesmo licitante dando lances simultâneos em 5 lotes sem ultrapassar o saldo.
- **Contrato front × back**: um vetor de teste (`ledger-vector.json`, presente nos dois projetos) fixa hashes e assinaturas. O backend confere que gera exatamente esses valores, e o frontend confere que a verificação no navegador os aceita e rejeita qualquer alteração. Se o formato canônico mudar de um lado, um dos testes falha.
- **Front**: conversão de valores digitados em reais (`1.234,56`) e formatação das contagens.

---

## Deploy

O repositório inclui um **Blueprint do Render** (`render.yaml`) que cria três recursos: o PostgreSQL, o backend (`arremate-api`) e o frontend (`arremate`), cada serviço com seu Dockerfile:

1. Suba o repositório para o GitHub.
2. No [Render](https://render.com): **New → Blueprint** → selecione o repositório.
3. O Render pede o valor de `BACKEND_URL` do frontend. Informe a URL pública do backend, normalmente `https://arremate-api.onrender.com`. Se o nome estiver ocupado, o Render adiciona um sufixo; confira a URL real do serviço `arremate-api` depois de criado e ajuste em *Environment* se for diferente.
4. **Apply** e aguarde o build. No primeiro boot, o backend roda as migrações e cria os dados de demonstração.
5. O link público da aplicação é o do serviço **`arremate`** (frontend).

Os Dockerfiles são genéricos e funcionam em Railway, Fly.io e similares. O backend precisa de `DATABASE_URL`, `JWT_SECRET`, `LEDGER_SIGNING_SECRET`, `PSEUDONYM_SECRET` e `SEED_ON_BOOT=true`; o frontend, de `BACKEND_URL`. Com mais de uma instância do backend, o job de liquidação continua seguro (`SKIP LOCKED`), mas o Socket.IO precisaria de um adapter compartilhado, como Redis.

---

## Decisões técnicas

### Dinheiro

Todos os valores são **inteiros em centavos** (`bigint`), sem ponto flutuante. A formatação em R$ acontece só na borda.

### Regras de lance e concorrência

As regras ficam em uma função pura (`backend/src/modules/bids/bid.rules.ts`), avaliadas nesta ordem:

1. Lote cancelado ou não iniciado é recusado, e a mensagem informa quando abre.
2. Lote encerrado (`agora ≥ fim`) é recusado.
3. O líder atual não pode cobrir o próprio lance.
4. Primeiro lance ≥ lance inicial; os seguintes ≥ lance atual + incremento mínimo.
5. O lance precisa caber no **saldo disponível**.

O registro (`bid.service.ts`) roda em uma transação:

```
SELECT … FROM lots WHERE id = $1 FOR UPDATE      -- serializa os lances do lote
clock_timestamp()                                 -- horário real após obter o lock
valida regras → SELECT … FROM wallets FOR UPDATE  -- serializa o saldo do licitante
calcula disponível → INSERT bid (encadeado e assinado) → UPDATE lot
```

- Dois lances simultâneos no mesmo lote são serializados pelo lock da linha do lote, e o segundo é revalidado contra o estado novo.
- Lances simultâneos do mesmo licitante em lotes diferentes são serializados pelo lock da carteira. Por isso o saldo não pode ser gasto duas vezes.
- Todos os fluxos travam na ordem **lote → carteira**, o que evita deadlock.
- O horário do lance vem do relógio do banco **depois** do lock, então os horários no histórico são sempre crescentes.

### Saldo comprometido

`disponível = total − comprometido`. O **comprometido não é armazenado**: é a soma do lance atual dos lotes ativos em que o usuário é o líder. Com isso:

- quando o licitante é superado, o valor volta ao disponível na mesma transação do novo lance, sem nenhum passo extra que possa falhar;
- quando um lote é cancelado, o estorno é imediato;
- não existe contador que possa dessincronizar.

A tabela `wallets` guarda só o saldo total (com `CHECK balance_cents >= 0` como última barreira). Toda movimentação vai para `wallet_transactions`, que alimenta o extrato.

### Prorrogação (anti-sniping)

Um lance aceito quando faltam ≤ 2 minutos muda o fim para **momento do lance + 2 minutos**. Sucessivos lances de última hora mantêm o lote aberto até haver 2 minutos sem lances. O fim original fica guardado (`original_ends_at`) e a sala mostra o selo "Prorrogado".

### Liquidação

Um job roda a cada segundo e procura lotes ativos com `fim ≤ agora`. Para cada um, em **uma transação** (`FOR UPDATE SKIP LOCKED`):

- **com lances**: debita o vencedor, credita o leiloeiro, registra as duas transações e emite o **comprovante assinado**;
- **sem lances**: fecha sem vencedor.

O `SKIP LOCKED` permite várias instâncias rodando o job sem liquidar o mesmo lote duas vezes, e o job não espera um lance em andamento. A liquidação é idempotente. A fase do lote (agendado / ao vivo / encerrado) é derivada do relógio, então nenhum job precisa "virar" status.

### Histórico à prova de adulteração

A técnica escolhida combina **cadeia de hashes, assinatura digital Ed25519 e cabeça assinada**.

1. Cada lance vira uma linha canônica:
   `bid-v1|<lote>|<nº>|<pseudônimo>|<valor>|<horário ISO>|<hash do lance anterior>`
2. `hash = SHA-256(linha)`. Como cada hash inclui o anterior, alterar qualquer lance quebra todos os seguintes.
3. Cada hash é **assinado com Ed25519**. A chave privada é derivada de `LEDGER_SIGNING_SECRET`, que fica no ambiente do servidor e **nunca no banco**. Alguém com acesso direto ao banco consegue recalcular os hashes, mas não as assinaturas.
4. O lote guarda a **cabeça** da cadeia (`bid_count`, `head_hash`) também assinada. Isso detecta remoção ou inserção no fim da cadeia, que a cadeia sozinha não pegaria.
5. O **comprovante** assina o resultado (vencedor, valor, nº de lances, hash final). Quem tem o link consegue confrontá-lo com o histórico.

A auditoria (`modules/audit/verify.ts`) aponta exatamente o que mudou:

| Adulteração no banco | Como é detectada |
|---|---|
| `UPDATE` em valor, licitante ou horário | hash recalculado ≠ armazenado |
| Cadeia inteira recalculada | assinaturas inválidas |
| `DELETE` ou `INSERT` no meio | `prev_hash` e sequência quebrados |
| `DELETE` do último lance | cabeça assinada não confere |
| Lance forjado | regras violadas (abaixo do mínimo, líder cobrindo a si mesmo, fora da janela) |
| Resultado alterado | comprovante não confere |

A chave pública fica exposta em `/api/audit/public-key`. Na página de auditoria, o botão **"Verificar no meu navegador"** refaz a verificação localmente com `@noble/curves`, então o auditor não precisa confiar no veredito do servidor. Um vetor de teste compartilhado garante que o formato canônico do front e do back é idêntico.

Para testar manualmente: abra a auditoria de um lote, rode
`UPDATE bids SET amount_cents = amount_cents + 1 WHERE seq = 1;`
no banco e recarregue a página. O lote aparece como **adulterado**, com o lance apontado.

### Privacidade

Auditoria, histórico, vitrine e comprovante nunca expõem nome, e-mail ou ID de usuário. O licitante aparece como um **pseudônimo por lote** (`L-3FA9C1D2`), um HMAC de `(lote, usuário)` com `PSEUDONYM_SECRET`:

- é estável dentro de um lote, então dá para acompanhar a disputa;
- muda de um lote para outro, então não dá para cruzar a participação de alguém entre leilões;
- não pode ser revertido sem o segredo.

Cada licitante logado recebe o próprio pseudônimo do lote e vê o selo "você" nos seus lances.

### Gestão da API externa

A vitrine, as salas, a auditoria e o comprovante **não dependem da API**:

- **Snapshot no lote**: ao criar o lote, título, atributos e créditos são copiados para o banco.
- **Imagem copiada para o banco** (`images`, servida em `/api/images/:id` com cache imutável). Se o download falhar, o lote é criado assim mesmo e usa a URL externa como fallback.

Na busca do painel do leiloeiro, que é o único ponto que depende da API:

- **Timeout** de 6 s por chamada.
- **Circuit breaker**: após 3 falhas seguidas, abre por 30 s e responde na hora, sem deixar o usuário esperando timeouts. O estado aparece em `/api/health`.
- **Cache no Postgres**: buscas por 6 h e objetos por 7 dias, incluindo o cache negativo de objetos sem imagem.
- **Fallback em camadas**: API → cache válido → cache vencido (`stale`) → busca local nos itens já conhecidos. O front mostra um aviso quando os resultados vêm do fallback.
- **Concorrência limitada** (6 requisições simultâneas), para respeitar o limite do Met.

### Tempo real

Socket.IO com salas: `lot:<id>` (sala do lote), `showcase` (vitrine) e `user:<id>` (notificações privadas como "você foi superado", arremate, venda e estorno, além da atualização da carteira). Os serviços emitem eventos de domínio **depois do COMMIT** e a camada realtime os repassa, então o cliente nunca recebe um estado que acabou desfeito por rollback. Ao reconectar, a sala recarrega o estado para recuperar o que perdeu.

As contagens regressivas usam o relógio do servidor (offset calculado no carregamento), então não dependem do relógio do computador do usuário estar certo. A fase muda para "ao vivo" ou "encerrado" no segundo exato.

---

## API

Respostas de erro seguem o formato `{ "error": { "code": "...", "message": "...", ...detalhes } }`.

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/api/auth/register` | público | Cria conta (`role`: `auctioneer` ou `bidder`) |
| POST | `/api/auth/login` | público | Retorna JWT |
| GET | `/api/auth/me` | logado | Usuário atual |
| GET | `/api/lots?phase=live\|scheduled\|ended&q=&sort=` | público | Vitrine (sem cancelados) + contagem por fase |
| GET | `/api/lots/:id` | público | Lote, lances públicos, `myTag` (pseudônimo do usuário) e hora do servidor |
| POST | `/api/lots` | leiloeiro | Cria lote a partir de um item do catálogo |
| POST | `/api/lots/:id/cancel` | leiloeiro | Cancela (`confirmRefund: true` se já houver lances) |
| POST | `/api/lots/:id/bids` | licitante | Dá lance `{ amountCents }`. Recusas retornam 422 com `code`: `BELOW_MINIMUM`, `INSUFFICIENT_FUNDS`, `ALREADY_WINNING`, `LOT_NOT_STARTED`, `LOT_ENDED`, `LOT_CANCELLED` |
| GET | `/api/me/lots` | leiloeiro | Painel: lotes, resultados e totais |
| GET | `/api/me/bids` | licitante | Meus arremates |
| GET | `/api/wallet` | licitante | Saldos, comprometimentos e extrato |
| POST | `/api/wallet/deposit` | licitante | Depósito simulado `{ amountCents }` |
| GET | `/api/catalog/search?q=&page=` | leiloeiro | Busca no acervo do Met |
| GET | `/api/audit/lots/:id` | público | Histórico completo, assinaturas e veredito |
| GET | `/api/audit/public-key` | público | Chave pública Ed25519 |
| GET | `/api/receipts/:code` | público | Comprovante + validade da assinatura |
| GET | `/api/health` | público | Status, hora do servidor e estado do circuit breaker |

Eventos Socket.IO: o cliente emite `lot:watch` / `lot:unwatch` / `showcase:watch`. O servidor envia `lot:update`, `showcase:update`, `notification` e `wallet:changed`.

---

## Comportamentos que valem conhecer / limitações

- **Plano gratuito do Render hiberna** os serviços após ~15 min sem acesso (frontend e backend hibernam separadamente). O primeiro acesso depois disso pode levar ~1 min. Enquanto o serviço está hibernado o job de liquidação não roda: um lote que venceu nesse período aparece como "Encerrado · liquidando" e é liquidado assim que o servidor acorda. Lances nunca são aceitos após o fim, porque a validação usa o horário do lote e não o job.
- **Os dados de demonstração usam datas relativas ao primeiro boot.** Os lotes ao vivo com lances encerram 30 dias depois, e os agendados abrem em 1 e 2 dias. Para renovar: `npm run db:reset`.
- **Busca no acervo**: o Met cataloga em inglês ("cat", "samurai", "Van Gogh" funcionam melhor). Muitas obras não são de domínio público e vêm **sem imagem**. Elas são descartadas, então uma página pode trazer menos de 30 resultados ou nenhum (Monet é um exemplo: quase todo o acervo dele no Met está sem imagem liberada). O front explica isso quando acontece.
- **Para testar o anti-sniping e a liquidação rapidamente**: crie um lote com "Começar agora" e duração "+5 min", e dê lances nos últimos 2 minutos.
- **Cancelamento**: lotes com lances podem ser cancelados (opcional de estorno), com confirmação explícita. Lotes já encerrados não podem ser cancelados. Um lote cancelado continua acessível por link direto, com aviso, mas some da vitrine.
- **Não troque `LEDGER_SIGNING_SECRET` nem `PSEUDONYM_SECRET` depois de haver lances.** A auditoria passaria a acusar adulteração em todo o histórico, porque as assinaturas e os pseudônimos antigos deixam de conferir. Rotação de chaves exigiria versionar a chave por lance; não foi implementada.
- **Limite conhecido da prova de adulteração**: quem tiver acesso ao banco **e** tiver guardado uma cópia de um estado antigo do lote (lances + cabeça assinada) poderia restaurar esse estado inteiro, apagando os lances posteriores de forma consistente. O comprovante assinado protege o resultado de lotes já liquidados. Uma proteção completa exigiria ancorar periodicamente o hash da cabeça em um serviço externo de carimbo de tempo.
- **Escala horizontal**: o job de liquidação já é seguro com várias instâncias, mas o Socket.IO precisaria de um adapter compartilhado (Redis) para propagar eventos entre elas.
- **Sessão** via JWT (7 dias) em `localStorage`. Não há recuperação de senha (fora do escopo, conforme o enunciado).
- Horários são exibidos no fuso do navegador. Depósito simulado limitado a R$ 1.000.000,00 por operação.
