-- INSA Command · esquema inicial
-- Princípio: o livro-razão (movements) é a única fonte da verdade.
-- Posições, preço médio, caixa e renda recebida são SEMPRE derivados dele.

-- Dono único: credenciais passkey (WebAuthn)
CREATE TABLE credentials (
  id            TEXT PRIMARY KEY,          -- credential ID (base64url)
  public_key    TEXT NOT NULL,             -- base64url
  counter       INTEGER NOT NULL DEFAULT 0,
  transports    TEXT,                      -- JSON array
  device_label  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at  TEXT
);

-- Desafios WebAuthn de uso único (expiram em 5 min)
CREATE TABLE challenges (
  id          TEXT PRIMARY KEY,
  challenge   TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('register','login')),
  expires_at  INTEGER NOT NULL
);

-- Sessões: guardamos só o hash SHA-256 do token
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  user_agent  TEXT
);

-- Cadastro de ativos (metadados, não posição)
CREATE TABLE assets (
  ticker        TEXT PRIMARY KEY,
  nome          TEXT,
  tipo          TEXT,
  setor         TEXT,
  camada        TEXT,
  dy_ref        REAL,           -- DY de referência (estimativa)
  div_mes_cota  REAL,           -- provento médio mensal por cota (estimativa)
  mensal        INTEGER DEFAULT 0,
  teto_bazin    REAL,
  hi52          REAL,
  lo52          REAL,
  ativo         INTEGER DEFAULT 1
);

-- Livro-razão
CREATE TABLE movements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  data        TEXT NOT NULL,          -- AAAA-MM-DD (data do negócio / pagamento)
  tipo        TEXT NOT NULL CHECK (tipo IN
               ('saldo_inicial','compra','venda','provento','aporte','retirada','desdobramento','grupamento','taxa','ajuste_caixa')),
  ticker      TEXT,                   -- nulo para aporte/retirada/ajuste_caixa
  qtd         REAL,                   -- cotas (compra/venda/saldo_inicial) ou fator (desdobramento/grupamento)
  preco       REAL,                   -- preço unitário
  valor       REAL,                   -- valor em R$ (provento/aporte/retirada/taxa/ajuste_caixa)
  custos      REAL DEFAULT 0,         -- corretagem + emolumentos (compra/venda)
  subtipo     TEXT,                   -- provento: dividendo | jcp | rendimento | outro
  estimado    INTEGER DEFAULT 0,      -- 1 = valor estimado (ex.: preço médio importado)
  nota        TEXT,
  origem      TEXT DEFAULT 'manual',  -- manual | importacao | ia_confirmada
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  anulado     INTEGER DEFAULT 0       -- nunca apagamos: anulamos (trilha de auditoria)
);
CREATE INDEX idx_mov_data ON movements(data);
CREATE INDEX idx_mov_ticker ON movements(ticker);

-- Cache de cotações
CREATE TABLE quotes (
  ticker          TEXT PRIMARY KEY,
  preco           REAL NOT NULL,
  fechamento_ant  REAL,
  fonte           TEXT NOT NULL,
  cotado_em       INTEGER NOT NULL,    -- epoch ms do preço na fonte
  buscado_em      INTEGER NOT NULL,    -- epoch ms da nossa consulta
  status          TEXT                 -- aberto | fechado
);

-- Configuração estratégica (fases, regras, lentes, missão) em JSON versionado
CREATE TABLE settings (
  chave       TEXT PRIMARY KEY,
  valor       TEXT NOT NULL,
  atualizado  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Trilha de auditoria de ações sensíveis
CREATE TABLE audit (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  em     TEXT NOT NULL DEFAULT (datetime('now')),
  acao   TEXT NOT NULL,
  dados  TEXT
);
