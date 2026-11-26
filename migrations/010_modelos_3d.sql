-- Link 3D da laje para o cliente: o programa de laje grava o modelo (só geometria, nomes e quantidades — sem
-- preço nem dados pessoais) e o cliente abre /3d/<codigo>. Refazer o 3D do mesmo orçamento atualiza o mesmo código.
-- Rodar manualmente no SQL Editor do Supabase (não há tooling de migration automatizado neste projeto).
CREATE TABLE IF NOT EXISTS modelos_3d (
  id SERIAL PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,
  vendedor_id INTEGER,
  modelo JSONB NOT NULL,
  criado_em TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);
