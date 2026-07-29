const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const getTabelaJuros = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tabela_juros_parcelamento ORDER BY numero_parcelas');
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const updateTabelaJuros = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const linhas = req.body;
  if (!Array.isArray(linhas)) return res.status(400).json({ error: 'Formato inválido.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM tabela_juros_parcelamento');
    for (const linha of linhas) {
      const numeroParcelas = parseInt(linha.numero_parcelas, 10);
      const percentual = parseFloat(linha.percentual || 0);
      if (!numeroParcelas) continue;
      await client.query(
        'INSERT INTO tabela_juros_parcelamento (numero_parcelas, percentual) VALUES ($1, $2)',
        [numeroParcelas, percentual]
      );
    }
    await client.query('COMMIT');
    const result = await pool.query('SELECT * FROM tabela_juros_parcelamento ORDER BY numero_parcelas');
    res.json(result.rows);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  } finally {
    client.release();
  }
};

const getConfigPagamento = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM config_pagamento WHERE id=1');
    res.json(result.rows[0] || { id: 1, juros_adicional_boleto: 0, max_parcelas_boleto: 3 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const updateConfigPagamento = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const jurosAdicionalBoleto = parseFloat(req.body.juros_adicional_boleto || 0);
  const maxParcelasBoleto = parseInt(req.body.max_parcelas_boleto || 3, 10);
  try {
    const result = await pool.query(
      'UPDATE config_pagamento SET juros_adicional_boleto=$1, max_parcelas_boleto=$2 WHERE id=1 RETURNING *',
      [jurosAdicionalBoleto, maxParcelasBoleto]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

module.exports = { getTabelaJuros, updateTabelaJuros, getConfigPagamento, updateConfigPagamento };
