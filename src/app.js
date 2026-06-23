const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// --- Models: these talk directly to Postgres ---
const Friendship = require('./models/Friendship');
const User = require('./models/User');
const Message = require('./models/Message');

// --- Routes: these handle normal REST (HTTP) requests ---
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const friendRoutes = require('./routes/friendRoutes');
const messageRoutes = require('./routes/messageRoutes');

const app = express();
const { generalLimiter, authLimiter } = require('./middleware/rateLimiter');

app.use(cors()); // allows our separate frontend file to call this API
app.use(express.json()); // lets us read JSON sent in request bodies
app.use(generalLimiter); // apply general rate limiting to all routes
app.use('/api/auth', authLimiter); // apply stricter rate limiting to auth routes

// If express.json() fails to parse malformed JSON, this catches that
// error so the server responds with a clean 400 instead of crashing.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  next(err);
});

// --- Mount all our REST routes under their respective base paths ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/messages', messageRoutes);

app.get('/', (req, res) => {
  res.send('Chat app backend is running!');
});

// --- Create a raw HTTP server explicitly, instead of letting
// app.listen() create one implicitly. This is required so Socket.io
// can attach to the SAME server -- both normal HTTP requests and
// WebSocket connections flow through one process, one port.
const httpServer = http.createServer(app);

// --- Attach Socket.io to that same server ---
const io = new Server(httpServer, {
  cors: {
    origin: '*', // local dev only -- in production, lock this to your real frontend's domain
  },
});

// --- SOCKET AUTH MIDDLEWARE ---
// Runs once, before a connection is accepted. The frontend sends its
// JWT (from login) as part of the connection handshake. We verify it
// here, exactly like our Express requireAuth middleware does for
// normal HTTP routes -- same JWT, same secret, just a different
// transport layer.
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('No token provided'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next(); // token valid -- allow the connection
  } catch (err) {
    next(new Error('Invalid or expired token')); // rejects the connection
  }
});

// --- In-memory map: userId -> socket.id ---
// This lets us find "which socket belongs to this user" so we can
// push messages/events directly to them. This map lives only in this
// one server process's memory. At scale, with multiple server
// instances behind a load balancer, you'd replace this with Socket.io's
// Redis adapter, so all instances share presence/routing info via
// Redis pub/sub instead of separate local memory.
const onlineUsers = new Map();

io.on('connection', async (socket) => {
  console.log(`${socket.username} connected (${socket.id})`);

  // Track this user as online, both in memory and in the database
  onlineUsers.set(socket.userId, socket.id);
  await User.setOnlineStatus(socket.userId, true);

  // Tell this user's already-online friends that they just came online
  const friendsOnConnect = await Friendship.listFriends(socket.userId);
  friendsOnConnect.forEach((friend) => {
    const friendSocketId = onlineUsers.get(friend.id);
    if (friendSocketId) {
      io.to(friendSocketId).emit('friend_status_changed', {
        userId: socket.userId,
        username: socket.username,
        isOnline: true,
      });
    }
  });

  // --- SEND A MESSAGE ---
  socket.on('send_message', async ({ receiverId, content }) => {
    try {
      if (!receiverId || !content || !content.trim()) {
        return socket.emit('message_error', { error: 'receiverId and content are required' });
      }

      // Always save to the database FIRST. This is our source of
      // truth and guarantees persistence even if the receiver is
      // offline right now -- they'll see it next time they fetch
      // history or come online.
      const message = await Message.createMessage({
        senderId: socket.userId,
        receiverId,
        content: content.trim(),
      });

      const receiverSocketId = onlineUsers.get(receiverId);

      if (receiverSocketId) {
        // Receiver is online RIGHT NOW -- we can mark this delivered
        // immediately, since it's reaching their socket this instant.
        const delivered = await Message.markDelivered(message.id);
        io.to(receiverSocketId).emit('new_message', delivered);
        socket.emit('message_sent', delivered); // let sender see it's delivered
      } else {
        // Receiver is offline -- message stays 'sent' in the DB until
        // they come online AND open this specific chat (see mark_read below).
        socket.emit('message_sent', message);
      }
    } catch (err) {
      console.error(err);
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });

  // --- MARK A CONVERSATION AS READ ---
  // The frontend fires this the moment the user opens/views a chat
  // with a specific friend. We mark every unread message FROM that
  // friend TO us as 'read', all at once (mirrors how WhatsApp/Messenger
  // mark an entire opened thread as read together, not message-by-message).
  socket.on('mark_read', async ({ otherUserId }) => {
    try {
      // otherUserId = the person who SENT the messages
      // socket.userId = the person READING them right now (us)
      const readMessages = await Message.markConversationRead(otherUserId, socket.userId);

      if (readMessages.length > 0) {
        // Notify the original sender (if they're online) that their
        // messages were just read, so their UI can show read receipts.
        const senderSocketId = onlineUsers.get(otherUserId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('messages_read', {
            readerId: socket.userId,
            messageIds: readMessages.map((m) => m.id),
          });
        }
      }
    } catch (err) {
      console.error(err);
    }
  });

  // --- TYPING INDICATOR ---
  socket.on('typing', ({ receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_typing', {
        userId: socket.userId,
        username: socket.username,
      });
    }
  });

  // --- DISCONNECT ---
  socket.on('disconnect', async () => {
    console.log(`${socket.username} disconnected (${socket.id})`);
    onlineUsers.delete(socket.userId);
    await User.setOnlineStatus(socket.userId, false);

    // Tell this user's friends they just went offline
    const friendsOnDisconnect = await Friendship.listFriends(socket.userId);
    friendsOnDisconnect.forEach((friend) => {
      const friendSocketId = onlineUsers.get(friend.id);
      if (friendSocketId) {
        io.to(friendSocketId).emit('friend_status_changed', {
          userId: socket.userId,
          username: socket.username,
          isOnline: false,
        });
      }
    });
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
