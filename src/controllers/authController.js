const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log('[DEBUG login] tentativa de login, email recebido:', JSON.stringify(email));
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    console.log('[DEBUG login] usuario encontrado no banco?', !!user);

    if (!user) return res.status(401).json({ error: 'Email ou senha incorretos.' });

    const valid = await bcrypt.compare(password, user.password);
    console.log('[DEBUG login] senha confere?', valid);
    if (!valid) return res.status(401).json({ error: 'Email ou senha incorretos.' });

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

module.exports = { login };