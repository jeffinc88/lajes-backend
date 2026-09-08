-- Promessas de pagamento: o combinado verbal do cliente, relatado pelo vendedor no WhatsApp,
-- que hoje não existe em lugar nenhum do sistema (não tem boleto, não tem parcela, não tem nota).
-- Serve para o controle de recebimento: o que foi prometido, para quando, e se foi cumprido.
-- Rodar manualmente no SQL Editor do Supabase (não há tooling de migration automatizado neste projeto).

CREATE TABLE IF NOT EXISTS promessas_pagamento (
  id SERIAL PRIMARY KEY,

  -- Vínculos opcionais: a promessa pode existir antes de haver orçamento fechado.
  orcamento_id INTEGER REFERENCES orcamentos(id) ON DELETE SET NULL,
  parcela_id INTEGER REFERENCES orcamento_parcelas(id) ON DELETE SET NULL,

  -- Cliente: nome como foi dito na conversa. cliente_chave é o nome normalizado
  -- (minúsculo, sem acento), usado para juntar o histórico do mesmo cliente.
  cliente_nome TEXT NOT NULL,
  cliente_chave TEXT NOT NULL,

  vendedor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  vendedor_nome TEXT,

  valor NUMERIC(10,2),
  data_promessa DATE,

  status TEXT NOT NULL DEFAULT 'pendente',
  pago_em DATE,

  trecho TEXT,        -- a frase exata da conversa; é o que se mostra ao cobrar
  observacao TEXT,    -- obra, pedido ou contexto curto
  origem TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'conversa'
  confianca TEXT,                          -- 'alta' | 'media' | 'baixa' (extração automática)
  motivo TEXT,                             -- por que não pagou, quando encerrada

  -- Quando o cliente remarca, a promessa antiga é encerrada como 'quebrada' e uma nova
  -- é criada apontando para ela. É isso que preserva o histórico de quem promete e não cumpre.
  renegociacao_de INTEGER REFERENCES promessas_pagamento(id) ON DELETE SET NULL,

  criado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  encerrado_em TIMESTAMP,

  CONSTRAINT promessas_pagamento_status_check CHECK (status IN ('pendente', 'pago', 'quebrada'))
);

CREATE INDEX IF NOT EXISTS idx_promessas_status_data ON promessas_pagamento(status, data_promessa);
CREATE INDEX IF NOT EXISTS idx_promessas_cliente_chave ON promessas_pagamento(cliente_chave);
CREATE INDEX IF NOT EXISTS idx_promessas_orcamento_id ON promessas_pagamento(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_promessas_vendedor_id ON promessas_pagamento(vendedor_id);
