# realtime-chat-backend

A backend for a real-time chat application: authentication, a friend-request
system, and live one-to-one messaging with persistence, presence, read
receipts, and media support.

Built with **Node.js + Express + Socket.io + PostgreSQL**.

---

## Stack

| Layer | Choice |
|---|---|
| Runtime / framework | Node.js, Express |
| Real-time | Socket.io |
| Database | PostgreSQL |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| File uploads | Multer |
| Validation | express-validator |
| Rate limiting | express-rate-limit |

### Why this stack

**Node.js + Express + Socket.io.** Chat is fundamentally an I/O-bound,
many-idle-connections workload — most sockets are open but silent most of
the time, occasionally bursting with a message. Node's single-threaded,
non-blocking event loop is well suited to exactly that pattern, and
Socket.io builds on top of raw WebSockets to add automatic reconnection,
room/namespace support, and graceful fallback if WebSockets aren't
available — all of which would otherwise have to be hand-built.

**PostgreSQL over MongoDB.** The core data here — users, friendships,
messages — is highly relational: a friendship *is* a relationship between
two users, and a message *is* a relationship between a sender and a
receiver. Postgres lets the database itself enforce that correctness
(foreign keys, `UNIQUE` constraints, `CHECK` constraints on status values)
rather than relying on application code to maintain it. A document store
would work too, but you'd be rebuilding those guarantees by hand.

---

## Running locally

### Prerequisites
- Node.js (v18+)
- PostgreSQL (v14+)

### 1. Clone and install
```bash
git clone https://github.com/rishirajsingh029-bit/realtime_chat-backend.git
cd realtime_chat-backend
npm install
```

### 2. Create the database
```bash
psql -U postgres -c "CREATE DATABASE chatapp;"
```

### 3. Configure environment variables
Create a `.env` file in the project root:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chatapp
DB_USER=postgres
DB_PASSWORD=your_postgres_password

PORT=5000

JWT_SECRET=replace_with_a_long_random_string
JWT_EXPIRES_IN=7d
```

### 4. Run migrations
Migrations are plain SQL files in `/migrations`, applied in order:
```bash
psql -U postgres -d chatapp -f migrations/001_create_users.sql
psql -U postgres -d chatapp -f migrations/002_create_friendships.sql
psql -U postgres -d chatapp -f migrations/003_create_messages.sql
psql -U postgres -d chatapp -f migrations/004_add_media_to_messages.sql
```

### 5. Start the server
```bash
npm run dev   # nodemon, auto-restarts on file changes
# or
npm start     # plain node
```
Server runs at `http://localhost:5000`.

### 6. Open the test frontend
Open `client/index.html` directly in a browser (no build step — plain
HTML/JS). It's a minimal console for exercising every endpoint and the
live chat, not a polished product UI. Open it in two separate browser
sessions (e.g. one normal window + one incognito) to test real-time
behavior between two users.

---

## API Documentation

All protected routes require an `Authorization: Bearer <token>` header,
with the token obtained from `/api/auth/login`.

### Auth

| Method | Endpoint | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/api/auth/signup` | — | `{ username, email, password }` | Create an account. Password is hashed with bcrypt before storage. |
| POST | `/api/auth/login` | — | `{ username, password }` | Returns a JWT on success. |
| GET | `/api/auth/me` | ✅ | — | Returns the current user's profile. |

### Users

| Method | Endpoint | Auth | Query | Description |
|---|---|---|---|---|
| GET | `/api/users/search` | ✅ | `?q=<username>` | Partial, case-insensitive username search. Excludes the requester. |

### Friends

| Method | Endpoint | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/api/friends/request` | ✅ | `{ username }` | Send a friend request. |
| PATCH | `/api/friends/request/:friendshipId` | ✅ | `{ action: "accept"\|"reject" }` | Respond to a request. Only the addressee can respond. |
| GET | `/api/friends` | ✅ | — | List accepted friends. |
| GET | `/api/friends/requests/incoming` | ✅ | — | List pending requests sent *to* you. |

### Messages

| Method | Endpoint | Auth | Query | Description |
|---|---|---|---|---|
| GET | `/api/messages/:otherUserId` | ✅ | `?before=<ISO timestamp>` | Conversation history, newest-first internally, returned oldest-first. Paginated, 50 per page. `before` is a cursor for loading older messages. |

### Upload

| Method | Endpoint | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/api/upload` | ✅ | multipart `file` field | Uploads an image/file (max 5MB, restricted extensions). Returns `{ mediaUrl, mediaType }` to attach to a message. |

### WebSocket events (Socket.io)

Connect with:
```js
io(SERVER_URL, { auth: { token: "<jwt>" } })
```
Connection is rejected if the token is missing or invalid.

| Direction | Event | Payload | Description |
|---|---|---|---|
| client → server | `send_message` | `{ receiverId, content?, mediaUrl?, mediaType? }` | Send a message (text, media, or both). |
| server → client | `message_sent` | message object | Confirms the sender's own message was saved (and delivered, if receiver is online). |
| server → client | `new_message` | message object | Pushed to the receiver if they're online. |
| client → server | `mark_read` | `{ otherUserId }` | Marks all unread messages from `otherUserId` as read. |
| server → client | `messages_read` | `{ readerId, messageIds }` | Notifies the original sender that their messages were read. |
| client → server | `typing` | `{ receiverId }` | Typing indicator. |
| server → client | `user_typing` | `{ userId, username }` | Relayed typing indicator. |
| server → client | `friend_status_changed` | `{ userId, username, isOnline }` | Pushed to friends when someone connects/disconnects. |
| server → client | `message_error` | `{ error }` | Validation or server-side failure on `send_message`. |

---

## The Deep Dive

### Database schema

Three tables, deliberately kept simple and normalized:

**`users`** — `id` (UUID), `username` / `email` (both `UNIQUE`),
`password_hash`, `is_online`, `last_seen_at`, `created_at`. UUIDs are used
instead of sequential integers so ids aren't guessable/enumerable.

**`friendships`** — models a many-to-many relationship between users, with
a `status` column (`pending` / `accepted` / `rejected`) rather than a
separate `friend_requests` table. One row represents one request in one
direction (`requester_id` → `addressee_id`); a `CHECK` constraint enforces
valid status values, a `UNIQUE` constraint on `(requester_id, addressee_id)`
prevents duplicate requests, and a `CHECK (requester_id <> addressee_id)`
prevents self-friending. Listing a user's friends requires checking both
directions (`requester_id = $1 OR addressee_id = $1`), since either party
could have originally sent the request.

**`messages`** — `sender_id`, `receiver_id`, `content` (nullable, since a
message can be media-only), `media_url` / `media_type` (nullable), and
`status` (`sent` / `delivered` / `read`). A composite index on
`(sender_id, receiver_id, created_at DESC)` makes fetching a specific
conversation, ordered by time, fast even as message volume grows — this is
the index that backs the pagination described below.

All foreign keys use `ON DELETE CASCADE`, so deleting a user cleans up
their friendships and messages automatically rather than leaving orphaned
rows.

### How the real-time layer works

Socket.io is attached to the **same** HTTP server instance as Express
(`http.createServer(app)`, then `new Server(httpServer)`), so REST and
WebSocket traffic share one process and one port.

**Authentication.** Sockets authenticate the same way REST requests do —
a JWT, issued at login, verified against the same secret. The difference
is *where* it's checked: REST routes use Express middleware
(`requireAuth`) reading the `Authorization` header; sockets use a
Socket.io middleware (`io.use(...)`) reading `socket.handshake.auth.token`,
since the WebSocket handshake doesn't have a conventional header-based
auth flow. A connection is rejected outright if the token is missing or
invalid — the same identity, two transports.

**Routing messages to a specific person.** The server keeps an in-memory
`Map<userId, socketId>`. When a message is sent, the server looks up the
receiver's socket id in this map; if they're connected, the message is
pushed to them instantly via `io.to(socketId).emit(...)`. If they're not
in the map (offline), the message is still saved to the database and will
appear next time they fetch their conversation history or come online.

**Why the database write always happens first.** `send_message` saves to
Postgres *before* attempting to push to a live socket. This guarantees
persistence is never dependent on someone being online at that instant —
the WebSocket push is an optimization for the online case, not the source
of truth.

**Read receipts.** A message moves through `sent` → `delivered` → `read`.
It becomes `delivered` the instant it reaches an online receiver's socket
(handled inline in `send_message`). It becomes `read` when the receiver
*opens* that specific conversation — at that point, every unread message
in the thread is marked read together in one update, and the original
sender (if online) is notified via a `messages_read` event so their UI can
flip the tick marks live. This mirrors how WhatsApp/Messenger mark an
opened thread as read in bulk, rather than per-message.

**Pagination.** `GET /api/messages/:otherUserId` defaults to the 50 most
recent messages. An optional `?before=<timestamp>` cursor lets the client
ask for the next older page. The frontend tracks the oldest message
currently rendered and uses its timestamp as the cursor for "load older
messages," so a long conversation history is never loaded in one query —
the composite index described above keeps each of these paginated queries
fast regardless of total conversation length.

### Scaling beyond one server

The `Map<userId, socketId>` and `io.to(...)` broadcasting both rely on all
connected sockets living in **one process's memory**. That's fine for a
single server instance, but it breaks down the moment you run multiple
instances behind a load balancer — user A's socket might land on instance
1 while user B's lands on instance 2, and neither instance's local map
knows about the other's connections.

The standard fix is Socket.io's **Redis adapter**: each server instance
publishes events to a shared Redis pub/sub channel instead of only
broadcasting locally, so a message can be routed to a user regardless of
which instance they're actually connected to. The application-level logic
(who to notify, when to mark delivered/read) wouldn't change — only the
transport between server instances would.

### Security measures

- Passwords are hashed with bcrypt (10 salt rounds) — the real password is
  never stored or logged.
- JWTs are signed with a server-side secret and expire after 7 days.
- Rate limiting: a general limiter (100 requests / 15 min per IP) on all
  routes, with a stricter limiter (10 requests / 15 min per IP) stacked in
  front of `/api/auth` specifically, since login/signup are the classic
  brute-force targets.
- Input validation on signup (email format, username shape, password
  length via express-validator), friend requests, search queries, and
  message length (capped at 2000 characters) to prevent malformed or
  oversized payloads.
- File uploads are restricted by extension (`jpeg/jpg/png/gif/webp/pdf/
  txt/docx`) and capped at 5MB, to prevent disguised executables or
  excessively large uploads.
- All SQL queries use parameterized placeholders (`$1, $2, ...`) via the
  `pg` library — no string concatenation into queries, which eliminates
  SQL injection as an attack vector.

---

## Project structure

```
chat-app/
├── client/
│   └── index.html          # minimal test UI (not the real frontend)
├── migrations/
│   ├── 001_create_users.sql
│   ├── 002_create_friendships.sql
│   ├── 003_create_messages.sql
│   └── 004_add_media_to_messages.sql
├── src/
│   ├── config/
│   │   ├── db.js            # Postgres connection pool
│   │   └── upload.js        # multer config (storage, file filter, limits)
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── friendController.js
│   │   └── messageController.js
│   ├── middleware/
│   │   ├── auth.js          # JWT verification for REST routes
│   │   └── rateLimiter.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Friendship.js
│   │   └── Message.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── userRoutes.js
│   │   ├── friendRoutes.js
│   │   ├── messageRoutes.js
│   │   └── uploadRoutes.js
│   └── app.js                # Express + Socket.io entrypoint
├── uploads/                   # uploaded media (gitignored, kept via .gitkeep)
├── .env
└── package.json
```
