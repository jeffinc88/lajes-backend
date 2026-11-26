// Link 3D da laje: POST /modelo3d (logado) grava o modelo e devolve {codigo, url}; GET /3d/:codigo (público)
// devolve a página. Reenviar com o código do próprio vendedor (ou admin) atualiza o mesmo link; código de outro
// vendedor vira link novo (não mexe no dele).
const crypto = require('crypto');
const { Pool } = require('pg');
const { montarHtml, PAGINA_404 } = require('../services/pagina3d');

const novoCodigo = () => crypto.randomBytes(16).toString('base64url');
const urlDe = (req, codigo) =>
  `${(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0]}://${req.get('host')}/3d/${codigo}`;

const criarSalvar = (pool) => async (req, res) => {
  const { modelo, codigo } = req.body || {};
  if (!modelo || typeof modelo !== 'object' || modelo.versao !== 1 || !Array.isArray(modelo.opcoes)) {
    return res.status(400).json({ error: 'Modelo 3D inválido.' });
  }
  const dados = JSON.stringify(modelo);
  try {
    if (typeof codigo === 'string' && codigo) {
      const r = await pool.query('SELECT vendedor_id FROM modelos_3d WHERE codigo=$1', [codigo]);
      const dono = r.rows[0];
      if (dono && (dono.vendedor_id === req.user.id || req.user.role === 'admin')) {
        await pool.query('UPDATE modelos_3d SET modelo=$2, atualizado_em=NOW() WHERE codigo=$1', [codigo, dados]);
        return res.json({ codigo, url: urlDe(req, codigo) });
      }
    }
    const novo = novoCodigo();
    await pool.query('INSERT INTO modelos_3d (codigo, vendedor_id, modelo) VALUES ($1, $2, $3)',
      [novo, req.user.id, dados]);
    res.json({ codigo: novo, url: urlDe(req, novo) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const criarPagina = (pool) => async (req, res) => {
  try {
    const r = await pool.query('SELECT modelo FROM modelos_3d WHERE codigo=$1', [req.params.codigo]);
    if (!r.rows[0]) return res.status(404).type('html').send(PAGINA_404);
    res.set('Cache-Control', 'no-cache').type('html').send(montarHtml(r.rows[0].modelo));
  } catch (e) {
    console.error(e);
    res.status(500).type('html').send('<!doctype html><meta charset="utf-8"><p>Erro ao abrir a laje. Tente de novo.</p>');
  }
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { criarSalvar, criarPagina, salvar: criarSalvar(pool), pagina: criarPagina(pool) };
