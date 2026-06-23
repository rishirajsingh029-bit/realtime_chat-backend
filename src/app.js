const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const Friendship = require('./models/Friendship');
const User = require('./models/User');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const friendRoutes = require('./routes/friendRoutes');
const Message = require('./models/Message');
const messageRoutes = require('./routes/messageRoutes');
const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/messages', messageRoutes);

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  next(err);
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);

app.get('/', (req, res) => {
  res.send('Chat app backend is running!');
});

// Create the raw HTTP server explicitly so Socket.io can attach to it
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*', // for local dev only
  },
});

// Socket-level auth middleware -- runs before any connection is accepted
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
// In-memory map: userId -> socket.id
// Lets us find "which socket belongs to this user" so we can send
// them a direct message later. Lives only in this server's memory --
// this is the exact thing the Redis adapter would replace at scale
// across multiple servers (worth mentioning in your viva).
const onlineUsers = new Map();

io.on('connection', async (socket) => {
  console.log(`${socket.username} connected (${socket.id})`);

  onlineUsers.set(socket.userId, socket.id);
  await User.setOnlineStatus(socket.userId, true);

  // Tell this user's friends they just came online
  const friends = await Friendship.listFriends(socket.userId);
  friends.forEach((friend) => {
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

      // Save to the database first -- this is our source of truth.
      // If the receiver is offline, the message still gets stored
      // and they'll see it next time they fetch history.
      const message = await Message.createMessage({
        senderId: socket.userId,
        receiverId,
        content: content.trim(),
      });

      // Confirm to the SENDER that it was saved (so their UI can
      // show it immediately, with the real DB id/timestamp)
      socket.emit('message_sent', message);

      // If the receiver is currently online, push it to them instantly
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('new_message', message);
      }
    } catch (err) {
      console.error(err);
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });

  // --- TYPING INDICATOR (small bonus, very cheap to add) ---
  socket.on('typing', ({ receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_typing', { userId: socket.userId, username: socket.username });
    }
  });

  socket.on('disconnect', async () => {
    console.log(`${socket.username} disconnected (${socket.id})`);
    onlineUsers.delete(socket.userId);
    await User.setOnlineStatus(socket.userId, false);

    const friends = await Friendship.listFriends(socket.userId);
    friends.forEach((friend) => {
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