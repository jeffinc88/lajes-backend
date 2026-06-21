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
  const { cliente, itens, total, detalhamentos, vendedor, frete, nota, validade, art, acrescimo, outrasDespesas, desconto, observacao } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO orcamentos 
        (cliente, itens, total, detalhamentos, vendedor, frete, nota, validade, art, acrescimo, outras_despesas, desconto, observacao) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
       RETURNING *`,
      [
        JSON.stringify(cliente),
        JSON.stringify(itens),
        total,
        JSON.stringify(detalhamentos),
        JSON.stringify(vendedor),
        frete || 0,
        JSON.stringify(nota || null),
        validade || 30,
        art || 0,
        acrescimo || 0,
        outrasDespesas || 0,
        desconto || 0,
        observacao || '',
      ]
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

    // Normalizar camelCase para snake_case
    const outrasDespesas = fields.outrasDespesas !== undefined ? fields.outrasDespesas : (fields.outras_despesas !== undefined ? fields.outras_despesas : updated.outras_despesas || 0);
    const motivoPerda = fields.motivo_perda !== undefined ? fields.motivo_perda : updated.motivo_perda || null;
    const margem = fields.margem !== undefined ? fields.margem : updated.margem || 1.3;

    await pool.query(
      `UPDATE orcamentos SET 
        cliente=$1, itens=$2, total=$3, detalhamentos=$4, status=$5, vendedor=$6, 
        frete=$7, nota=$8, validade=$9, art=$10, acrescimo=$11, outras_despesas=$12, 
        desconto=$13, observacao=$14, motivo_perda=$15, margem=$16
       WHERE id=$17`,
      [
        JSON.stringify(updated.cliente),
        JSON.stringify(updated.itens),
        updated.total,
        JSON.stringify(updated.detalhamentos),
        updated.status,
        JSON.stringify(updated.vendedor),
        updated.frete || 0,
        JSON.stringify(updated.nota || null),
        updated.validade || 30,
        updated.art || 0,
        updated.acrescimo || 0,
        outrasDespesas,
        updated.desconto || 0,
        updated.observacao || '',
        motivoPerda,
        margem,
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