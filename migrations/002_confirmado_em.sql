-- Data de confirmação do orçamento (separada da data de criação), usada pelo ranking de vendas.
-- Rodar manualmente no SQL Editor do Supabase (não há tooling de migration automatizado neste projeto).

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMP;

-- Backfill: orçamentos já confirmados usam a data de criação como aproximação,
-- já que não temos o momento exato em que foram confirmados no passado.
UPDATE orcamentos SET confirmado_em = created_at WHERE status = 'confirmado' AND confirmado_em IS NULL;
