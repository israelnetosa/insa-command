-- v1.7: cache de IA (pesquisas e respostas repetidas não gastam tokens de novo)
CREATE TABLE IF NOT EXISTS ia_cache (
  chave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL,
  expira INTEGER NOT NULL        -- epoch ms
);
ALTER TABLE ia_uso ADD COLUMN locais INTEGER NOT NULL DEFAULT 0;
