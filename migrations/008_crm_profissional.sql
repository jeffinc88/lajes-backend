-- Ligação do orçamento com o CRM de profissionais (mesmo banco do Supabase).
-- Rodar manualmente no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- Rodar junto com a migração 0008_integracao_app.sql do CRM.

-- Profissional (pedreiro, mestre, engenheiro) escolhido da carteira do CRM
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS crm_profissional_id UUID;
-- Obra do CRM ligada a este orçamento (criada ou vinculada ao salvar)
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS crm_obra_id UUID;
-- Nome mostrado no app (cópia, para não depender do CRM ao listar)
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS profissional_nome TEXT;
-- "Não está na lista": nome e telefone digitados pelo vendedor
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS profissional_informado TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS profissional_telefone TEXT;
-- Resultado do envio ao CRM quando o pedido é confirmado
-- ('conciliado' = ligado sozinho à obra; 'fila' = gerência confere)
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS crm_status TEXT;
