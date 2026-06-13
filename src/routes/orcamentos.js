const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getOrcamentos,
  createOrcamento,
  updateOrcamento,
  deleteOrcamento,
} = require('../controllers/orcamentosController');

router.get('/', authMiddleware, getOrcamentos);
router.post('/', authMiddleware, createOrcamento);
router.put('/:id', authMiddleware, updateOrcamento);
router.delete('/:id', authMiddleware, deleteOrcamento);

module.exports = router;