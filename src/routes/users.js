const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getUsers,
  createUser,
  deleteUser,
} = require('../controllers/usersController');

router.get('/', authMiddleware, getUsers);
router.post('/', authMiddleware, createUser);
router.delete('/:id', authMiddleware, deleteUser);

module.exports = router;