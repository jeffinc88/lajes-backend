const fetch = require('node-fetch');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BLING_CLIENT_ID = process.env.BLING_CLIENT_ID;
const BLING_CLIENT_SECRET = process.env.BLING_CLIENT_SECRET;
const BLING_API_URL = 'https://www.bling.com.br/Api/v3';

// Buscar token salvo no banco
const getToken = async () => {
  try {
    const result = await pool.query("SELECT * FROM bling_tokens ORDER BY id DESC LIMIT 1");
    if (result.rows.length === 0) return null;
    const token = result.rows[0];
    // Verificar se expirou
    const expirou = new Date(token.expires_at) < new Date();
    if (expirou) return await refreshToken(token.refresh_token);
    return token.access_token;
  } catch (e) {
    console.error('Erro ao buscar token Bling:', e);
    return null;
  }
};

// Renovar token expirado
const refreshToken = async (refreshToken) => {
  try {
    const credentials = Buffer.from(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`).toString('base64');
    const res = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('Falha ao renovar token');
    await salvarToken(data);
    return data.access_token;
  } catch (e) {
    console.error('Erro ao renovar token Bling:', e);
    return null;
  }
};

// Salvar token no banco
const salvarToken = async (data) => {
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await pool.query(
    `INSERT INTO bling_tokens (access_token, refresh_token, expires_at) 
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET access_token=$1, refresh_token=$2, expires_at=$3`,
    [data.access_token, data.refresh_token, expiresAt]
  );
};

// Buscar ou criar cliente no Bling
const buscarOuCriarCliente = async (token, cliente) => {
  // Buscar por CPF/CNPJ
  const cpf = cliente.cpf?.replace(/\D/g, '');
  if (cpf) {
    const res = await fetch(`${BLING_API_URL}/contatos?pesquisa=${cpf}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.data?.length > 0) return data.data[0].id;
  }

  // Criar cliente novo
  const res = await fetch(`${BLING_API_URL}/contatos`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      nome: cliente.nome,
      cpfCnpj: cpf || '',
      telefone: cliente.telefone || '',
      endereco: {
        endereco: cliente.endereco || '',
      },
      tipo: 'F', // Pessoa física
    }),
  });
  const data = await res.json();
  return data.data?.id || null;
};

// Criar pedido de venda no Bling
const criarPedidoVenda = async (orcamento) => {
  const token = await getToken();
  if (!token) throw new Error('Bling não autenticado. Acesse /bling/auth para autorizar.');

  const cliente = typeof orcamento.cliente === 'string'
    ? JSON.parse(orcamento.cliente) : orcamento.cliente;
  const itens = typeof orcamento.itens === 'string'
    ? JSON.parse(orcamento.itens) : orcamento.itens || [];
  const nota = typeof orcamento.nota === 'string'
    ? JSON.parse(orcamento.nota) : orcamento.nota;

  const clienteId = await buscarOuCriarCliente(token, cliente);

  const itensBling = itens.map(item => ({
    produto: {
      id: item.bling_id || undefined,
      codigo: item.bling_codigo || undefined,
      nome: item.nome,
    },
    quantidade: parseFloat(item.quantidade),
    valor: parseFloat(item.preco),
  }));

  const frete = parseFloat(orcamento.frete || 0);
  const desconto = parseFloat(orcamento.desconto || 0);
  const outrasDespesas = parseFloat(orcamento.outras_despesas || 0);
  const observacao = [
    orcamento.observacao || '',
    `Tipo de Laje: ${orcamento.tipo_laje || ''}`,
    `Orçamento Nº ${orcamento.id} - App Carvalho`,
  ].filter(Boolean).join(' | ');

  const body = {
    contato: { id: clienteId },
    itens: itensBling,
    transporte: {
      frete: frete,
    },
    desconto: {
      valor: desconto,
      tipo: 'V', // Valor fixo
    },
    outrasDespesas: outrasDespesas,
    observacoes: observacao,
    observacoesInternas: `ART: R$ ${orcamento.art || 0} | Nota Fiscal: ${nota?.tipo || ''} (${nota?.valor || 0})`,
  };

  const res = await fetch(`${BLING_API_URL}/pedidos/vendas`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Erro ao criar pedido no Bling');
  return data.data;
};

module.exports = { criarPedidoVenda, salvarToken, getToken };
