const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { buscarFechamentos, sincronizarPagamentoFechamento, ehAdmin, ehDoVendedor } = require('./fechamentosController');
const crm = require('../services/crmService');

// Campos de ligação com o CRM que o app envia junto com o orçamento
const camposCRM = (b, atual = {}) => {
  const pega = (k) => (b[k] !== undefined ? (b[k] || null) : (atual[k] ?? null));
  return {
    crm_profissional_id: pega('crm_profissional_id'),
    crm_obra_id: pega('crm_obra_id'),
    profissional_nome: pega('profissional_nome'),
    profissional_informado: pega('profissional_informado'),
    profissional_telefone: pega('profissional_telefone'),
  };
};

// Vendedor só mexe no que é dele; admin mexe em tudo.
// Retorna o orçamento, ou envia 404/403 e retorna null.
const carregarOrcamentoDoUsuario = async (req, res, id, executor = pool) => {
  const result = await executor.query('SELECT * FROM orcamentos WHERE id=$1', [id]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Orçamento não encontrado.' });
    return null;
  }
  if (!ehDoVendedor(req, result.rows[0])) {
    res.status(403).json({ error: 'Acesso negado.' });
    return null;
  }
  return result.rows[0];
};

const projetoEhDoUsuario = async (req, projetoId) => {
  if (!projetoId || ehAdmin(req)) return true;
  const result = await pool.query('SELECT vendedor FROM projetos WHERE id=$1', [projetoId]);
  return result.rows.length > 0 && ehDoVendedor(req, result.rows[0]);
};

const anexarParcelas = async (orcamentos) => {
  if (orcamentos.length === 0) return orcamentos;
  const ids = orcamentos.map(o => o.id);
  const result = await pool.query(
    'SELECT * FROM orcamento_parcelas WHERE orcamento_id = ANY($1::int[]) ORDER BY orcamento_id, numero',
    [ids]
  );
  const porOrcamento = {};
  result.rows.forEach(p => {
    if (!porOrcamento[p.orcamento_id]) porOrcamento[p.orcamento_id] = [];
    porOrcamento[p.orcamento_id].push(p);
  });
  return orcamentos.map(o => ({ ...o, parcelas: porOrcamento[o.id] || [] }));
};

const inserirParcelas = async (client, orcamentoId, parcelas) => {
  if (!Array.isArray(parcelas) || parcelas.length === 0) return;
  for (const p of parcelas) {
    await client.query(
      `INSERT INTO orcamento_parcelas (orcamento_id, numero, tipo, valor, vencimento_previsto, pago_em)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orcamentoId, p.numero, p.tipo, parseFloat(p.valor || 0), p.vencimento_previsto || null, p.pago_em || null]
    );
  }
};

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
    const comParcelas = await anexarParcelas(result.rows);
    const fechamentos = await buscarFechamentos(comParcelas.map(o => o.fechamento_id));
    res.json(comParcelas.map(o => (o.fechamento_id ? { ...o, fechamento: fechamentos[o.fechamento_id] || null } : o)));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const createOrcamento = async (req, res) => {
  const { cliente, itens, total, detalhamentos, frete, nota, validade, art, acrescimo, outrasDespesas, desconto, observacao, observacaoCliente, tipo_laje, margem, projeto_id, forma_pagamento, data_entrega_prevista, parcelas } = req.body;
  // Vendedor sempre cria em nome próprio; só o admin escolhe o vendedor.
  const vendedor = ehAdmin(req) && req.body.vendedor ? req.body.vendedor : { id: req.user.id, name: req.user.name };
  if (!(await projetoEhDoUsuario(req, projeto_id))) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  const crmCampos = camposCRM(req.body);
  if (!(await crm.profissionalPermitido(req.user, crmCampos.crm_profissional_id))) {
    return res.status(403).json({ error: 'Esse profissional não está na sua carteira do CRM.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO orcamentos
        (cliente, itens, total, detalhamentos, vendedor, frete, nota, validade, art, acrescimo, outras_despesas, desconto, observacao, observacao_cliente, tipo_laje, margem, projeto_id, forma_pagamento, data_entrega_prevista,
         crm_profissional_id, crm_obra_id, profissional_nome, profissional_informado, profissional_telefone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
       RETURNING *`,
      [
        JSON.stringify(cliente), JSON.stringify(itens), total,
        JSON.stringify(detalhamentos), JSON.stringify(vendedor),
        frete || 0, JSON.stringify(nota || null), validade || 30,
        art || 0, acrescimo || 0, outrasDespesas || 0, desconto || 0,
        observacao || '', observacaoCliente || '', tipo_laje || null, margem || 1.3, projeto_id || null,
        forma_pagamento || 'avista', data_entrega_prevista || null,
        crmCampos.crm_profissional_id, crmCampos.crm_obra_id, crmCampos.profissional_nome,
        crmCampos.profissional_informado, crmCampos.profissional_telefone,
      ]
    );
    let orcamento = result.rows[0];
    await inserirParcelas(client, orcamento.id, parcelas);
    await client.query('COMMIT');
    await crm.aoSalvarOrcamento(orcamento.id);
    orcamento = (await pool.query('SELECT * FROM orcamentos WHERE id=$1', [orcamento.id])).rows[0] || orcamento;
    const [comParcelas] = await anexarParcelas([orcamento]);
    res.status(201).json(comParcelas);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  } finally {
    client.release();
  }
};

const sincronizarPagamentoConfirmado = async (client, orcamentoId) => {
  const parcelas = await client.query('SELECT pago_em FROM orcamento_parcelas WHERE orcamento_id=$1', [orcamentoId]);
  if (parcelas.rows.length === 0) return;
  const todasPagas = parcelas.rows.every(p => p.pago_em);
  await client.query(
    'UPDATE orcamentos SET pagamento_confirmado_em=$1 WHERE id=$2',
    [todasPagas ? new Date().toISOString() : null, orcamentoId]
  );
};

const updateOrcamento = async (req, res) => {
  const { id } = req.params;
  const fields = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM orcamentos WHERE id=$1', [id]);
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Orcamento nao encontrado.' });
    }
    if (!ehDoVendedor(req, current.rows[0])) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    // Só o admin troca o vendedor do orçamento.
    if (!ehAdmin(req)) delete fields.vendedor;
    // Orçamento de um fechamento em conjunto: status e pagamento são do fechamento.
    const fechamentoId = current.rows[0].fechamento_id;
    if (fechamentoId && fields.status !== undefined && fields.status !== 'confirmado') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Este orçamento faz parte de um fechamento em conjunto. Desfaça o fechamento antes.' });
    }
    if (fechamentoId) {
      delete fields.pagamento_confirmado_em;
      delete fields.forma_pagamento;
      delete fields.parcelas;
    }
    const updated = { ...current.rows[0], ...fields };
    const crmCampos = camposCRM(fields, current.rows[0]);
    if (fields.crm_profissional_id !== undefined
        && String(fields.crm_profissional_id || '') !== String(current.rows[0].crm_profissional_id || '')
        && !(await crm.profissionalPermitido(req.user, crmCampos.crm_profissional_id))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Esse profissional não está na sua carteira do CRM.' });
    }
    // Trocou o profissional: a obra antiga do CRM deixa de valer para este orçamento
    if (String(crmCampos.crm_profissional_id || '') !== String(current.rows[0].crm_profissional_id || '')
        && fields.crm_obra_id === undefined) {
      crmCampos.crm_obra_id = null;
    }
    const outrasDespesas = parseFloat(fields.outrasDespesas ?? fields.outras_despesas ?? updated.outras_despesas ?? 0);
    const motivoPerda = fields.motivo_perda !== undefined ? fields.motivo_perda : updated.motivo_perda || null;
    const margem = parseFloat(fields.margem ?? updated.margem ?? 1.3);
    const desconto = parseFloat(fields.desconto ?? updated.desconto ?? 0);
    const frete = parseFloat(fields.frete ?? updated.frete ?? 0);
    const art = parseFloat(fields.art ?? updated.art ?? 0);
    const total = parseFloat(fields.total ?? updated.total ?? 0);
    const tipoLaje = fields.tipo_laje !== undefined ? fields.tipo_laje : updated.tipo_laje || null;
    const blingPedidoId = fields.bling_pedido_id !== undefined ? fields.bling_pedido_id : updated.bling_pedido_id || null;
    const observacaoCliente = fields.observacaoCliente ?? fields.observacao_cliente ?? updated.observacao_cliente ?? '';
    const pagamentoConfirmadoEm = fields.pagamento_confirmado_em !== undefined ? fields.pagamento_confirmado_em : updated.pagamento_confirmado_em || null;
    const formaPagamento = fields.forma_pagamento !== undefined ? fields.forma_pagamento : updated.forma_pagamento || 'avista';
    const dataEntregaPrevista = fields.data_entrega_prevista !== undefined ? fields.data_entrega_prevista : updated.data_entrega_prevista || null;
    let confirmadoEm = current.rows[0].confirmado_em || null;
    if (updated.status === 'confirmado') {
      confirmadoEm = fields.confirmado_em || confirmadoEm || new Date().toISOString();
    }
    await client.query(
      `UPDATE orcamentos SET
        cliente=$1, itens=$2, total=$3, detalhamentos=$4, status=$5, vendedor=$6,
        frete=$7, nota=$8, validade=$9, art=$10, acrescimo=$11, outras_despesas=$12,
        desconto=$13, observacao=$14, motivo_perda=$15, margem=$16, tipo_laje=$17, bling_pedido_id=$18, observacao_cliente=$19, pagamento_confirmado_em=$20,
        forma_pagamento=$21, data_entrega_prevista=$22, confirmado_em=$23,
        crm_profissional_id=$25, crm_obra_id=$26, profissional_nome=$27, profissional_informado=$28, profissional_telefone=$29
       WHERE id=$24`,
      [
        JSON.stringify(updated.cliente), JSON.stringify(updated.itens), total,
        JSON.stringify(updated.detalhamentos), updated.status, JSON.stringify(updated.vendedor),
        frete, JSON.stringify(updated.nota || null), updated.validade || 30,
        art, updated.acrescimo || 0, outrasDespesas, desconto,
        updated.observacao || '', motivoPerda, margem, tipoLaje, blingPedidoId, observacaoCliente, pagamentoConfirmadoEm,
        formaPagamento, dataEntregaPrevista, confirmadoEm, id,
        crmCampos.crm_profissional_id, crmCampos.crm_obra_id, crmCampos.profissional_nome,
        crmCampos.profissional_informado, crmCampos.profissional_telefone,
      ]
    );

    if (fields.parcelas !== undefined) {
      const existentes = await client.query('SELECT numero, pago_em FROM orcamento_parcelas WHERE orcamento_id=$1', [id]);
      const pagoPorNumero = {};
      existentes.rows.forEach(p => { pagoPorNumero[p.numero] = p.pago_em; });
      await client.query('DELETE FROM orcamento_parcelas WHERE orcamento_id=$1', [id]);
      const novasParcelas = (fields.parcelas || []).map(p => ({
        ...p,
        pago_em: p.pago_em !== undefined ? p.pago_em : (pagoPorNumero[p.numero] || null),
      }));
      await inserirParcelas(client, id, novasParcelas);
      await sincronizarPagamentoConfirmado(client, id);
    }

    await client.query('COMMIT');

    // CRM: obra Orçada; pedido confirmado entra na conciliação; confirmação desfeita sai.
    await crm.aoSalvarOrcamento(id);
    const estavaConfirmado = current.rows[0].status === 'confirmado';
    if (!fechamentoId && updated.status === 'confirmado') await crm.aoConfirmarOrcamento(id);
    else if (!fechamentoId && estavaConfirmado && updated.status !== 'confirmado') await crm.aoDesfazerPedido(id);

    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  } finally {
    client.release();
  }
};

const marcarParcelaPagamento = async (req, res) => {
  const { parcelaId } = req.params;
  const { pago } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!ehAdmin(req)) {
      // Dono = vendedor do orçamento da parcela, ou de todos os orçamentos do fechamento.
      const donos = await client.query(
        `SELECT o.vendedor FROM orcamento_parcelas p
           JOIN orcamentos o ON o.id = p.orcamento_id OR (p.fechamento_id IS NOT NULL AND o.fechamento_id = p.fechamento_id)
          WHERE p.id = $1`,
        [parcelaId]
      );
      if (donos.rows.length > 0 && donos.rows.some(o => !ehDoVendedor(req, o))) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Acesso negado.' });
      }
    }
    const parcela = await client.query(
      'UPDATE orcamento_parcelas SET pago_em=$1 WHERE id=$2 RETURNING orcamento_id, fechamento_id',
      [pago ? new Date().toISOString() : null, parcelaId]
    );
    if (parcela.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Parcela não encontrada.' });
    }
    if (parcela.rows[0].fechamento_id) {
      await sincronizarPagamentoFechamento(client, parcela.rows[0].fechamento_id);
    } else {
      await sincronizarPagamentoConfirmado(client, parcela.rows[0].orcamento_id);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  } finally {
    client.release();
  }
};

const marcarImpresso = async (req, res) => {
  const { id } = req.params;
  try {
    if (!(await carregarOrcamentoDoUsuario(req, res, id))) return;
    const result = await pool.query(
      'UPDATE orcamentos SET impresso_em = now() WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Orçamento não encontrado.' });
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const marcarFollowUpFeito = async (req, res) => {
  const { id } = req.params;
  try {
    if (!(await carregarOrcamentoDoUsuario(req, res, id))) return;
    const result = await pool.query(
      'UPDATE orcamentos SET followup_feito_em = now() WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Orçamento não encontrado.' });
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

const deleteOrcamento = async (req, res) => {
  const { id } = req.params;
  try {
    const membro = await carregarOrcamentoDoUsuario(req, res, id);
    if (!membro) return;
    if (membro.fechamento_id) {
      return res.status(409).json({ error: 'Este orçamento faz parte de um fechamento em conjunto. Desfaça o fechamento antes.' });
    }
    await pool.query('DELETE FROM orcamentos WHERE id=$1', [id]);
    if (membro.status === 'confirmado') await crm.aoDesfazerPedido(id);
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
  if (!ehAdmin(req)) return res.status(403).json({ error: 'Acesso negado.' });
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

module.exports = { getOrcamentos, createOrcamento, updateOrcamento, deleteOrcamento, getTiposLaje, getItemTiposLaje, updateItemTiposLaje, marcarParcelaPagamento, marcarImpresso, marcarFollowUpFeito };