const { Pool } = require('pg');
const https = require('https');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BLING_CLIENT_ID = process.env.BLING_CLIENT_ID;
const BLING_CLIENT_SECRET = process.env.BLING_CLIENT_SECRET;

// Helper para requisições HTTPS
const request = (method, path, body, headers = {}) => {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
    const req = https.request({
      hostname: 'www.bling.com.br',
      path,
      method,
      headers: {
        ...(bodyStr && { 'Content-Type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json' }),
        ...(bodyStr && { 'Content-Length': Buffer.byteLength(bodyStr) }),
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
        } catch (e) {
          resolve({ status: res.statusCode, data: {} });
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
};

const salvarToken = async (data) => {
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await pool.query(
    `INSERT INTO bling_tokens (access_token, refresh_token, expires_at) VALUES ($1, $2, $3)`,
    [data.access_token, data.refresh_token, expiresAt]
  );
};

const refreshToken = async (refreshTokenStr) => {
  try {
    const credentials = Buffer.from(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshTokenStr,
    }).toString();
    const { data } = await request('POST', '/Api/v3/oauth/token', body, {
      'Authorization': `Basic ${credentials}`,
    });
    if (!data.access_token) throw new Error('Falha ao renovar token');
    await salvarToken(data);
    return data.access_token;
  } catch (e) {
    console.error('Erro ao renovar token Bling:', e);
    return null;
  }
};

const getToken = async () => {
  try {
    const result = await pool.query("SELECT * FROM bling_tokens ORDER BY id DESC LIMIT 1");
    if (result.rows.length === 0) return null;
    const token = result.rows[0];
    const expirou = new Date(token.expires_at) < new Date();
    if (expirou) return await refreshToken(token.refresh_token);
    return token.access_token;
  } catch (e) {
    console.error('Erro ao buscar token Bling:', e);
    return null;
  }
};

const buscarOuCriarCliente = async (token, cliente) => {
  const cpfRaw = (cliente.cpf || '').replace(/\D/g, '');
  const telRaw = (cliente.telefone || '').replace(/\D/g, '');
  const cpfValido = cpfRaw.length === 11 || cpfRaw.length === 14;
  const telValido = telRaw.length >= 10;

  console.log('Buscando cliente CPF:', cpfRaw);

  // Buscar por CPF/CNPJ apenas se válido
  if (cpfValido) {
    const { status, data } = await request('GET', `/Api/v3/contatos?numeroDocumento=${cpfRaw}`, null, {
      'Authorization': `Bearer ${token}`,
    });
    console.log('Busca cliente status:', status, 'resultados:', data.data?.length || 0);
    if (data.data?.length > 0) return data.data[0].id;
  }

  // Criar cliente novo — só incluir campos válidos
  const body = {
    nome: cliente.nome,
    tipo: cpfRaw.length === 14 ? 'J' : 'F',
    situacao: 'A',
  };

  if (cpfValido) body.numeroDocumento = cpfRaw;
  if (telValido) body.telefone = telRaw;
  if (cliente.endereco) {
    body.endereco = {
      geral: {
        endereco: cliente.endereco,
        municipio: 'Franca',
        uf: 'SP',
      },
    };
  }

  console.log('Criando cliente:', JSON.stringify(body, null, 2));
  const { status, data } = await request('POST', '/Api/v3/contatos', body, {
    'Authorization': `Bearer ${token}`,
  });
  console.log('Criação cliente status:', status, 'data:', JSON.stringify(data, null, 2));
  return data.data?.id || null;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const buscarProdutoPorSku = async (token, sku) => {
  if (!sku) return null;
  try {
    const { status, data } = await request('GET', `/Api/v3/produtos?codigo=${encodeURIComponent(sku)}`, null, {
      'Authorization': `Bearer ${token}`,
    });
    console.log(`Busca produto SKU ${sku}: status ${status}, resultados ${data.data?.length || 0}`);
    if (data.data?.length > 0) return data.data[0].id;
    return null;
  } catch (e) {
    console.log('Erro ao buscar produto:', e.message);
    return null;
  }
};

const montarBodyPedido = async (orcamento, token) => {
  const cliente = typeof orcamento.cliente === 'string' ? JSON.parse(orcamento.cliente) : orcamento.cliente;
  const itens = typeof orcamento.itens === 'string' ? JSON.parse(orcamento.itens) : orcamento.itens || [];
  const nota = typeof orcamento.nota === 'string' ? JSON.parse(orcamento.nota) : orcamento.nota;

  const itemIds = itens.map(i => i.id).filter(Boolean);
  let skuMap = {};
  if (itemIds.length > 0) {
    const result = await pool.query(
      'SELECT id, bling_sku FROM items WHERE id = ANY($1::int[])',
      [itemIds]
    );
    result.rows.forEach(r => { skuMap[r.id] = r.bling_sku; });
  }

  const clienteId = await buscarOuCriarCliente(token, cliente);
  if (!clienteId) throw new Error('Não foi possível vincular cliente no Bling');

  // Buscar ID do produto no Bling pelo SKU (sequencial com delay para respeitar rate limit)
  const itensBling = [];
  for (const item of itens) {
    const sku = skuMap[item.id] || item.bling_sku;
    const produtoId = sku ? await buscarProdutoPorSku(token, sku) : null;
    itensBling.push({
      produto: produtoId ? { id: produtoId } : { nome: item.nome },
      descricao: item.nome,
      quantidade: parseFloat(item.quantidade),
      valor: parseFloat(item.preco),
    });
    await sleep(400); // 400ms entre requisições = ~2.5 req/s (dentro do limite de 3)
  }

  const observacao = [
    orcamento.observacao || '',
    `Tipo de Laje: ${orcamento.tipo_laje || ''}`,
    `Orçamento Nº ${orcamento.id} - App Carvalho`,
  ].filter(Boolean).join(' | ');

  const hoje = new Date().toISOString().split('T')[0];
  const artVal = parseFloat(orcamento.art || 0);
  const notaVal = parseFloat(nota?.valor || 0);
  const outrasDespesasBase = parseFloat(orcamento.outras_despesas || 0);
  const outrasDespesasTotal = outrasDespesasBase + artVal + notaVal;

  return {
    data: hoje,
    dataSaida: hoje,
    contato: { id: clienteId },
    itens: itensBling,
    transporte: { frete: parseFloat(orcamento.frete || 0) },
    desconto: { valor: parseFloat(orcamento.desconto || 0), tipo: 'V' },
    outrasDespesas: outrasDespesasTotal,
    observacoes: observacao,
    observacoesInternas: `Outras despesas: R$ ${outrasDespesasBase.toFixed(2)} | ART: R$ ${artVal.toFixed(2)} | Nota Fiscal ${nota?.tipo || ''}: R$ ${notaVal.toFixed(2)}`,
  };
};

const criarPedidoVenda = async (orcamento) => {
  const token = await getToken();
  if (!token) throw new Error('Bling não autenticado.');
  const body = await montarBodyPedido(orcamento, token);
  console.log('=== ENVIANDO PARA BLING ===');
  console.log(JSON.stringify(body, null, 2));

  // Tentar até 3 vezes se der rate limit
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const { status, data } = await request('POST', '/Api/v3/pedidos/vendas', body, {
      'Authorization': `Bearer ${token}`,
    });
    console.log('=== RESPOSTA BLING ===');
    console.log('Status:', status);
    console.log('Data:', JSON.stringify(data, null, 2));

    if (status === 429) {
      console.log(`Rate limit atingido, aguardando 2s (tentativa ${tentativa}/3)...`);
      await sleep(2000);
      continue;
    }
    if (status >= 400) throw new Error(data.error?.description || data.error?.message || JSON.stringify(data));
    return data.data?.id;
  }
  throw new Error('Limite de requisições do Bling atingido. Tente novamente em alguns segundos.');
};

const atualizarPedidoVenda = async (orcamento, pedidoId) => {
  const token = await getToken();
  if (!token) throw new Error('Bling não autenticado.');
  const body = await montarBodyPedido(orcamento, token);
  const { status, data } = await request('PUT', `/Api/v3/pedidos/vendas/${pedidoId}`, body, {
    'Authorization': `Bearer ${token}`,
  });

  // Se o pedido foi deletado no Bling, criar novo
  if (status === 404) {
    console.log('Pedido não existe mais no Bling, criando novo...');
    return await criarPedidoVenda(orcamento);
  }

  if (status >= 400) throw new Error(data.error?.description || 'Erro ao atualizar pedido no Bling');
  return pedidoId;
};

const excluirPedidoVenda = async (pedidoId) => {
  const token = await getToken();
  if (!token) throw new Error('Bling não autenticado.');
  const { status, data } = await request('DELETE', `/Api/v3/pedidos/vendas/${pedidoId}`, null, {
    'Authorization': `Bearer ${token}`,
  });
  if (status >= 400 && status !== 404) throw new Error(data.error?.description || 'Erro ao excluir pedido no Bling');
  return true;
};

module.exports = { criarPedidoVenda, atualizarPedidoVenda, excluirPedidoVenda, salvarToken, getToken };
