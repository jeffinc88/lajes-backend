const cron = require('node-cron');
const { Pool } = require('pg');
const { enviarPush } = require('../services/pushService');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DIAS_FOLLOWUP = 3;

const parseJSON = (val) => {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
};

const registrarNotificacoes = async (envios, tipo) => {
  for (const e of envios) {
    await pool.query(
      `INSERT INTO notifications_log (orcamento_id, tipo, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (orcamento_id, tipo, user_id) DO UPDATE SET notified_at = now()`,
      [e.orcamento_id, tipo, e.user_id]
    );
  }
};

const processarFollowUp = async () => {
  const result = await pool.query(
    `SELECT o.id AS orcamento_id, o.cliente, u.id AS user_id, u.push_token
     FROM orcamentos o
     CROSS JOIN users u
     WHERE u.role = 'admin'
       AND u.push_token IS NOT NULL
       AND o.status IN ('rascunho', 'aberto')
       AND o.created_at <= now() - interval '${DIAS_FOLLOWUP} days'
       AND NOT EXISTS (
         SELECT 1 FROM notifications_log n
         WHERE n.orcamento_id = o.id AND n.tipo = 'followup' AND n.user_id = u.id
       )`
  );
  const enviados = await enviarPush(result.rows, (d) => {
    const cliente = parseJSON(d.cliente) || {};
    return {
      title: '🔔 Follow-up pendente',
      body: `Orçamento Nº ${d.orcamento_id} — ${cliente.nome || 'Cliente'} está parado há ${DIAS_FOLLOWUP}+ dias.`,
      data: { tipo: 'followup', orcamentoId: d.orcamento_id },
    };
  });
  await registrarNotificacoes(enviados.map(d => ({ orcamento_id: d.orcamento_id, user_id: d.user_id })), 'followup');
};

const processarPagamentoPendente = async () => {
  const result = await pool.query(
    `SELECT o.id AS orcamento_id, o.cliente, u.id AS user_id, u.push_token
     FROM orcamentos o
     JOIN users u ON u.id::text = o.vendedor->>'id'
     WHERE o.status = 'confirmado'
       AND o.pagamento_confirmado_em IS NULL
       AND u.push_token IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM notifications_log n
         WHERE n.orcamento_id = o.id AND n.tipo = 'pagamento_pendente' AND n.user_id = u.id
       )`
  );
  const enviados = await enviarPush(result.rows, (d) => {
    const cliente = parseJSON(d.cliente) || {};
    return {
      title: '💰 Pagamento confirmado',
      body: `Orçamento Nº ${d.orcamento_id} — ${cliente.nome || 'Cliente'} aguardando sua confirmação de pagamento.`,
      data: { tipo: 'pagamento_pendente', orcamentoId: d.orcamento_id },
    };
  });
  await registrarNotificacoes(enviados.map(d => ({ orcamento_id: d.orcamento_id, user_id: d.user_id })), 'pagamento_pendente');
};

const processarPedidoImprimir = async () => {
  const result = await pool.query(
    `SELECT o.id AS orcamento_id, o.cliente, u.id AS user_id, u.push_token
     FROM orcamentos o
     CROSS JOIN users u
     WHERE u.role = 'admin'
       AND u.push_token IS NOT NULL
       AND o.status = 'confirmado'
       AND o.impresso_em IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM notifications_log n
         WHERE n.orcamento_id = o.id AND n.tipo = 'pedido_imprimir' AND n.user_id = u.id
       )`
  );
  const enviados = await enviarPush(result.rows, (d) => {
    const cliente = parseJSON(d.cliente) || {};
    return {
      title: '🖨️ Pedido pronto para imprimir',
      body: `Orçamento Nº ${d.orcamento_id} — ${cliente.nome || 'Cliente'} confirmado, aguardando impressão.`,
      data: { tipo: 'pedido_imprimir', orcamentoId: d.orcamento_id },
    };
  });
  await registrarNotificacoes(enviados.map(d => ({ orcamento_id: d.orcamento_id, user_id: d.user_id })), 'pedido_imprimir');
};

const rodarJobNotificacoes = async () => {
  try {
    await processarFollowUp();
    await processarPagamentoPendente();
    await processarPedidoImprimir();
  } catch (e) {
    console.error('Erro no job de notificações:', e);
  }
};

// Processo roda sempre ligado no Fly (min_machines_running=1), então um cron
// in-process é suficiente — não precisa de fila/scheduler externo.
module.exports = () => {
  cron.schedule('*/30 * * * *', rodarJobNotificacoes);
};

module.exports.rodarJobNotificacoes = rodarJobNotificacoes;
