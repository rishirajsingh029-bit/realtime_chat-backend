const express = require('express');
const router = express.Router();
const { signup, login, getMe } = require('../controllers/authController');
const requireAuth = require('../middleware/auth');

router.post('/signup', signup);
router.post('/login', login);

// requireAuth runs FIRST. Only if it calls next() does getMe ever run.
router.get('/me', requireAuth, getMe);

module.exports = router;