const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const getItems = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items ORDER BY categoria, nome');
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const createItem = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const { nome, unidade, preco, categoria } = req.body;

  if (!nome || !unidade || !preco || !categoria) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO items (nome, unidade, preco, categoria) VALUES ($1, $2, $3, $4) RETURNING *',
      [nome, unidade, preco, categoria]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const updateItem = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const { id } = req.params;
  const { nome, unidade, preco, categoria } = req.body;

  try {
    const result = await pool.query(
      'UPDATE items SET nome=$1, unidade=$2, preco=$3, categoria=$4 WHERE id=$5 RETURNING *',
      [nome, unidade, preco, categoria, id]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const deleteItem = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM items WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

module.exports = { getItems, createItem, updateItem, deleteItem };