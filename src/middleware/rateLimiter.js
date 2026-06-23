const rateLimit = require('express-rate-limit');

// General API limiter -- applies to everything by default.
// Generous enough for normal use, but stops abuse.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per IP per window
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true, // sends rate limit info back in response headers
  legacyHeaders: false,
});

// Stricter limiter specifically for login/signup -- these are the
// classic brute-force targets, so we lock them down harder than
// general API usage.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // only 10 login/signup attempts per IP per 15 minutes
  message: { error: 'Too many auth attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { generalLimiter, authLimiter };