import jwt from 'jsonwebtoken';
import Conversation from '../models/mongo/Conversation.js';
import Message      from '../models/mongo/Message.js';

// Track online users: userId → socketId
const onlineUsers = new Map();

export function initSocket(io) {

  // ── Auth middleware for Socket.IO ────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required.'));

    try {
      const decoded  = jwt.verify(token, process.env.JWT_SECRET);
      socket.user    = decoded; // { id, role, name, email }
      next();
    } catch {
      next(new Error('Invalid token.'));
    }
  });

  // ── Connection ────────────────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`🟢 ${user.role} connected: ${user.name} (${user.id})`);

    // Track online status
    onlineUsers.set(user.id, socket.id);

    // Broadcast online status to all
    io.emit('user_online', { userId: user.id, role: user.role });

    // ── Join conversation room ─────────────────────────────────────────────────
    socket.on('join_conversation', async (conversationId) => {
      socket.join(conversationId);
      console.log(`📥 ${user.name} joined room: ${conversationId}`);
    });

    // ── Leave conversation room ────────────────────────────────────────────────
    socket.on('leave_conversation', (conversationId) => {
      socket.leave(conversationId);
    });

    // ── Send message ───────────────────────────────────────────────────────────
    socket.on('send_message', async (data) => {
      try {
        const { conversationId, content } = data;

        if (!conversationId || !content?.trim()) return;

        // Verify conversation exists and user belongs to it
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        if (conversation.student_id    !== user.id &&
            conversation.counsellor_id !== user.id) return;

        // Save message to MongoDB
        const message = await Message.create({
          conversation_id: conversationId,
          sender_id:       user.id,
          sender_role:     user.role,
          sender_name:     user.name,
          content:         content.trim(),
          type:            'text',
          is_read:         false,
        });

        // Update conversation last message + unread count
        const isStudent         = user.role === 'student';
        const recipientUnread   = isStudent ? 'counsellor_unread' : 'student_unread';

        await Conversation.findByIdAndUpdate(conversationId, {
          last_message:    content.trim(),
          last_message_at: new Date(),
          $inc: { [recipientUnread]: 1 },
        });

        // Emit to everyone in the room (sender + receiver)
        io.to(conversationId).emit('receive_message', {
          _id:             message._id,
          conversation_id: conversationId,
          sender_id:       user.id,
          sender_role:     user.role,
          sender_name:     user.name,
          content:         message.content,
          is_read:         false,
          createdAt:       message.createdAt,
        });

        // Notify recipient if they're online but not in this room
        const recipientId = isStudent
          ? conversation.counsellor_id
          : conversation.student_id;

        const recipientSocketId = onlineUsers.get(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('new_message_notification', {
            conversationId,
            senderName:  user.name,
            senderRole:  user.role,
            preview:     content.trim().slice(0, 60),
          });
        }

        console.log(`💬 Message: ${user.name} → room ${conversationId}`);

      } catch (err) {
        console.error('❌ send_message error:', err.message);
        socket.emit('message_error', { message: 'Failed to send message.' });
      }
    });

    // ── Typing indicator ───────────────────────────────────────────────────────
    socket.on('typing_start', ({ conversationId }) => {
      socket.to(conversationId).emit('user_typing', {
        userId:   user.id,
        userName: user.name,
        role:     user.role,
      });
    });

    socket.on('typing_stop', ({ conversationId }) => {
      socket.to(conversationId).emit('user_stopped_typing', { userId: user.id });
    });

    // ── Disconnect ─────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      onlineUsers.delete(user.id);
      io.emit('user_offline', { userId: user.id });
      console.log(`🔴 ${user.role} disconnected: ${user.name}`);
    });
  });
}