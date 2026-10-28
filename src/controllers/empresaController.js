const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const getEmpresa = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM config_empresa WHERE id=1');
    res.json(result.rows[0] || { id: 1 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const updateEmpresa = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const { razao_social, cnpj, telefone, endereco, cidade, email } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO config_empresa (id, razao_social, cnpj, telefone, endereco, cidade, email)
       VALUES (1, $1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         razao_social=$1, cnpj=$2, telefone=$3, endereco=$4, cidade=$5, email=$6
       RETURNING *`,
      [razao_social || null, cnpj || null, telefone || null, endereco || null, cidade || null, email || null]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

module.exports = { getEmpresa, updateEmpresa };
