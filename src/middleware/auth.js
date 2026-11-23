const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// Fábrica para os testes usarem um banco simulado; o app usa a do banco real (export padrão).
function criarAuth(pool) {
  return async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token não fornecido.' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Token inválido.' });
    }
    req.user = decoded;

    // Confere no banco a cada acesso: usuário excluído perde o acesso na hora (o token vale 7 dias).
    let usuario;
    try {
      const r = await pool.query('SELECT must_change_password FROM users WHERE id=$1', [decoded.id]);
      usuario = r.rows[0];
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Erro interno.' });
    }
    if (!usuario) return res.status(401).json({ error: 'Usuário não existe mais.' });

    // Login feito com senha temporária: só libera a troca de senha.
    // Confere no banco, porque depois da troca o mesmo token volta a valer.
    if (decoded.mcp && usuario.must_change_password && req.originalUrl.split('?')[0] !== '/auth/change-password') {
      return res.status(403).json({ error: 'Troque a senha temporária para continuar.', mustChangePassword: true });
    }
    next();
  };
}

module.exports = criarAuth(new Pool({ connectionString: process.env.DATABASE_URL }));
module.exports.criarAuth = criarAuth;
