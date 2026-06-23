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
const uploadRoutes = require('./routes/uploadRoutes');
const { generalLimiter, authLimiter } = require('./middleware/rateLimiter');

const app = express();

app.use(cors()); // allows our separate frontend file to call this API
app.use(express.json()); // lets us read JSON sent in request bodies

// If express.json() fails to parse malformed JSON, this catches that
// error so the server responds with a clean 400 instead of crashing.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  next(err);
});

app.use(generalLimiter); // applies to every route mounted below this line

// --- Mount all our REST routes under their respective base paths ---
// authLimiter is stacked in FRONT of authRoutes -- stricter limit just
// for login/signup, on top of the general limiter above.
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);

// Serve uploaded files directly -- visiting /uploads/whatever.jpg
// returns that actual file from the uploads/ folder on disk.
app.use('/uploads', express.static('uploads'));

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
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('No token provided'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next();
  } catch (err) {
    next(new Error('Invalid or expired token'));
  }
});

// --- In-memory map: userId -> socket.id ---
const onlineUsers = new Map();

io.on('connection', async (socket) => {
  console.log(`${socket.username} connected (${socket.id})`);

  onlineUsers.set(socket.userId, socket.id);
  await User.setOnlineStatus(socket.userId, true);

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
  socket.on('send_message', async ({ receiverId, content, mediaUrl, mediaType }) => {
    try {
      const hasText = content && content.trim().length > 0;
      const hasMedia = !!mediaUrl;

      if (!receiverId || (!hasText && !hasMedia)) {
        return socket.emit('message_error', { error: 'A message needs receiverId and either content or media' });
      }

      if (hasText && content.trim().length > 2000) {
        return socket.emit('message_error', { error: 'Message is too long (max 2000 characters)' });
      }

      const message = await Message.createMessage({
        senderId: socket.userId,
        receiverId,
        content: hasText ? content.trim() : null,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
      });

      const receiverSocketId = onlineUsers.get(receiverId);

      if (receiverSocketId) {
        const delivered = await Message.markDelivered(message.id);
        io.to(receiverSocketId).emit('new_message', delivered);
        socket.emit('message_sent', delivered);
      } else {
        socket.emit('message_sent', message);
      }
    } catch (err) {
      console.error(err);
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });

  // --- MARK A CONVERSATION AS READ ---
  socket.on('mark_read', async ({ otherUserId }) => {
    try {
      const readMessages = await Message.markConversationRead(otherUserId, socket.userId);

      if (readMessages.length > 0) {
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