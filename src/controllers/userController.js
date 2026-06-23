const User = require('../models/User');

async function searchUsers(req, res) {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    if (q.length > 50) {
      return res.status(400).json({ error: 'Search query is too long' });
    }
    const users = await User.searchByUsername(q, req.user.id);
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { searchUsers };