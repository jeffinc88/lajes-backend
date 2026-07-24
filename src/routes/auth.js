const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { login, changePassword } = require('../controllers/authController');

router.post('/login', login);
router.post('/change-password', authMiddleware, changePassword);

module.exports = router;