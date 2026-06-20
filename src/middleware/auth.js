const jwt = require('jsonwebtoken');

// This function runs BEFORE the actual route handler, for any route
// that uses it. Its only job: check for a valid token.
function requireAuth(req, res, next) {
  const header = req.headers.authorization; // expects "Bearer <token>"

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.split(' ')[1]; // grabs the part after "Bearer "

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // If verify() doesn't throw, the token is genuine and not expired.
    // We attach the user's identity to req.user so later code
    // (controllers) can know WHO is making this request.
    req.user = { id: decoded.userId, username: decoded.username };
    next(); // let the request continue to its actual destination
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;