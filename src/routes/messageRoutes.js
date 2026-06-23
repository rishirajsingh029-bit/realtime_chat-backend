const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const { getMessages } = require('../controllers/messageController');

router.get('/:otherUserId', requireAuth, getMessages);

module.exports = router;