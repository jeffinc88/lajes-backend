-- Pagamento parcelado (cartão/boleto) com juros
-- Rodar manualmente no SQL Editor do Supabase (não há tooling de migration automatizado neste projeto).

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS forma_pagamento TEXT NOT NULL DEFAULT 'avista';
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS data_entrega_prevista DATE;

CREATE TABLE IF NOT EXISTS tabela_juros_parcelamento (
  numero_parcelas INTEGER PRIMARY KEY,
  percentual NUMERIC(5,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS config_pagamento (
  id INTEGER PRIMARY KEY DEFAULT 1,
  juros_adicional_boleto NUMERIC(5,2) NOT NULL DEFAULT 0,
  max_parcelas_boleto INTEGER NOT NULL DEFAULT 3,
  CONSTRAINT config_pagamento_singleton CHECK (id = 1)
);
INSERT INTO config_pagamento (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS orcamento_parcelas (
  id SERIAL PRIMARY KEY,
  orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,          -- 0 = entrada (só boleto), 1..N = parcelas
  tipo TEXT NOT NULL,                -- 'entrada' | 'parcela'
  valor NUMERIC(10,2) NOT NULL,
  vencimento_previsto DATE,
  pago_em TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orcamento_parcelas_orcamento_id ON orcamento_parcelas(orcamento_id);
