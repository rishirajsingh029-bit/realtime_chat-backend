const express = require('express');
const router = express.Router();
const { searchUsers } = require('../controllers/userController');
const requireAuth = require('../middleware/auth');

router.get('/search', requireAuth, searchUsers);

module.exports = router;