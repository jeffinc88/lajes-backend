const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { createFechamento, reenviarBling, marcarPagamento, deleteFechamento } = require('../controllers/fechamentosController');

router.post('/', authMiddleware, createFechamento);
router.post('/:id/bling', authMiddleware, reenviarBling);
router.put('/:id/pagamento', authMiddleware, marcarPagamento);
router.delete('/:id', authMiddleware, deleteFechamento);

module.exports = router;
