-- Taxa de Link de Pagamento (parcelado, tabela por nº de parcelas, igual ao cartão)
-- Rodar manualmente no SQL Editor do Supabase (não há tooling de migration automatizado neste projeto).

CREATE TABLE IF NOT EXISTS tabela_juros_link_pagamento (
  numero_parcelas INTEGER PRIMARY KEY,
  percentual NUMERIC(5,2) NOT NULL DEFAULT 0
);
