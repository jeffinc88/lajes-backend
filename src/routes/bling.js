const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { salvarToken, criarPedidoVenda } = require('../services/blingService');
const authMiddleware = require('../middleware/auth');

const BLING_CLIENT_ID = process.env.BLING_CLIENT_ID;
const BLING_CLIENT_SECRET = process.env.BLING_CLIENT_SECRET;
const REDIRECT_URI = process.env.BLING_REDIRECT_URI || 'https://lajes-backend-production.up.railway.app/bling/callback';

// Rota para iniciar autenticação — abrir no navegador
router.get('/auth', (req, res) => {
  const url = `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${BLING_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  res.redirect(url);
});

// Callback do Bling após autorização
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código não recebido.');

  try {
    const credentials = Buffer.from(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`).toString('base64');
    const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const data = await response.json();
    if (!data.access_token) throw new Error('Token não recebido');

    await salvarToken(data);
    res.send('✅ Bling autorizado com sucesso! Pode fechar esta aba.');
  } catch (e) {
    console.error('Erro no callback Bling:', e);
    res.status(500).send('Erro ao autenticar com o Bling: ' + e.message);
  }
});

// Criar pedido no Bling (chamado internamente)
router.post('/pedido', authMiddleware, async (req, res) => {
  try {
    const pedido = await criarPedidoVenda(req.body);
    res.json({ success: true, pedido });
  } catch (e) {
    console.error('Erro ao criar pedido Bling:', e);
    res.status(500).json({ error: e.message });
  }
});

// Verificar status da autenticação
router.get('/status', authMiddleware, async (req, res) => {
  const { getToken } = require('../services/blingService');
  const token = await getToken();
  res.json({ autenticado: !!token });
});

module.exports = router;
