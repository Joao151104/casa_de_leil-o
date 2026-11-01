CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('auctioneer', 'bidder')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Saldo total. O saldo comprometido NÃO é armazenado: é derivado dos lotes em que o
-- usuário lidera (ver wallet.service), o que elimina qualquer risco de dessincronização.
CREATE TABLE wallets (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallet_transactions (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('deposit', 'purchase', 'sale')),
  amount_cents bigint NOT NULL, -- positivo = crédito, negativo = débito
  lot_id       uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wallet_transactions_user_idx ON wallet_transactions (user_id, created_at DESC);

-- Cache da API externa: permite operar (vitrine, criação de lote, busca degradada) com a API fora do ar.
CREATE TABLE catalog_items (
  source      text NOT NULL,
  external_id text NOT NULL,
  data        jsonb NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, external_id)
);

CREATE TABLE catalog_searches (
  cache_key    text PRIMARY KEY,
  external_ids text[] NOT NULL,
  total        integer NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

-- Cópia local das imagens dos lotes: a vitrine não depende do servidor de imagens externo.
CREATE TABLE images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL,
  bytes        bytea NOT NULL,
  source_url   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lots (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id            uuid NOT NULL REFERENCES users(id),
  source               text NOT NULL,
  external_id          text NOT NULL,
  title                text NOT NULL,
  description          text,
  attributes           jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_id             uuid REFERENCES images(id),
  image_url            text,
  starting_price_cents bigint NOT NULL CHECK (starting_price_cents > 0),
  min_increment_cents  bigint NOT NULL CHECK (min_increment_cents > 0),
  starts_at            timestamptz NOT NULL,
  ends_at              timestamptz NOT NULL,
  original_ends_at     timestamptz NOT NULL,
  -- 'active' cobre agendado/ao vivo/encerrado-aguardando-liquidação (derivado do relógio).
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'settled')),
  cancelled_at         timestamptz,
  cancel_reason        text,
  settled_at           timestamptz,
  current_price_cents  bigint,
  leader_id            uuid REFERENCES users(id),
  bid_count            integer NOT NULL DEFAULT 0,
  head_hash            text NOT NULL DEFAULT repeat('0', 64),
  head_signature       text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX lots_status_ends_idx ON lots (status, ends_at);
CREATE INDEX lots_seller_idx ON lots (seller_id);
CREATE INDEX lots_leader_active_idx ON lots (leader_id) WHERE status = 'active';

-- Histórico de lances encadeado: hash(n) cobre o conteúdo do lance + hash(n-1) e é assinado com Ed25519.
CREATE TABLE bids (
  id           bigserial PRIMARY KEY,
  lot_id       uuid NOT NULL REFERENCES lots(id),
  seq          integer NOT NULL,
  bidder_id    uuid NOT NULL REFERENCES users(id),
  bidder_tag   text NOT NULL,
  amount_cents bigint NOT NULL,
  created_at   timestamptz NOT NULL,
  prev_hash    text NOT NULL,
  hash         text NOT NULL,
  signature    text NOT NULL,
  UNIQUE (lot_id, seq)
);
CREATE INDEX bids_bidder_idx ON bids (bidder_id);

CREATE TABLE receipts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  lot_id       uuid NOT NULL UNIQUE REFERENCES lots(id),
  winner_id    uuid NOT NULL REFERENCES users(id),
  winner_tag   text NOT NULL,
  amount_cents bigint NOT NULL,
  bid_count    integer NOT NULL,
  final_hash   text NOT NULL,
  issued_at    timestamptz NOT NULL,
  signature    text NOT NULL
);
