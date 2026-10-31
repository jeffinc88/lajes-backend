-- Fechamento em conjunto: o vendedor junta vários orçamentos do mesmo projeto e fecha
-- tudo de uma vez — uma forma de pagamento, um desconto sobre o total, uma confirmação,
-- um pedido no Bling. Os orçamentos continuam existindo (o cliente vê cada parte
-- separada no PDF), mas a venda conta como uma só nos relatórios.
-- Rodar manualmente no SQL Editor do Supabase (não há tooling de migration automatizado neste projeto).
-- Rodar ANTES de publicar o backend que usa estas tabelas.

CREATE TABLE IF NOT EXISTS fechamentos (
  id SERIAL PRIMARY KEY,
  projeto_id INTEGER REFERENCES projetos(id) ON DELETE CASCADE,
  cliente JSONB,
  vendedor JSONB,
  forma_pagamento TEXT NOT NULL DEFAULT 'avista',
  data_entrega_prevista DATE,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,   -- soma dos totais dos orçamentos
  desconto NUMERIC(12,2) NOT NULL DEFAULT 0,   -- desconto aplicado sobre a soma
  total NUMERIC(12,2) NOT NULL DEFAULT 0,      -- subtotal - desconto (sem juros de parcelamento)
  confirmado_em TIMESTAMP,
  pagamento_confirmado_em TIMESTAMP,
  bling_pedido_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fechamentos_projeto_id ON fechamentos(projeto_id);

-- Orçamento que faz parte de um fechamento.
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS fechamento_id INTEGER REFERENCES fechamentos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orcamentos_fechamento_id ON orcamentos(fechamento_id);

-- As parcelas de um fechamento pertencem a ele, não a um orçamento específico.
ALTER TABLE orcamento_parcelas ADD COLUMN IF NOT EXISTS fechamento_id INTEGER REFERENCES fechamentos(id) ON DELETE CASCADE;
ALTER TABLE orcamento_parcelas ALTER COLUMN orcamento_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orcamento_parcelas_fechamento_id ON orcamento_parcelas(fechamento_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamento_parcelas_dono_check') THEN
    ALTER TABLE orcamento_parcelas
      ADD CONSTRAINT orcamento_parcelas_dono_check CHECK (orcamento_id IS NOT NULL OR fechamento_id IS NOT NULL);
  END IF;
END $$;
