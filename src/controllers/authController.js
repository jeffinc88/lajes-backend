const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// mcp: entrou com senha temporária; o middleware bloqueia tudo até trocar.
const assinarToken = (user) => jwt.sign(
  { id: user.id, name: user.name, email: user.email, role: user.role, mcp: !!user.must_change_password },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);

const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) return res.status(401).json({ error: 'Email ou senha incorretos.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Email ou senha incorretos.' });

    const token = assinarToken(user);

    res.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role,
        mustChangePassword: user.must_change_password,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const changePassword = async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
  }

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = $1, must_change_password = false WHERE id = $2',
      [hash, req.user.id]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

// GET /auth/me: usuário atual do banco + token novo de 7 dias (o programa de laje confere o acesso
// e renova o login sem pedir a senha de novo).
const criarMe = (pool) => async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, name, email, role, must_change_password FROM users WHERE id = $1', [req.user.id]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'Usuário não existe mais.' });
    res.status(200).json({
      token: assinarToken(user),
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role,
        mustChangePassword: user.must_change_password,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const me = criarMe(pool);

module.exports = { login, changePassword, me, criarMe, assinarToken };