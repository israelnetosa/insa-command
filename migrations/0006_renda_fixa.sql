-- Matriz 5x20: o bloco Caixa inclui renda fixa de liquidez diária.
-- Novos tipos no razão: aplicacao_rf (caixa → RF), resgate_rf (RF → caixa), rendimento_rf (saldo existente / rendimento).
-- O SQLite não altera CHECK: recriamos a tabela preservando ids, dados e a trilha de auditoria.
CREATE TABLE movements_novo (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  data        TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN
               ('saldo_inicial','compra','venda','provento','aporte','retirada','desdobramento','grupamento','taxa','ajuste_caixa',
                'aplicacao_rf','resgate_rf','rendimento_rf')),
  ticker      TEXT,
  qtd         REAL,
  preco       REAL,
  valor       REAL,
  custos      REAL DEFAULT 0,
  subtipo     TEXT,
  estimado    INTEGER DEFAULT 0,
  nota        TEXT,
  origem      TEXT DEFAULT 'manual',
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  anulado     INTEGER DEFAULT 0
);
INSERT INTO movements_novo (id, data, tipo, ticker, qtd, preco, valor, custos, subtipo, estimado, nota, origem, criado_em, anulado)
  SELECT id, data, tipo, ticker, qtd, preco, valor, custos, subtipo, estimado, nota, origem, criado_em, anulado FROM movements;
DROP TABLE movements;
ALTER TABLE movements_novo RENAME TO movements;
CREATE INDEX idx_mov_data ON movements(data);
CREATE INDEX idx_mov_ticker ON movements(ticker);
