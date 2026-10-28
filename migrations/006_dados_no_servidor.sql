-- Dados que antes ficavam só no AsyncStorage de cada aparelho passam para o servidor,
-- para que todos os celulares (e a versão web) vejam a mesma informação.
-- Rodar manualmente no SQL Editor do Supabase (não há tooling de migration automatizado neste projeto).

-- Dados da empresa que aparecem no cabeçalho dos PDFs (linha única, id = 1)
CREATE TABLE IF NOT EXISTS config_empresa (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  razao_social TEXT,
  cnpj TEXT,
  telefone TEXT,
  endereco TEXT,
  cidade TEXT,
  email TEXT
);
INSERT INTO config_empresa (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Quando o admin marcou o follow-up do orçamento como feito
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS followup_feito_em TIMESTAMP;
