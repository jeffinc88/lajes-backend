const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const https = require('https');
const { salvarToken, criarPedidoVenda } = require('../services/blingService');
const authMiddleware = require('../middleware/auth');

const BLING_CLIENT_ID = process.env.BLING_CLIENT_ID;
const BLING_CLIENT_SECRET = process.env.BLING_CLIENT_SECRET;
const REDIRECT_URI = process.env.BLING_REDIRECT_URI || 'https://lajes-backend-production.up.railway.app/bling/callback';

// Helper para POST usando https nativo
const postToBling = (path, body, headers) => {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.bling.com.br',
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Resposta inválida: ' + data));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
};

router.get('/auth', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const url = `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${BLING_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;
  res.redirect(url);
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código não recebido.');

  try {
    const credentials = Buffer.from(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
    }).toString();

    const data = await postToBling('/Api/v3/oauth/token', body, {
      'Authorization': `Basic ${credentials}`,
      'Accept': '1.0',
    });

    if (!data.access_token) throw new Error('Token não recebido: ' + JSON.stringify(data));

    await salvarToken(data);
    res.send('✅ Bling autorizado com sucesso! Pode fechar esta aba.');
  } catch (e) {
    console.error('Erro no callback Bling:', e);
    res.status(500).send('Erro ao autenticar com o Bling: ' + e.message);
  }
});

router.post('/pedido', authMiddleware, async (req, res) => {
  try {
    const pedido = await criarPedidoVenda(req.body);
    res.json({ success: true, pedido });
  } catch (e) {
    console.error('Erro ao criar pedido Bling:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  const { getToken } = require('../services/blingService');
  const token = await getToken();
  res.json({ autenticado: !!token });
});

module.exports = router;
