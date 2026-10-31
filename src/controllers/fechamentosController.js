const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { criarPedidoVenda, excluirPedidoVenda } = require('../services/blingService');

// Fechamento em conjunto: vários orçamentos do mesmo projeto fechados de uma vez,
// com uma forma de pagamento, um desconto sobre o total e um pedido no Bling.
// Os orçamentos do grupo ficam confirmados e sincronizados com o fechamento.

const parseJSON = (val) => {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
};

const ehAdmin = (req) => req.user.role === 'admin';
const ehDoVendedor = (req, orcamento) =>
  ehAdmin(req) || String((parseJSON(orcamento.vendedor) || {}).id) === String(req.user.id);

const arredondar = (valor) => Math.round((parseFloat(valor) || 0) * 100) / 100;

// Busca fechamentos já com as parcelas e os ids dos orçamentos do grupo.
// Usado também por orcamentosController e projetosController para anexar aos dados.
const buscarFechamentos = async (ids, executor = pool) => {
  const unicos = [...new Set((ids || []).filter(Boolean).map(Number))];
  if (unicos.length === 0) return {};
  const [fechamentos, parcelas, membros] = await Promise.all([
    executor.query('SELECT * FROM fechamentos WHERE id = ANY($1::int[])', [unicos]),
    executor.query(
      'SELECT * FROM orcamento_parcelas WHERE fechamento_id = ANY($1::int[]) ORDER BY fechamento_id, numero',
      [unicos]
    ),
    executor.query(
      'SELECT id, fechamento_id FROM orcamentos WHERE fechamento_id = ANY($1::int[]) ORDER BY id',
      [unicos]
    ),
  ]);
  const porId = {};
  fechamentos.rows.forEach(f => { porId[f.id] = { ...f, parcelas: [], orcamento_ids: [] }; });
  parcelas.rows.forEach(p => { if (porId[p.fechamento_id]) porId[p.fechamento_id].parcelas.push(p); });
  membros.rows.forEach(o => { if (porId[o.fechamento_id]) porId[o.fechamento_id].orcamento_ids.push(o.id); });
  return porId;
};

// Marca o fechamento (e os orçamentos dele) como pago quando todas as parcelas estão quitadas.
const sincronizarPagamentoFechamento = async (client, fechamentoId) => {
  if (!fechamentoId) return;
  const parcelas = await client.query('SELECT pago_em FROM orcamento_parcelas WHERE fechamento_id=$1', [fechamentoId]);
  if (parcelas.rows.length === 0) return;
  const todasPagas = parcelas.rows.every(p => p.pago_em);
  await definirPagamentoFechamento(client, fechamentoId, todasPagas ? new Date().toISOString() : null);
};

const definirPagamentoFechamento = async (client, fechamentoId, pagoEm) => {
  await client.query('UPDATE fechamentos SET pagamento_confirmado_em=$1 WHERE id=$2', [pagoEm, fechamentoId]);
  await client.query('UPDATE orcamentos SET pagamento_confirmado_em=$1 WHERE fechamento_id=$2', [pagoEm, fechamentoId]);
};

// Junta os orçamentos do grupo num "orçamento" só, no formato que o blingService espera.
// Frete vai já com a margem de cada orçamento (cada um pode ter margem diferente).
const montarOrcamentoBling = (fechamento, membros) => {
  const somar = (campo) => membros.reduce((t, o) => t + (parseFloat(o[campo]) || 0), 0);
  const notas = membros.map(o => parseJSON(o.nota)).filter(Boolean);
  return {
    id: fechamento.id,
    referencia_bling: `Fechamento Nº ${fechamento.id} (Orçamentos Nº ${membros.map(o => o.id).join(', ')})`,
    cliente: parseJSON(fechamento.cliente) || parseJSON(membros[0].cliente),
    itens: membros.flatMap(o => parseJSON(o.itens) || []),
    frete: arredondar(membros.reduce((t, o) => t + (parseFloat(o.frete) || 0) * (parseFloat(o.margem) || 1.3), 0)),
    margem: 1,
    desconto: arredondar(somar('desconto') + (parseFloat(fechamento.desconto) || 0)),
    outras_despesas: arredondar(somar('outras_despesas')),
    art: arredondar(somar('art')),
    nota: { tipo: [...new Set(notas.map(n => n.tipo).filter(Boolean))].join('/'), valor: arredondar(notas.reduce((t, n) => t + (parseFloat(n.valor) || 0), 0)) },
    observacao: membros.map(o => o.observacao).filter(Boolean).join(' | '),
    tipo_laje: membros.map(o => o.tipo_laje).filter(Boolean).join(' + '),
  };
};

// Cria (ou recria) o pedido do fechamento no Bling e guarda o id.
// Falha do Bling não desfaz o fechamento: devolve a mensagem para o app avisar.
const enviarAoBling = async (fechamentoId) => {
  const fechamento = (await pool.query('SELECT * FROM fechamentos WHERE id=$1', [fechamentoId])).rows[0];
  const membros = (await pool.query('SELECT * FROM orcamentos WHERE fechamento_id=$1 ORDER BY id', [fechamentoId])).rows;
  if (!fechamento || membros.length === 0) throw new Error('Fechamento não encontrado.');
  if (fechamento.bling_pedido_id) {
    try { await excluirPedidoVenda(fechamento.bling_pedido_id); } catch (e) { console.log('Falha ao excluir pedido antigo do Bling:', e.message); }
  }
  const pedidoId = await criarPedidoVenda(montarOrcamentoBling(fechamento, membros));
  await pool.query('UPDATE fechamentos SET bling_pedido_id=$1 WHERE id=$2', [pedidoId ? String(pedidoId) : null, fechamentoId]);
  return pedidoId;
};

// POST /fechamentos
// { projeto_id, orcamento_ids, forma_pagamento, desconto, data_entrega_prevista, confirmado_em, parcelas }
const createFechamento = async (req, res) => {
  const { projeto_id, orcamento_ids, forma_pagamento, desconto, data_entrega_prevista, confirmado_em, parcelas } = req.body;
  const ids = [...new Set((orcamento_ids || []).map(Number).filter(Boolean))];
  if (!projeto_id) return res.status(400).json({ error: 'Informe o projeto.' });
  if (ids.length < 2) return res.status(400).json({ error: 'Selecione ao menos 2 orçamentos para fechar em conjunto.' });

  const client = await pool.connect();
  let blingAntigos = [];
  let fechamentoId;
  try {
    await client.query('BEGIN');
    const membros = (await client.query(
      'SELECT * FROM orcamentos WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
      [ids]
    )).rows;

    let erro = null;
    if (membros.length !== ids.length) erro = 'Algum orçamento selecionado não existe mais.';
    else if (membros.some(o => String(o.projeto_id) !== String(projeto_id))) erro = 'Só dá para juntar orçamentos do mesmo projeto.';
    else if (membros.some(o => o.fechamento_id)) erro = 'Algum orçamento já faz parte de outro fechamento.';
    else if (membros.some(o => o.status !== 'rascunho' && o.status !== 'aberto')) erro = 'Só dá para juntar orçamentos em aberto.';
    else if (membros.some(o => !ehDoVendedor(req, o))) erro = 'Acesso negado.';
    if (erro) {
      await client.query('ROLLBACK');
      return res.status(erro === 'Acesso negado.' ? 403 : 400).json({ error: erro });
    }

    const subtotal = arredondar(membros.reduce((t, o) => t + (parseFloat(o.total) || 0), 0));
    const valorDesconto = arredondar(desconto);
    if (valorDesconto < 0 || valorDesconto >= subtotal) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Desconto inválido.' });
    }
    const confirmadoEm = confirmado_em || new Date().toISOString();
    const forma = forma_pagamento || 'avista';

    const fechamento = (await client.query(
      `INSERT INTO fechamentos
        (projeto_id, cliente, vendedor, forma_pagamento, data_entrega_prevista, subtotal, desconto, total, confirmado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        projeto_id, JSON.stringify(parseJSON(membros[0].cliente)), JSON.stringify(parseJSON(membros[0].vendedor)),
        forma, data_entrega_prevista || null, subtotal, valorDesconto, arredondar(subtotal - valorDesconto), confirmadoEm,
      ]
    )).rows[0];
    fechamentoId = fechamento.id;

    // Pedidos individuais que algum orçamento tivesse no Bling dão lugar ao pedido do fechamento.
    blingAntigos = membros.map(o => o.bling_pedido_id).filter(Boolean);
    await client.query(
      `UPDATE orcamentos SET
        fechamento_id=$1, status='confirmado', confirmado_em=$2, forma_pagamento=$3,
        data_entrega_prevista=COALESCE($4, data_entrega_prevista), pagamento_confirmado_em=NULL, bling_pedido_id=NULL
       WHERE id = ANY($5::int[])`,
      [fechamento.id, confirmadoEm, forma, data_entrega_prevista || null, ids]
    );
    await client.query('DELETE FROM orcamento_parcelas WHERE orcamento_id = ANY($1::int[])', [ids]);

    if (forma !== 'avista') {
      for (const p of parcelas || []) {
        await client.query(
          `INSERT INTO orcamento_parcelas (fechamento_id, numero, tipo, valor, vencimento_previsto)
           VALUES ($1, $2, $3, $4, $5)`,
          [fechamento.id, p.numero, p.tipo, parseFloat(p.valor || 0), p.vencimento_previsto || null]
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ error: 'Erro interno.' });
  } finally {
    client.release();
  }

  for (const pedidoId of blingAntigos) {
    try { await excluirPedidoVenda(pedidoId); } catch (e) { console.log('Falha ao excluir pedido do Bling:', e.message); }
  }

  let blingErro = null;
  try {
    await enviarAoBling(fechamentoId);
  } catch (e) {
    blingErro = e.message;
    console.log('Falha Bling (fechamento):', e.message);
  }

  try {
    const fechamentos = await buscarFechamentos([fechamentoId]);
    res.status(201).json({ ...fechamentos[fechamentoId], bling_erro: blingErro });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

// POST /fechamentos/:id/bling — reenviar quando a primeira tentativa falhou.
const reenviarBling = async (req, res) => {
  const { id } = req.params;
  try {
    const membro = (await pool.query('SELECT vendedor FROM orcamentos WHERE fechamento_id=$1 LIMIT 1', [id])).rows[0];
    if (!membro) return res.status(404).json({ error: 'Fechamento não encontrado.' });
    if (!ehDoVendedor(req, membro)) return res.status(403).json({ error: 'Acesso negado.' });
    const pedidoId = await enviarAoBling(id);
    res.json({ success: true, pedido_id: pedidoId });
  } catch (e) {
    console.error('Erro ao enviar fechamento ao Bling:', e);
    res.status(500).json({ error: e.message });
  }
};

// PUT /fechamentos/:id/pagamento { pagamento_confirmado_em } — à vista: marcar ou desfazer.
const marcarPagamento = async (req, res) => {
  const { id } = req.params;
  const { pagamento_confirmado_em } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const membro = (await client.query('SELECT vendedor FROM orcamentos WHERE fechamento_id=$1 LIMIT 1', [id])).rows[0];
    if (!membro) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Fechamento não encontrado.' });
    }
    if (!ehDoVendedor(req, membro)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    await definirPagamentoFechamento(client, id, pagamento_confirmado_em || null);
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

// DELETE /fechamentos/:id — desfaz o grupo. Os orçamentos voltam a ficar em aberto.
// Bloqueado se já houver pagamento registrado, para não perder esse histórico.
const deleteFechamento = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  let blingPedidoId = null;
  try {
    await client.query('BEGIN');
    const fechamento = (await client.query('SELECT * FROM fechamentos WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!fechamento) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Fechamento não encontrado.' });
    }
    const membros = (await client.query('SELECT id, vendedor FROM orcamentos WHERE fechamento_id=$1', [id])).rows;
    if (membros.some(o => !ehDoVendedor(req, o))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    const pagas = await client.query('SELECT 1 FROM orcamento_parcelas WHERE fechamento_id=$1 AND pago_em IS NOT NULL LIMIT 1', [id]);
    if (fechamento.pagamento_confirmado_em || pagas.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Este fechamento já tem pagamento registrado. Desfaça os pagamentos antes de separar os orçamentos.' });
    }
    blingPedidoId = fechamento.bling_pedido_id;
    await client.query(
      `UPDATE orcamentos SET fechamento_id=NULL, status='rascunho', pagamento_confirmado_em=NULL, bling_pedido_id=NULL
       WHERE fechamento_id=$1`,
      [id]
    );
    await client.query('DELETE FROM fechamentos WHERE id=$1', [id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return res.status(500).json({ error: 'Erro interno.' });
  } finally {
    client.release();
  }

  if (blingPedidoId) {
    try { await excluirPedidoVenda(blingPedidoId); } catch (e) { console.log('Falha ao excluir pedido do Bling:', e.message); }
  }
  res.json({ success: true });
};

module.exports = {
  createFechamento, reenviarBling, marcarPagamento, deleteFechamento,
  buscarFechamentos, sincronizarPagamentoFechamento,
};
