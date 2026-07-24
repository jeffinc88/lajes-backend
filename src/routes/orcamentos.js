const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getOrcamentos,
  createOrcamento,
  updateOrcamento,
  deleteOrcamento,
  getTiposLaje,
  getItemTiposLaje,
  updateItemTiposLaje,
} = require('../controllers/orcamentosController');

// Rotas específicas ANTES das rotas com parâmetro /:id
router.get('/tipos-laje', authMiddleware, getTiposLaje);
router.get('/item-tipos-laje', authMiddleware, getItemTiposLaje);
router.put('/item-tipos-laje/:id', authMiddleware, updateItemTiposLaje);

router.get('/', authMiddleware, getOrcamentos);
router.post('/', authMiddleware, createOrcamento);
router.put('/:id', authMiddleware, updateOrcamento);
router.delete('/:id', authMiddleware, deleteOrcamento);

module.exports = router;