const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getUsers,
  createUser,
  deleteUser,
  resetPassword,
  updatePushToken,
} = require('../controllers/usersController');

router.put('/push-token', authMiddleware, updatePushToken);

router.get('/', authMiddleware, getUsers);
router.post('/', authMiddleware, createUser);
router.delete('/:id', authMiddleware, deleteUser);
router.post('/:id/reset-password', authMiddleware, resetPassword);

module.exports = router;