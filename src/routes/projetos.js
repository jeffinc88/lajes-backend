const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getProjetos, createProjeto, updateProjeto, deleteProjeto } = require('../controllers/projetosController');

router.get('/', authMiddleware, getProjetos);
router.post('/', authMiddleware, createProjeto);
router.put('/:id', authMiddleware, updateProjeto);
router.delete('/:id', authMiddleware, deleteProjeto);

module.exports = router;