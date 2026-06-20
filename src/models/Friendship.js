const pool = require('../config/db');

// Send a friend request
async function sendRequest(requesterId, addresseeId) {
  const result = await pool.query(
    `INSERT INTO friendships (requester_id, addressee_id, status)
     VALUES ($1, $2, 'pending')
     RETURNING *`,
    [requesterId, addresseeId]
  );
  return result.rows[0];
}

// Find any existing friendship row between two users, either direction
async function findBetween(userIdA, userIdB) {
  const result = await pool.query(
    `SELECT * FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2)
        OR (requester_id = $2 AND addressee_id = $1)`,
    [userIdA, userIdB]
  );
  return result.rows[0];
}

// Accept or reject -- only the ADDRESSEE (receiver) can respond
async function respondToRequest(friendshipId, addresseeId, newStatus) {
  const result = await pool.query(
    `UPDATE friendships
     SET status = $1, updated_at = NOW()
     WHERE id = $2 AND addressee_id = $3 AND status = 'pending'
     RETURNING *`,
    [newStatus, friendshipId, addresseeId]
  );
  return result.rows[0];
}

// List all accepted friends
async function listFriends(userId) {
  const result = await pool.query(
    `SELECT u.id, u.username, u.is_online, u.last_seen_at
     FROM friendships f
     JOIN users u ON u.id = CASE
        WHEN f.requester_id = $1 THEN f.addressee_id
        ELSE f.requester_id
     END
     WHERE (f.requester_id = $1 OR f.addressee_id = $1)
       AND f.status = 'accepted'
     ORDER BY u.username`,
    [userId]
  );
  return result.rows;
}

// List incoming pending requests (people who want to friend ME)
async function listIncomingRequests(userId) {
  const result = await pool.query(
    `SELECT f.id AS friendship_id, u.id AS user_id, u.username, f.created_at
     FROM friendships f
     JOIN users u ON u.id = f.requester_id
     WHERE f.addressee_id = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return result.rows;
}

module.exports = {
  sendRequest,
  findBetween,
  respondToRequest,
  listFriends,
  listIncomingRequests,
};