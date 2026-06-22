const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');

// --- VALIDATION RULES ---
// These run as middleware BEFORE the actual signup/login functions.
// Each .body(...) check either passes silently or adds an error to
// the request, which we then check with validationResult(req).

const signupValidationRules = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3-30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),

  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail(),
    // normalizeEmail() lowercases it and strips minor formatting
    // differences, so "Alex@Mail.com" and "alex@mail.com" are
    // treated as the same address.

  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

const loginValidationRules = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// Shared helper: checks if any validation rule above failed,
// and if so, sends back a clean list of what's wrong.
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map((e) => e.msg),
    });
  }
  next();
}

// --- SIGNUP ---
async function signup(req, res) {
  try {
    const { username, email, password } = req.body;

    // Check if username or email is already taken
    const existingUsername = await User.findByUsername(username);
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    const existingEmail = await User.findByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash the password -- NEVER store the real one
    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await User.createUser({ username, email, passwordHash });

    res.status(201).json({
      message: 'User created successfully',
      user: newUser,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong during signup' });
  }
}

// --- LOGIN ---
async function login(req, res) {
  try {
    const { username, password } = req.body;

    const user = await User.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong during login' });
  }
}

// --- GET MY PROFILE (protected) ---
async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = {
  signup,
  login,
  getMe,
  signupValidationRules,
  loginValidationRules,
  handleValidationErrors,
};

