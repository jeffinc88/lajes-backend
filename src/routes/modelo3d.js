const express = require('express');
const authMiddleware = require('../middleware/auth');
const { salvar, pagina } = require('../controllers/modelo3dController');

// POST /modelo3d (logado, corpo até 5 MB) e GET /3d/:codigo (público)
const gravar = express.Router();
gravar.post('/', express.json({ limit: '5mb' }), authMiddleware, salvar);
const publico = express.Router();
publico.get('/:codigo', pagina);

module.exports = { gravar, publico };
