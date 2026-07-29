const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getTabelaJuros,
  updateTabelaJuros,
  getConfigPagamento,
  updateConfigPagamento,
} = require('../controllers/pagamentoController');

router.get('/tabela-juros', authMiddleware, getTabelaJuros);
router.put('/tabela-juros', authMiddleware, updateTabelaJuros);
router.get('/config', authMiddleware, getConfigPagamento);
router.put('/config', authMiddleware, updateConfigPagamento);

module.exports = router;
