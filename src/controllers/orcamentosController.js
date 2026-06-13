const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const getOrcamentos = async (req, res) => {
  try {
    let query;
    let params;

    if (req.user.role === 'admin') {
      query = 'SELECT * FROM orcamentos ORDER BY created_at DESC';
      params = [];
    } else {
      query = "SELECT * FROM orcamentos WHERE vendedor->>'id' = $1 ORDER BY created_at DESC";
      params = [req.user.id.toString()];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const createOrcamento = async (req, res) => {
  const { cliente, itens, total, detalhamentos, vendedor } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO orcamentos (cliente, itens, total, detalhamentos, vendedor) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [JSON.stringify(cliente), JSON.stringify(itens), total, JSON.stringify(detalhamentos), JSON.stringify(vendedor)]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const updateOrcamento = async (req, res) => {
  const { id } = req.params;
  const fields = req.body;

  try {
    const current = await pool.query('SELECT * FROM orcamentos WHERE id=$1', [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Orçamento não encontrado.' });

    const updated = { ...current.rows[0], ...fields };
    await pool.query(
      'UPDATE orcamentos SET cliente=$1, itens=$2, total=$3, detalhamentos=$4, status=$5, vendedor=$6 WHERE id=$7',
      [
        JSON.stringify(updated.cliente),
        JSON.stringify(updated.itens),
        updated.total,
        JSON.stringify(updated.detalhamentos),
        updated.status,
        JSON.stringify(updated.vendedor),
        id,
      ]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const deleteOrcamento = async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM orcamentos WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

module.exports = { getOrcamentos, createOrcamento, updateOrcamento, deleteOrcamento };