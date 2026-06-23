const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const getOrcamentos = async (req, res) => {
  try {
    let query, params;
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
  const { cliente, itens, total, detalhamentos, vendedor, frete, nota, validade, art, acrescimo, outrasDespesas, desconto, observacao, tipo_laje, margem, projeto_id } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO orcamentos 
        (cliente, itens, total, detalhamentos, vendedor, frete, nota, validade, art, acrescimo, outras_despesas, desconto, observacao, tipo_laje, margem, projeto_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
       RETURNING *`,
      [
        JSON.stringify(cliente), JSON.stringify(itens), total,
        JSON.stringify(detalhamentos), JSON.stringify(vendedor),
        frete || 0, JSON.stringify(nota || null), validade || 30,
        art || 0, acrescimo || 0, outrasDespesas || 0, desconto || 0,
        observacao || '', tipo_laje || null, margem || 1.3, projeto_id || null,
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
    if (current.rows.length === 0) return res.status(404).json({ error: 'Orcamento nao encontrado.' });
    const updated = { ...current.rows[0], ...fields };
    const outrasDespesas = parseFloat(fields.outrasDespesas ?? fields.outras_despesas ?? updated.outras_despesas ?? 0);
    const motivoPerda = fields.motivo_perda !== undefined ? fields.motivo_perda : updated.motivo_perda || null;
    const margem = parseFloat(fields.margem ?? updated.margem ?? 1.3);
    const desconto = parseFloat(fields.desconto ?? updated.desconto ?? 0);
    const frete = parseFloat(fields.frete ?? updated.frete ?? 0);
    const art = parseFloat(fields.art ?? updated.art ?? 0);
    const total = parseFloat(fields.total ?? updated.total ?? 0);
    const tipoLaje = fields.tipo_laje !== undefined ? fields.tipo_laje : updated.tipo_laje || null;
    await pool.query(
      `UPDATE orcamentos SET 
        cliente=$1, itens=$2, total=$3, detalhamentos=$4, status=$5, vendedor=$6, 
        frete=$7, nota=$8, validade=$9, art=$10, acrescimo=$11, outras_despesas=$12, 
        desconto=$13, observacao=$14, motivo_perda=$15, margem=$16, tipo_laje=$17
       WHERE id=$18`,
      [
        JSON.stringify(updated.cliente), JSON.stringify(updated.itens), total,
        JSON.stringify(updated.detalhamentos), updated.status, JSON.stringify(updated.vendedor),
        frete, JSON.stringify(updated.nota || null), updated.validade || 30,
        art, updated.acrescimo || 0, outrasDespesas, desconto,
        updated.observacao || '', motivoPerda, margem, tipoLaje, id,
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

const getTiposLaje = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tipos_laje ORDER BY id');
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const getItemTiposLaje = async (req, res) => {
  try {
    const result = await pool.query('SELECT item_id, tipo_laje_id FROM item_tipos_laje');
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const updateItemTiposLaje = async (req, res) => {
  const { id } = req.params;
  const { tipo_laje_ids } = req.body;
  try {
    await pool.query('DELETE FROM item_tipos_laje WHERE item_id=$1', [id]);
    if (tipo_laje_ids && tipo_laje_ids.length > 0) {
      for (const tipoId of tipo_laje_ids) {
        await pool.query('INSERT INTO item_tipos_laje (item_id, tipo_laje_id) VALUES ($1, $2)', [id, tipoId]);
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

module.exports = { getOrcamentos, createOrcamento, updateOrcamento, deleteOrcamento, getTiposLaje, getItemTiposLaje, updateItemTiposLaje };