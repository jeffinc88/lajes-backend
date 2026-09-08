const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getPendencias,
  getPromessas,
  createPromessa,
  updatePromessa,
  marcarPaga,
  marcarQuebrada,
  remarcarPromessa,
  deletePromessa,
  getConfiabilidade,
} = require('../controllers/recebimentoController');

router.get('/pendencias', authMiddleware, getPendencias);
router.get('/confiabilidade', authMiddleware, getConfiabilidade);

router.get('/promessas', authMiddleware, getPromessas);
router.post('/promessas', authMiddleware, createPromessa);
router.put('/promessas/:id', authMiddleware, updatePromessa);
router.post('/promessas/:id/pago', authMiddleware, marcarPaga);
router.post('/promessas/:id/quebrada', authMiddleware, marcarQuebrada);
router.post('/promessas/:id/remarcar', authMiddleware, remarcarPromessa);
router.delete('/promessas/:id', authMiddleware, deletePromessa);

module.exports = router;
