const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { carteira, obraSugerida } = require('../services/crmService');

// Profissionais para o campo "Profissional da obra":
// vendedor recebe só a própria carteira; admin recebe todos.
router.get('/carteira', authMiddleware, async (req, res) => {
  try {
    res.json(await carteira(req.user));
  } catch (e) {
    console.error('CRM carteira:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar os profissionais do CRM.' });
  }
});

// Obra do CRM que bate com o telefone/CPF do cliente (aviso "obra indicada")
router.get('/obra-sugerida', authMiddleware, async (req, res) => {
  try {
    res.json(await obraSugerida(req.user, req.query.telefone, req.query.cpf));
  } catch (e) {
    console.error('CRM obra sugerida:', e.message);
    res.json(null);
  }
});

module.exports = router;
