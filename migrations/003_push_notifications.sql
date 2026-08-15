-- Suporte a push notifications: token do dispositivo por usuário, marcação de
-- orçamento impresso no servidor (hoje só existia local, no AsyncStorage do app),
-- e log de notificações já enviadas para não reenviar a cada execução do cron.
-- Rodar manualmente no SQL Editor do Supabase (não há tooling de migration automatizado neste projeto).

ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS impresso_em TIMESTAMP;

CREATE TABLE IF NOT EXISTS notifications_log (
  id SERIAL PRIMARY KEY,
  orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'followup' | 'pagamento_pendente' | 'pedido_imprimir'
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notified_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (orcamento_id, tipo, user_id)
);
