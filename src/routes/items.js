const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getItems,
  createItem,
  updateItem,
  deleteItem,
} = require('../controllers/itemsController');

router.get('/', authMiddleware, getItems);
router.post('/', authMiddleware, createItem);
router.put('/:id', authMiddleware, updateItem);
router.delete('/:id', authMiddleware, deleteItem);

module.exports = router;