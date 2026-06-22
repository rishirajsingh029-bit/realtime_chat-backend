const express = require('express');
const router = express.Router();
const {
  signup,
  login,
  getMe,
  signupValidationRules,
  loginValidationRules,
  handleValidationErrors,
} = require('../controllers/authController');
const requireAuth = require('../middleware/auth');

router.post('/signup', signupValidationRules, handleValidationErrors, signup);
router.post('/login', loginValidationRules, handleValidationErrors, login);
router.get('/me', requireAuth, getMe);

module.exports = router;