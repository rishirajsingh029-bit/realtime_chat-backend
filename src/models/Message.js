const pool = require('../config/db');

// Save a new message
async function createMessage({ senderId, receiverId, content }) {
  const result = await pool.query(
    `INSERT INTO messages (sender_id, receiver_id, content)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [senderId, receiverId, content]
  );
  return result.rows[0];
}

// Get the conversation history between two users, oldest first,
// with pagination (so we don't load the entire history every time --
// this is also part of Level 3's "performance" requirement, but the
// table/index already supports it).
async function getConversation(userIdA, userIdB, limit = 50, beforeTimestamp = null) {
  const params = [userIdA, userIdB];
  let timestampFilter = '';

  if (beforeTimestamp) {
    params.push(beforeTimestamp);
    timestampFilter = `AND created_at < $${params.length}`;
  }

  params.push(limit);

  const result = await pool.query(
    `SELECT * FROM messages
     WHERE ((sender_id = $1 AND receiver_id = $2)
         OR (sender_id = $2 AND receiver_id = $1))
       ${timestampFilter}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows.reverse(); // reverse so the frontend gets oldest-first
}

module.exports = { createMessage, getConversation };