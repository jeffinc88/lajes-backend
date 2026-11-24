const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getConfig, putConfig } = require('../controllers/configProgramaController');

router.get('/', authMiddleware, getConfig);
router.put('/', authMiddleware, putConfig);

module.exports = router;
