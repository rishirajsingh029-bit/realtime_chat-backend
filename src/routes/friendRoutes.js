const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const {
  sendFriendRequest,
  respondToFriendRequest,
  getMyFriends,
  getIncomingRequests,
} = require('../controllers/friendController');

router.post('/request', requireAuth, sendFriendRequest);
router.patch('/request/:friendshipId', requireAuth, respondToFriendRequest);
router.get('/', requireAuth, getMyFriends);
router.get('/requests/incoming', requireAuth, getIncomingRequests);

module.exports = router;