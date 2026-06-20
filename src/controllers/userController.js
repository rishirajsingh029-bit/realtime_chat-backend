const User = require('../models/User');

async function searchUsers(req, res) {
  try {
    const { q } = req.query; // ?q=alex in the URL
    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const users = await User.searchByUsername(q, req.user.id);
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { searchUsers };