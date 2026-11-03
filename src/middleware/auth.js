const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
  req.user = decoded;

  // Login feito com senha temporária: só libera a troca de senha.
  // Confere no banco, porque depois da troca o mesmo token volta a valer.
  if (decoded.mcp && req.originalUrl.split('?')[0] !== '/auth/change-password') {
    try {
      const r = await pool.query('SELECT must_change_password FROM users WHERE id=$1', [decoded.id]);
      if (r.rows.length === 0) return res.status(401).json({ error: 'Token inválido.' });
      if (r.rows[0].must_change_password) {
        return res.status(403).json({ error: 'Troque a senha temporária para continuar.', mustChangePassword: true });
      }
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Erro interno.' });
    }
  }
  next();
};
