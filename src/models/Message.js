const pool = require('../config/db');

// Save a new message
async function createMessage({ senderId, receiverId, content, mediaUrl = null, mediaType = null }) {
  const result = await pool.query(
    `INSERT INTO messages (sender_id, receiver_id, content, media_url, media_type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [senderId, receiverId, content, mediaUrl, mediaType]
  );
  return result.rows[0];
}
// Get the conversation history between two users, oldest first,
// with pagination (so we don't load the entire history every time --
// this is also part of Level 3's "performance" requirement, but the
// table/index already supports it).
async function getConversation(userIdA, userIdB, limit = 3, beforeTimestamp = null) { // TEMP: testing pagination {
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
// Mark a single message as delivered (receiver's socket got it)
async function markDelivered(messageId) {
  const result = await pool.query(
    `UPDATE messages SET status = 'delivered'
     WHERE id = $1 AND status = 'sent'
     RETURNING *`,
    [messageId]
  );
  return result.rows[0];
}

// Mark ALL messages from one sender to a receiver as read at once
// (this is what happens when the receiver opens the chat window)
async function markConversationRead(senderId, receiverId) {
  const result = await pool.query(
    `UPDATE messages
     SET status = 'read'
     WHERE sender_id = $1 AND receiver_id = $2 AND status != 'read'
     RETURNING id`,
    [senderId, receiverId]
  );
  return result.rows; // list of message ids that just got marked read
}
module.exports = { createMessage, getConversation, markDelivered, markConversationRead };