const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const getProjetos = async (req, res) => {
  try {
    let query, params;
    if (req.user.role === 'admin') {
      query = 'SELECT * FROM projetos ORDER BY created_at DESC';
      params = [];
    } else {
      query = "SELECT * FROM projetos WHERE vendedor->>'id' = $1 ORDER BY created_at DESC";
      params = [req.user.id.toString()];
    }
    const projetos = await pool.query(query, params);
    // Buscar orçamentos de cada projeto
    const orcamentos = await pool.query('SELECT * FROM orcamentos WHERE projeto_id IS NOT NULL ORDER BY created_at ASC');
    const orcamentosPorProjeto = {};
    orcamentos.rows.forEach(o => {
      if (!orcamentosPorProjeto[o.projeto_id]) orcamentosPorProjeto[o.projeto_id] = [];
      orcamentosPorProjeto[o.projeto_id].push(o);
    });
    const result = projetos.rows.map(p => ({
      ...p,
      orcamentos: orcamentosPorProjeto[p.id] || [],
    }));
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const createProjeto = async (req, res) => {
  const { cliente, vendedor } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO projetos (cliente, vendedor) VALUES ($1, $2) RETURNING *',
      [JSON.stringify(cliente), JSON.stringify(vendedor)]
    );
    res.status(201).json({ ...result.rows[0], orcamentos: [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const updateProjeto = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await pool.query('UPDATE projetos SET status=$1 WHERE id=$2', [status, id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const deleteProjeto = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM orcamentos WHERE projeto_id=$1', [id]);
    await pool.query('DELETE FROM projetos WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

module.exports = { getProjetos, createProjeto, updateProjeto, deleteProjeto };