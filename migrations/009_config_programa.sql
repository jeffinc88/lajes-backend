-- Configuração do programa de laje do Windows (peça -> produto do app, perdas, limite de vão).
-- Linha única (id = 1): todos os PCs baixam; só o admin grava pelo programa.
-- Rodar manualmente no SQL Editor do Supabase (não há tooling de migration automatizado neste projeto).
CREATE TABLE IF NOT EXISTS config_programa (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dados JSONB,
  atualizado_em TIMESTAMP,
  atualizado_por INTEGER
);
