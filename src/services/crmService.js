// Ligação com o CRM de profissionais (crm.carvalholajes.com.br).
// O CRM está no mesmo banco do Supabase; as regras ficam nas funções crm_app_*
// (migração 0008 do CRM). Aqui só montamos os dados do orçamento.
//
// Regra de ouro: falha no CRM nunca impede salvar ou confirmar um orçamento.
// Por isso as funções "ao..." registram o erro no log e seguem.
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const parseJSON = (val) => {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
};
const num = (v) => parseFloat(v) || 0;
const arred = (v) => Math.round(num(v) * 100) / 100;
const ehAdmin = (user) => user?.role === 'admin';

// Soma dos itens (sem frete, nota, ART e outras despesas) — base da gratificação percentual
const valorProdutos = (orcamentos) => arred(orcamentos.reduce((t, o) => {
  const itens = parseJSON(o.itens) || [];
  return t + itens.reduce((s, i) => s + num(i.subtotal ?? num(i.preco) * num(i.quantidade)), 0);
}, 0));

// ---------- Leitura (telas do app) ----------

const carteira = async (user) => {
  const r = await pool.query('SELECT * FROM crm_app_carteira($1, $2)', [Number(user.id), ehAdmin(user)]);
  return r.rows;
};

const obraSugerida = async (user, telefone, documento) => {
  if (!telefone && !documento) return null;
  const r = await pool.query('SELECT * FROM crm_app_obra_sugerida($1, $2, $3, $4)',
    [Number(user.id), ehAdmin(user), telefone || null, documento || null]);
  return r.rows[0] || null;
};

// Vendedor só pode ligar o orçamento a profissional da própria carteira
const profissionalPermitido = async (user, profissionalId) => {
  if (!profissionalId || ehAdmin(user)) return true;
  const r = await pool.query('SELECT 1 FROM crm_app_carteira($1, false) WHERE id=$2', [Number(user.id), profissionalId]);
  return r.rows.length > 0;
};

// ---------- Orçamento salvo ----------

// Marca a obra como Orçada (ou cria) e guarda o id da obra no orçamento.
const aoSalvarOrcamento = async (orcamentoId) => {
  try {
    const o = (await pool.query('SELECT * FROM orcamentos WHERE id=$1', [orcamentoId])).rows[0];
    if (!o) return;
    const cliente = parseJSON(o.cliente) || {};
    const r = await pool.query('SELECT crm_app_orcamento_salvo($1) AS obra_id', [JSON.stringify({
      app_orcamento_id: String(o.id),
      profissional_id: o.crm_profissional_id,
      obra_id: o.crm_obra_id,
      outras_despesas: num(o.outras_despesas),
      cliente_nome: cliente.nome || null,
      cliente_telefone: cliente.telefone || null,
      cliente_documento: cliente.cpf || null,
      endereco: cliente.endereco || null,
    })]);
    const obraId = r.rows[0]?.obra_id || null;
    if (String(obraId) !== String(o.crm_obra_id)) {
      await pool.query('UPDATE orcamentos SET crm_obra_id=$1 WHERE id=$2', [obraId, o.id]);
    }
  } catch (e) {
    console.log('CRM: falha ao sincronizar orçamento', orcamentoId, '-', e.message);
  }
};

// ---------- Pedido confirmado / desfeito ----------

// Monta o pedido a partir de um ou mais orçamentos (fechamento em conjunto) e manda ao CRM.
const enviarPedido = async ({ appId, membros, blingPedidoId, desconto = 0, dataFechamento }) => {
  const principal = membros.find(o => o.crm_profissional_id) || membros.find(o => o.profissional_informado) || membros[0];
  const cliente = parseJSON(principal.cliente) || {};
  const vendedor = parseJSON(principal.vendedor) || {};
  const informado = [principal.profissional_informado, principal.profissional_telefone].filter(Boolean).join(' · ');
  const r = await pool.query('SELECT crm_app_pedido_confirmado($1) AS resultado', [JSON.stringify({
    app_orcamento_id: appId,
    bling_pedido_id: blingPedidoId ? String(blingPedidoId) : null,
    data_orcamento: membros.map(o => o.created_at).filter(Boolean).sort()[0] || null,
    data_fechamento: dataFechamento || null,
    cliente_nome: cliente.nome || null,
    cliente_documento: cliente.cpf || null,
    cliente_telefone: cliente.telefone || null,
    cidade: null,
    vendedor_nome: vendedor.name || vendedor.nome || null,
    valor_produtos: arred(valorProdutos(membros) - membros.reduce((t, o) => t + num(o.desconto), 0) - num(desconto)),
    valor_frete: arred(membros.reduce((t, o) => t + num(o.frete) * (num(o.margem) || 1.3), 0)),
    valor_outras_despesas: arred(membros.reduce((t, o) => t + num(o.outras_despesas), 0)),
    profissional_id: principal.crm_profissional_id || null,
    obra_id: principal.crm_obra_id || null,
    profissional_informado: principal.crm_profissional_id ? null : (informado || null),
  })]);
  return r.rows[0]?.resultado || null;
};

const aoConfirmarOrcamento = async (orcamentoId) => {
  try {
    const o = (await pool.query('SELECT * FROM orcamentos WHERE id=$1', [orcamentoId])).rows[0];
    if (!o || o.status !== 'confirmado' || o.fechamento_id) return;
    const resultado = await enviarPedido({
      appId: String(o.id), membros: [o], blingPedidoId: o.bling_pedido_id, dataFechamento: o.confirmado_em,
    });
    if (resultado && resultado !== 'ja_conciliado') {
      await pool.query('UPDATE orcamentos SET crm_status=$1 WHERE id=$2', [resultado, o.id]);
    }
  } catch (e) {
    console.log('CRM: falha ao enviar pedido', orcamentoId, '-', e.message);
  }
};

const aoConfirmarFechamento = async (fechamentoId) => {
  try {
    const f = (await pool.query('SELECT * FROM fechamentos WHERE id=$1', [fechamentoId])).rows[0];
    const membros = (await pool.query('SELECT * FROM orcamentos WHERE fechamento_id=$1 ORDER BY id', [fechamentoId])).rows;
    if (!f || membros.length === 0) return;
    const resultado = await enviarPedido({
      appId: `F${f.id}`, membros, blingPedidoId: f.bling_pedido_id, desconto: f.desconto, dataFechamento: f.confirmado_em,
    });
    if (resultado && resultado !== 'ja_conciliado') {
      await pool.query('UPDATE orcamentos SET crm_status=$1 WHERE fechamento_id=$2', [resultado, f.id]);
    }
  } catch (e) {
    console.log('CRM: falha ao enviar fechamento', fechamentoId, '-', e.message);
  }
};

// Orçamento que deixou de estar confirmado (ou fechamento desfeito)
const aoDesfazerPedido = async (appId) => {
  try {
    const r = await pool.query('SELECT crm_app_pedido_desfeito($1) AS resultado', [String(appId)]);
    const resultado = r.rows[0]?.resultado;
    if (/^\d+$/.test(String(appId)) && resultado !== 'manual') {
      await pool.query('UPDATE orcamentos SET crm_status=NULL WHERE id=$1', [Number(appId)]);
    }
    if (resultado === 'manual') {
      console.log('CRM: pedido', appId, 'já conciliado pela gerência — desfazer manualmente no CRM');
    }
    return resultado;
  } catch (e) {
    console.log('CRM: falha ao desfazer pedido', appId, '-', e.message);
    return null;
  }
};

module.exports = {
  carteira, obraSugerida, profissionalPermitido, aoSalvarOrcamento, aoConfirmarOrcamento, aoConfirmarFechamento, aoDesfazerPedido,
};
