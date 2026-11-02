-- v1.2: console do M.A.N.U.E.L.
CREATE TABLE conversa (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  em     TEXT NOT NULL DEFAULT (datetime('now')),
  papel  TEXT NOT NULL CHECK (papel IN ('usuario','manuel')),
  texto  TEXT NOT NULL,
  meta   TEXT                      -- JSON: provedor, modelo, ferramentas, propostas, fontes, uso
);

-- Propostas de lançamento feitas pela IA: só viram lançamento com a confirmação do dono
CREATE TABLE propostas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  criada_em    TEXT NOT NULL DEFAULT (datetime('now')),
  lancamento   TEXT NOT NULL,      -- JSON normalizado
  efeito       TEXT,               -- JSON da prévia no momento da proposta
  pedido       TEXT,               -- o que o dono escreveu
  status       TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','confirmada','recusada')),
  resolvida_em TEXT,
  movimento_id INTEGER
);

-- Uso diário de IA (limite e transparência de custo)
CREATE TABLE ia_uso (
  dia      TEXT PRIMARY KEY,       -- AAAA-MM-DD
  chamadas INTEGER NOT NULL DEFAULT 0,
  entrada  INTEGER NOT NULL DEFAULT 0,
  saida    INTEGER NOT NULL DEFAULT 0
);
