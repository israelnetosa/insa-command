-- v1.5: aparelhos pareados (nuvem). Cada aparelho tem a sua sessão longa e pode ser revogado.
ALTER TABLE sessions ADD COLUMN id TEXT;
ALTER TABLE sessions ADD COLUMN rotulo TEXT;
ALTER TABLE sessions ADD COLUMN ultimo_uso INTEGER;

-- Códigos de pareamento de uso único (guardamos só o hash)
CREATE TABLE pareamentos (
  codigo_hash TEXT PRIMARY KEY,
  expira      INTEGER NOT NULL
);
