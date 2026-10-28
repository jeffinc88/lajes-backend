const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getEmpresa, updateEmpresa } = require('../controllers/empresaController');

router.get('/', authMiddleware, getEmpresa);
router.put('/', authMiddleware, updateEmpresa);

module.exports = router;
