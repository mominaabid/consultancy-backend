import jwt         from 'jsonwebtoken';
import Conversation from '../models/mongo/Conversation.js';
import Message      from '../models/mongo/Message.js';

const onlineUsers = new Map(); // userId → socketId

export function initSocket(io) {

  // ── Auth middleware ────────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required.'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user   = decoded;
      next();
    } catch {
      next(new Error('Invalid token.'));
    }
  });

  // ── Connection ─────────────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`🟢 ${user.role} connected: ${user.name} (${user.id})`);

    onlineUsers.set(user.id, socket.id);
    io.emit('user_online', { userId: user.id, role: user.role });

    // ── Chat events ────────────────────────────────────────────────────────

    socket.on('join_conversation', (conversationId) => {
      socket.join(conversationId);
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(conversationId);
    });

    socket.on('send_message', async (data) => {
      try {
        const { conversationId, content } = data;
        if (!conversationId || !content?.trim()) return;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        if (conversation.student_id    !== user.id &&
            conversation.counsellor_id !== user.id) return;

        const message = await Message.create({
          conversation_id: conversationId,
          sender_id:       user.id,
          sender_role:     user.role,
          sender_name:     user.name,
          content:         content.trim(),
          type:            'text',
          is_read:         false,
        });

        const isStudent       = user.role === 'student';
        const recipientUnread = isStudent ? 'counsellor_unread' : 'student_unread';

        await Conversation.findByIdAndUpdate(conversationId, {
          last_message:    content.trim(),
          last_message_at: new Date(),
          $inc: { [recipientUnread]: 1 },
        });

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

        const recipientId       = isStudent ? conversation.counsellor_id : conversation.student_id;
        const recipientSocketId = onlineUsers.get(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('new_message_notification', {
            conversationId,
            senderName: user.name,
            senderRole: user.role,
            preview:    content.trim().slice(0, 60),
          });
        }
      } catch (err) {
        console.error('❌ send_message error:', err.message);
        socket.emit('message_error', { message: 'Failed to send message.' });
      }
    });

    socket.on('typing_start', ({ conversationId }) => {
      socket.to(conversationId).emit('user_typing', {
        userId: user.id, userName: user.name, role: user.role,
      });
    });

    socket.on('typing_stop', ({ conversationId }) => {
      socket.to(conversationId).emit('user_stopped_typing', { userId: user.id });
    });

    // ── WebRTC Signaling events ────────────────────────────────────────────

    // Caller initiates call
    socket.on('call_user', ({ targetUserId, callType, signal, callerName, callerRole }) => {
      const targetSocketId = onlineUsers.get(targetUserId);

      if (!targetSocketId) {
        // Target is offline
        socket.emit('call_failed', { reason: 'User is offline.' });
        return;
      }

      console.log(`📞 ${user.name} calling user ${targetUserId} (${callType})`);

      // Send incoming call to target
      io.to(targetSocketId).emit('incoming_call', {
        from:        user.id,
        fromName:    user.name,
        fromRole:    user.role,
        callType,             // 'audio' | 'video'
        signal,               // WebRTC offer signal
      });
    });

    // Callee accepts and sends answer signal back
    socket.on('call_accepted', ({ targetUserId, signal }) => {
      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) {
        console.log(`✅ Call accepted by ${user.name}`);
        io.to(targetSocketId).emit('call_accepted', { signal });
      }
    });

    // Either party rejects the call
    socket.on('call_rejected', ({ targetUserId }) => {
      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) {
        console.log(`❌ Call rejected by ${user.name}`);
        io.to(targetSocketId).emit('call_rejected', { by: user.name });
      }
    });

    // Either party ends the call
    socket.on('call_ended', ({ targetUserId }) => {
      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) {
        console.log(`📵 Call ended by ${user.name}`);
        io.to(targetSocketId).emit('call_ended');
      }
    });

    // ICE candidate exchange (for NAT traversal)
    socket.on('ice_candidate', ({ targetUserId, candidate }) => {
      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('ice_candidate', { candidate });
      }
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      onlineUsers.delete(user.id);
      io.emit('user_offline', { userId: user.id });
      console.log(`🔴 ${user.role} disconnected: ${user.name}`);
    });
  });
}