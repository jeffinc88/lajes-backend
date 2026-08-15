const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const getUsers = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  try {
    const result = await pool.query('SELECT id, name, email, role, must_change_password FROM users ORDER BY name');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const SENHA_PADRAO = '123456';

const resetPassword = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const { id } = req.params;

  try {
    const hash = await bcrypt.hash(SENHA_PADRAO, 10);
    const result = await pool.query(
      'UPDATE users SET password = $1, must_change_password = true WHERE id = $2 RETURNING id',
      [hash, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ success: true, senhaPadrao: SENHA_PADRAO });
  } catch (e) {
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const createUser = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) return res.status(400).json({ error: 'Email já cadastrado.' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email, hash, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const deleteUser = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const updatePushToken = async (req, res) => {
  const { push_token } = req.body;
  if (!push_token) return res.status(400).json({ error: 'push_token é obrigatório.' });

  try {
    await pool.query('UPDATE users SET push_token = $1 WHERE id = $2', [push_token, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro interno.' });
  }
};

module.exports = { getUsers, createUser, deleteUser, resetPassword, updatePushToken };