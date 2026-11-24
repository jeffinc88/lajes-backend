// Configuração do programa de laje (Windows): { de_para, perdas, limites }.
// Todo usuário logado lê (o programa baixa ao abrir); só o admin grava.
const { Pool } = require('pg');

const objeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const criarGet = (pool) => async (req, res) => {
  try {
    const r = await pool.query('SELECT dados, atualizado_em FROM config_programa WHERE id=1');
    const linha = r.rows[0];
    res.json({ dados: linha ? linha.dados : null, atualizado_em: linha ? linha.atualizado_em : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const criarPut = (pool) => async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const { de_para, perdas, limites } = req.body || {};
  if (!objeto(de_para) || !objeto(perdas) || !objeto(limites)) {
    return res.status(400).json({ error: 'Configuração incompleta (de_para, perdas e limites).' });
  }
  const dados = { de_para, perdas, limites };
  try {
    const r = await pool.query(
      `INSERT INTO config_programa (id, dados, atualizado_em, atualizado_por)
       VALUES (1, $1, NOW(), $2)
       ON CONFLICT (id) DO UPDATE SET dados=$1, atualizado_em=NOW(), atualizado_por=$2
       RETURNING dados, atualizado_em`,
      [JSON.stringify(dados), req.user.id]
    );
    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { criarGet, criarPut, getConfig: criarGet(pool), putConfig: criarPut(pool) };
