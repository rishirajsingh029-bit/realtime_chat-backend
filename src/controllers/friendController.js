const Friendship = require('../models/Friendship');
const User = require('../models/User');

// --- SEND A FRIEND REQUEST ---
async function sendFriendRequest(req, res) {
  try {
    const requesterId = req.user.id;
    const { username } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return res.status(400).json({ error: 'username is required' });
    }
    if (username.length > 30) {
      return res.status(400).json({ error: 'username is too long' });
    }

    const addressee = await User.findByUsername(username);
    if (!addressee) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (addressee.id === requesterId) {
      return res.status(400).json({ error: 'You cannot friend yourself' });
    }

    const existing = await Friendship.findBetween(requesterId, addressee.id);
    if (existing) {
      return res.status(409).json({ error: `Friendship already exists with status: ${existing.status}` });
    }

    const friendship = await Friendship.sendRequest(requesterId, addressee.id);
    res.status(201).json({ message: 'Friend request sent', friendship });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

// --- ACCEPT OR REJECT A REQUEST ---
async function respondToFriendRequest(req, res) {
  try {
    const addresseeId = req.user.id;
    const { friendshipId } = req.params;
    const { action } = req.body;

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action must be "accept" or "reject"' });
    }

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    const updated = await Friendship.respondToRequest(friendshipId, addresseeId, newStatus);

    if (!updated) {
      return res.status(404).json({ error: 'Pending request not found' });
    }

    res.json({ message: `Friend request ${newStatus}`, friendship: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

// --- LIST MY FRIENDS ---
async function getMyFriends(req, res) {
  try {
    const friends = await Friendship.listFriends(req.user.id);
    res.json({ friends });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

// --- LIST INCOMING REQUESTS ---
async function getIncomingRequests(req, res) {
  try {
    const requests = await Friendship.listIncomingRequests(req.user.id);
    res.json({ requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = {
  sendFriendRequest,
  respondToFriendRequest,
  getMyFriends,
  getIncomingRequests,
};