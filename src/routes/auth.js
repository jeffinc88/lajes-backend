const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { login, changePassword, me } = require('../controllers/authController');

router.post('/login', login);
router.post('/change-password', authMiddleware, changePassword);
router.get('/me', authMiddleware, me);

module.exports = router;