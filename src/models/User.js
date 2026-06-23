const pool = require('../config/db');

// Create a new user in the database
async function createUser({ username, email, passwordHash }) {
  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, created_at`,
    [username, email, passwordHash]
  );
  return result.rows[0];
}

// Find a user by their username (used during login, and to check duplicates)
async function findByUsername(username) {
  const result = await pool.query(
    `SELECT * FROM users WHERE username = $1`,
    [username]
  );
  return result.rows[0]; // undefined if no match
}

// Find a user by email (used to check duplicate signups)
async function findByEmail(email) {
  const result = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0];
}

// Find a user by their id (used once logged in, to fetch "my profile")
async function findById(id) {
  const result = await pool.query(
    `SELECT id, username, email, is_online, last_seen_at, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

// Search users by partial username, excluding yourself from results
async function searchByUsername(query, excludeUserId) {
  const result = await pool.query(
    `SELECT id, username, email, is_online
     FROM users
     WHERE username ILIKE $1 AND id <> $2
     ORDER BY username
     LIMIT 20`,
    [`%${query}%`, excludeUserId]
  );
  return result.rows;
}

// Mark a user online or offline, and stamp the time it happened
async function setOnlineStatus(userId, isOnline) {
  await pool.query(
    `UPDATE users
     SET is_online = $1, last_seen_at = NOW()
     WHERE id = $2`,
    [isOnline, userId]
  );
}

module.exports = {
  createUser,
  findByUsername,
  findByEmail,
  findById,
  setOnlineStatus,
  searchByUsername,
};