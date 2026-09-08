const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Helpers ────────────────────────────────────────────────────────────────

// Data de hoje no fuso da fábrica, calculada no banco para não depender do
// timezone do container onde o servidor está rodando.
const hojeSP = async (executor = pool) => {
  const result = await executor.query(
    "SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS hoje"
  );
  return result.rows[0].hoje;
};

// Nome normalizado, para juntar "Abner Jireh", "abner jireh" e "Abner  Jireh".
const chaveCliente = (nome) =>
  String(nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

const diasEntre = (de, ate) =>
  Math.round((new Date(`${ate}T12:00:00`) - new Date(`${de}T12:00:00`)) / 86400000);

const paraISO = (valor) => {
  if (!valor) return null;
  if (valor instanceof Date) {
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    const dia = String(valor.getDate()).padStart(2, '0');
    return `${valor.getFullYear()}-${mes}-${dia}`;
  }
  const texto = String(valor).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
};

const somar = (linhas) => linhas.reduce((total, l) => total + (parseFloat(l.valor) || 0), 0);

// Marca o orçamento como pago quando todas as parcelas estão quitadas.
// Mesma regra usada em orcamentosController.
const sincronizarPagamentoConfirmado = async (client, orcamentoId) => {
  if (!orcamentoId) return;
  const parcelas = await client.query('SELECT pago_em FROM orcamento_parcelas WHERE orcamento_id=$1', [orcamentoId]);
  if (parcelas.rows.length === 0) return;
  const todasPagas = parcelas.rows.every(p => p.pago_em);
  await client.query(
    'UPDATE orcamentos SET pagamento_confirmado_em=$1 WHERE id=$2',
    [todasPagas ? new Date().toISOString() : null, orcamentoId]
  );
};

// Vendedor só enxerga o que é dele; admin enxerga tudo.
const ehAdmin = (req) => req.user.role === 'admin';

const buscarPromessa = async (id) => {
  const result = await pool.query('SELECT * FROM promessas_pagamento WHERE id=$1', [id]);
  return result.rows[0] || null;
};

const podeMexer = (req, promessa) =>
  ehAdmin(req) || String(promessa.vendedor_id || '') === String(req.user.id);

// ─── Painel de recebimento ──────────────────────────────────────────────────

// GET /recebimento/pendencias
// Devolve, em um pedido só, tudo que o painel precisa mostrar:
//   semPrevisao — venda confirmada que não tem data de pagamento nenhuma
//   promessas   — o combinado do WhatsApp, separado em atrasadas / hoje / próximos
//   parcelas    — boletos e parcelas com vencimento, nas mesmas três faixas
const getPendencias = async (req, res) => {
  try {
    const hoje = await hojeSP();
    const filtrarPorVendedor = !ehAdmin(req);
    const vendedorId = req.user.id.toString();

    const semPrevisao = await pool.query(
      `SELECT o.id,
              o.cliente->>'nome'    AS cliente_nome,
              o.vendedor->>'nome'   AS vendedor_nome,
              o.vendedor->>'id'     AS vendedor_id,
              o.total,
              o.forma_pagamento,
              o.confirmado_em,
              o.created_at,
              COUNT(p.id)                                              AS parcelas_total,
              COUNT(p.id) FILTER (WHERE p.vencimento_previsto IS NULL) AS parcelas_sem_data,
              EXISTS (
                SELECT 1 FROM promessas_pagamento pr
                WHERE pr.orcamento_id = o.id AND pr.status = 'pendente'
              ) AS tem_promessa
         FROM orcamentos o
         LEFT JOIN orcamento_parcelas p ON p.orcamento_id = o.id
        WHERE o.status = 'confirmado'
          AND o.pagamento_confirmado_em IS NULL
          ${filtrarPorVendedor ? "AND o.vendedor->>'id' = $1" : ''}
        GROUP BY o.id
       HAVING COUNT(p.id) = 0
           OR COUNT(p.id) FILTER (WHERE p.vencimento_previsto IS NULL) > 0
        ORDER BY COALESCE(o.confirmado_em, o.created_at) DESC`,
      filtrarPorVendedor ? [vendedorId] : []
    );

    const promessas = await pool.query(
      `SELECT pr.*,
              o.cliente->>'nome' AS orcamento_cliente,
              o.total            AS orcamento_total
         FROM promessas_pagamento pr
         LEFT JOIN orcamentos o ON o.id = pr.orcamento_id
        WHERE pr.status = 'pendente'
          ${filtrarPorVendedor ? 'AND pr.vendedor_id = $1' : ''}
        ORDER BY pr.data_promessa NULLS LAST, pr.id`,
      filtrarPorVendedor ? [req.user.id] : []
    );

    const parcelas = await pool.query(
      `SELECT p.id AS parcela_id, p.orcamento_id, p.numero, p.tipo, p.valor, p.vencimento_previsto,
              o.cliente->>'nome'  AS cliente_nome,
              o.vendedor->>'nome' AS vendedor_nome
         FROM orcamento_parcelas p
         JOIN orcamentos o ON o.id = p.orcamento_id
        WHERE p.pago_em IS NULL
          AND p.vencimento_previsto IS NOT NULL
          AND o.status = 'confirmado'
          ${filtrarPorVendedor ? "AND o.vendedor->>'id' = $1" : ''}
        ORDER BY p.vencimento_previsto, p.orcamento_id, p.numero`,
      filtrarPorVendedor ? [vendedorId] : []
    );

    const separar = (linhas, campoData) => {
      const faixas = { atrasadas: [], venceHoje: [], proximos: [], semData: [] };
      linhas.forEach((linha) => {
        const data = paraISO(linha[campoData]);
        if (!data) { faixas.semData.push({ ...linha, dias: null }); return; }
        const dias = diasEntre(hoje, data);
        const item = { ...linha, dias };
        if (dias < 0) faixas.atrasadas.push(item);
        else if (dias === 0) faixas.venceHoje.push(item);
        else faixas.proximos.push(item);
      });
      faixas.atrasadas.sort((a, b) => a.dias - b.dias);
      return faixas;
    };

    const promessasSeparadas = separar(promessas.rows, 'data_promessa');
    const parcelasSeparadas = separar(parcelas.rows, 'vencimento_previsto');

    res.json({
      hoje,
      semPrevisao: semPrevisao.rows,
      promessas: promessasSeparadas,
      parcelas: parcelasSeparadas,
      totais: {
        sem_previsao_qtd: semPrevisao.rows.length,
        sem_previsao_valor: semPrevisao.rows.reduce((t, o) => t + (parseFloat(o.total) || 0), 0),
        promessas_atrasadas_qtd: promessasSeparadas.atrasadas.length,
        promessas_atrasadas_valor: somar(promessasSeparadas.atrasadas),
        promessas_hoje_qtd: promessasSeparadas.venceHoje.length,
        promessas_hoje_valor: somar(promessasSeparadas.venceHoje),
        parcelas_atrasadas_qtd: parcelasSeparadas.atrasadas.length,
        parcelas_atrasadas_valor: somar(parcelasSeparadas.atrasadas),
        parcelas_hoje_qtd: parcelasSeparadas.venceHoje.length,
        parcelas_hoje_valor: somar(parcelasSeparadas.venceHoje),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

// ─── Promessas ──────────────────────────────────────────────────────────────

// GET /recebimento/promessas?status=&cliente=&orcamento_id=
const getPromessas = async (req, res) => {
  try {
    const filtros = [];
    const params = [];
    if (!ehAdmin(req)) { params.push(req.user.id); filtros.push(`pr.vendedor_id = $${params.length}`); }
    if (req.query.status) { params.push(req.query.status); filtros.push(`pr.status = $${params.length}`); }
    if (req.query.orcamento_id) { params.push(parseInt(req.query.orcamento_id, 10)); filtros.push(`pr.orcamento_id = $${params.length}`); }
    if (req.query.cliente) { params.push(`%${chaveCliente(req.query.cliente)}%`); filtros.push(`pr.cliente_chave LIKE $${params.length}`); }

    const result = await pool.query(
      `SELECT pr.*, o.cliente->>'nome' AS orcamento_cliente, o.total AS orcamento_total
         FROM promessas_pagamento pr
         LEFT JOIN orcamentos o ON o.id = pr.orcamento_id
        ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''}
        ORDER BY pr.data_promessa DESC NULLS LAST, pr.id DESC`,
      params
    );
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

// POST /recebimento/promessas
const createPromessa = async (req, res) => {
  const {
    cliente_nome, vendedor_id, vendedor_nome, valor, data_promessa,
    trecho, observacao, origem, confianca, orcamento_id, parcela_id, renegociacao_de,
  } = req.body;

  if (!cliente_nome || !String(cliente_nome).trim()) {
    return res.status(400).json({ error: 'Informe o cliente.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO promessas_pagamento
         (orcamento_id, parcela_id, cliente_nome, cliente_chave, vendedor_id, vendedor_nome,
          valor, data_promessa, trecho, observacao, origem, confianca, renegociacao_de, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        orcamento_id || null,
        parcela_id || null,
        String(cliente_nome).trim(),
        chaveCliente(cliente_nome),
        vendedor_id || (ehAdmin(req) ? null : req.user.id),
        vendedor_nome || null,
        valor === '' || valor === undefined || valor === null ? null : parseFloat(valor),
        paraISO(data_promessa),
        trecho || null,
        observacao || null,
        origem === 'conversa' ? 'conversa' : 'manual',
        confianca || null,
        renegociacao_de || null,
        req.user.id,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

// PUT /recebimento/promessas/:id
const updatePromessa = async (req, res) => {
  try {
    const promessa = await buscarPromessa(req.params.id);
    if (!promessa) return res.status(404).json({ error: 'Promessa não encontrada.' });
    if (!podeMexer(req, promessa)) return res.status(403).json({ error: 'Acesso negado.' });

    const {
      cliente_nome, vendedor_id, vendedor_nome, valor, data_promessa,
      trecho, observacao, orcamento_id, parcela_id,
    } = req.body;

    const nome = cliente_nome !== undefined ? String(cliente_nome).trim() : promessa.cliente_nome;

    const result = await pool.query(
      `UPDATE promessas_pagamento SET
         cliente_nome=$1, cliente_chave=$2, vendedor_id=$3, vendedor_nome=$4,
         valor=$5, data_promessa=$6, trecho=$7, observacao=$8, orcamento_id=$9, parcela_id=$10
       WHERE id=$11 RETURNING *`,
      [
        nome,
        chaveCliente(nome),
        vendedor_id !== undefined ? vendedor_id : promessa.vendedor_id,
        vendedor_nome !== undefined ? vendedor_nome : promessa.vendedor_nome,
        valor === '' || valor === null ? null : (valor !== undefined ? parseFloat(valor) : promessa.valor),
        data_promessa !== undefined ? paraISO(data_promessa) : promessa.data_promessa,
        trecho !== undefined ? trecho : promessa.trecho,
        observacao !== undefined ? observacao : promessa.observacao,
        orcamento_id !== undefined ? orcamento_id : promessa.orcamento_id,
        parcela_id !== undefined ? parcela_id : promessa.parcela_id,
        promessa.id,
      ]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

// POST /recebimento/promessas/:id/pago
// Se a promessa estiver amarrada a uma parcela, a parcela é baixada junto —
// é isso que evita ter que dar a mesma baixa em dois lugares.
const marcarPaga = async (req, res) => {
  const client = await pool.connect();
  try {
    const promessa = await buscarPromessa(req.params.id);
    if (!promessa) return res.status(404).json({ error: 'Promessa não encontrada.' });
    if (!podeMexer(req, promessa)) return res.status(403).json({ error: 'Acesso negado.' });

    const quando = paraISO(req.body.pago_em) || (await hojeSP(client));
    const valor = req.body.valor === undefined || req.body.valor === '' || req.body.valor === null
      ? promessa.valor
      : parseFloat(req.body.valor);

    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE promessas_pagamento
          SET status='pago', pago_em=$1, valor=$2, encerrado_em=now()
        WHERE id=$3 RETURNING *`,
      [quando, valor, promessa.id]
    );
    if (promessa.parcela_id) {
      await client.query('UPDATE orcamento_parcelas SET pago_em=$1 WHERE id=$2', [quando, promessa.parcela_id]);
      await sincronizarPagamentoConfirmado(client, promessa.orcamento_id);
    }
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  } finally {
    client.release();
  }
};

// POST /recebimento/promessas/:id/quebrada
const marcarQuebrada = async (req, res) => {
  try {
    const promessa = await buscarPromessa(req.params.id);
    if (!promessa) return res.status(404).json({ error: 'Promessa não encontrada.' });
    if (!podeMexer(req, promessa)) return res.status(403).json({ error: 'Acesso negado.' });

    const result = await pool.query(
      `UPDATE promessas_pagamento
          SET status='quebrada', motivo=$1, encerrado_em=now()
        WHERE id=$2 RETURNING *`,
      [req.body.motivo || null, promessa.id]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

// POST /recebimento/promessas/:id/remarcar
// Encerra a promessa atual como quebrada e abre uma nova apontando para ela.
// A promessa que falhou continua no histórico — é o que sustenta o "quem cumpre".
const remarcarPromessa = async (req, res) => {
  const client = await pool.connect();
  try {
    const promessa = await buscarPromessa(req.params.id);
    if (!promessa) return res.status(404).json({ error: 'Promessa não encontrada.' });
    if (!podeMexer(req, promessa)) return res.status(403).json({ error: 'Acesso negado.' });

    const novaData = paraISO(req.body.data_promessa);
    if (!novaData) return res.status(400).json({ error: 'Informe a nova data prometida.' });

    const valor = req.body.valor === undefined || req.body.valor === '' || req.body.valor === null
      ? promessa.valor
      : parseFloat(req.body.valor);

    await client.query('BEGIN');
    await client.query(
      `UPDATE promessas_pagamento SET status='quebrada', motivo='remarcada', encerrado_em=now() WHERE id=$1`,
      [promessa.id]
    );
    const nova = await client.query(
      `INSERT INTO promessas_pagamento
         (orcamento_id, parcela_id, cliente_nome, cliente_chave, vendedor_id, vendedor_nome,
          valor, data_promessa, trecho, observacao, origem, renegociacao_de, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        promessa.orcamento_id, promessa.parcela_id,
        promessa.cliente_nome, promessa.cliente_chave,
        promessa.vendedor_id, promessa.vendedor_nome,
        valor, novaData,
        req.body.trecho || promessa.trecho,
        promessa.observacao,
        promessa.origem,
        promessa.id,
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json(nova.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  } finally {
    client.release();
  }
};

// DELETE /recebimento/promessas/:id
const deletePromessa = async (req, res) => {
  if (!ehAdmin(req)) return res.status(403).json({ error: 'Acesso negado.' });
  try {
    const result = await pool.query('DELETE FROM promessas_pagamento WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Promessa não encontrada.' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

// ─── Confiabilidade ─────────────────────────────────────────────────────────

// GET /recebimento/confiabilidade
// Quem cumpre a palavra. Só conta promessa encerrada — pagas e quebradas.
// Promessa ainda em aberto não entra até ter desfecho.
const getConfiabilidade = async (req, res) => {
  if (!ehAdmin(req)) return res.status(403).json({ error: 'Acesso negado.' });
  try {
    const monta = (campoChave, campoNome) => `
      SELECT ${campoChave} AS chave,
             MIN(${campoNome}) AS nome,
             COUNT(*)                                       AS total,
             COUNT(*) FILTER (WHERE status='pago')          AS pagas,
             COUNT(*) FILTER (WHERE status='quebrada')      AS quebradas,
             COUNT(*) FILTER (WHERE status='pendente')      AS abertas,
             COALESCE(SUM(valor) FILTER (WHERE status='pendente'), 0) AS em_aberto,
             COALESCE(SUM(valor) FILTER (WHERE status='pago'), 0)     AS recebido,
             AVG(GREATEST(pago_em - data_promessa, 0))
               FILTER (WHERE status='pago' AND pago_em IS NOT NULL AND data_promessa IS NOT NULL)
                                                            AS atraso_medio
        FROM promessas_pagamento
       WHERE ${campoChave} IS NOT NULL
       GROUP BY ${campoChave}`;

    const clientes = await pool.query(monta('cliente_chave', 'cliente_nome'));
    const vendedores = await pool.query(monta('vendedor_id::text', 'vendedor_nome'));

    const enriquecer = (linhas) => linhas.map((l) => {
      const fechadas = Number(l.pagas) + Number(l.quebradas);
      return {
        ...l,
        fechadas,
        taxa_cumprimento: fechadas ? Math.round((Number(l.pagas) / fechadas) * 100) : null,
        atraso_medio: l.atraso_medio === null ? null : Math.round(Number(l.atraso_medio)),
      };
    }).sort((a, b) => {
      if (a.taxa_cumprimento === null && b.taxa_cumprimento === null) return b.total - a.total;
      if (a.taxa_cumprimento === null) return 1;
      if (b.taxa_cumprimento === null) return -1;
      return a.taxa_cumprimento - b.taxa_cumprimento;
    });

    res.json({ clientes: enriquecer(clientes.rows), vendedores: enriquecer(vendedores.rows) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
};

module.exports = {
  getPendencias,
  getPromessas,
  createPromessa,
  updatePromessa,
  marcarPaga,
  marcarQuebrada,
  remarcarPromessa,
  deletePromessa,
  getConfiabilidade,
};
