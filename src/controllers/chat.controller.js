import Conversation from '../models/mongo/Conversation.js';
import Message      from '../models/mongo/Message.js';
import { publishToChannel } from '../services/ably.service.js';
import { sendChatNotificationEmail } from '../services/email.service.js';
import db from '../models/mysql/index.js';
import { Op } from 'sequelize';
const { Lead, User } = db;

// POST /chat/messages/send
export async function sendMessage(req, res) {
  try {
    const { conversationId, content } = req.body;
    const user = req.user;

    if (!conversationId || !content?.trim()) {
      return res.status(400).json({ message: 'conversationId and content required.' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });

    // Verify user belongs to this conversation
    if (conversation.student_id    !== user.id &&
        conversation.counsellor_id !== user.id) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    // Save to MongoDB
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
    const recipientId     = isStudent ? conversation.counsellor_id : conversation.student_id;

    // Update conversation
    await Conversation.findByIdAndUpdate(conversationId, {
      last_message:    content.trim(),
      last_message_at: new Date(),
      $inc: { [recipientUnread]: 1 },
    });

    const messageData = {
      _id:             message._id,
      conversation_id: conversationId,
      sender_id:       user.id,
      sender_role:     user.role,
      sender_name:     user.name,
      content:         message.content,
      is_read:         false,
      createdAt:       message.createdAt,
    };

    // Publish to Ably channel — both users subscribed to this channel
    await publishToChannel(
      `conversation:${conversationId}`,
      'new_message',
      messageData
    );

    // Also notify recipient on their personal channel
    await publishToChannel(
      `user:${recipientId}`,
      'new_message_notification',
      {
        conversationId,
        senderName: user.name,
        senderRole: user.role,
        preview:    content.trim().slice(0, 60),
      }
    );

    // Send email notification
    try {
      const recipientUser = await User.findOne({
        where:      { id: Number(recipientId) },
        attributes: ['name', 'email'],
      });

      if (recipientUser?.email) {
        await sendChatNotificationEmail({
          recipientName:  recipientUser.name,
          recipientEmail: recipientUser.email,
          senderName:     user.name,
          senderRole:     user.role,
          messagePreview: content.trim().slice(0, 100),
          conversationId,
        });
        console.log(`✅ Email sent to ${recipientUser.email}`);
      }
    } catch (emailErr) {
      console.error('⚠️ Email failed:', emailErr.message);
    }

    res.status(201).json(messageData);
  } catch (error) {
    console.error('sendMessage error:', error);
    res.status(500).json({ message: error.message });
  }
}

// Also add typing indicators via Ably
export async function sendTyping(req, res) {
  try {
    const { conversationId, isTyping } = req.body;
    const user = req.user;

    await publishToChannel(
      `conversation:${conversationId}`,
      isTyping ? 'typing_start' : 'typing_stop',
      { userId: user.id, userName: user.name, role: user.role }
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
// POST /chat/sync
// Call this once — creates conversations for all existing counseling leads
export async function syncConversations(req, res) {
  try {
    // Find all leads with counseling+ status that have a counsellor assigned
    const leads = await Lead.findAll({
      where: {
        status:       ['counseling', 'applied', 'visa', 'success'],
        counsellor_id: { [Op.ne]: null },
      },
      include: [{ model: User, as: 'counsellor', attributes: ['id', 'name'] }],
    });

    let created = 0;

    for (const lead of leads) {
      // Find student user by email
      const studentUser = await User.findOne({
        where: { email: lead.email, role: 'student' },
        attributes: ['id', 'name'],
      });

      if (!studentUser) continue;

      const existing = await Conversation.findOne({
        student_id:    studentUser.id,
        counsellor_id: lead.counsellor_id,
      });

      if (!existing) {
        await Conversation.create({
          student_id:      studentUser.id,
          counsellor_id:   lead.counsellor_id,
          student_name:    lead.name,
          counsellor_name: lead.counsellor?.name || 'Counsellor',
          last_message:    '',
        });
        created++;
        console.log(`💬 Created conversation: ${lead.name} ↔ ${lead.counsellor?.name}`);
      }
    }

    res.json({ message: `Sync complete. ${created} conversations created.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}
// ─── GET /chat/conversations ──────────────────────────────────────────────────
// Returns all conversations for the logged-in user (student or counsellor)
export async function getConversations(req, res) {
  try {
    const userId = req.user.id;
    const role   = req.user.role;

    const query = role === 'student'
      ? { student_id: userId }
      : { counsellor_id: userId };

    const conversations = await Conversation.find(query)
      .sort({ last_message_at: -1 });

    res.json(conversations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── GET /chat/messages/:conversationId ───────────────────────────────────────
// Returns message history for a conversation (paginated)
// GET /chat/messages/:conversationId
export async function getMessages(req, res) {
  try {
    const { conversationId } = req.params;
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip  = (page - 1) * limit;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });

    const userId = req.user.id;
    const role   = req.user.role;

    // ✅ Admin can see all conversations — only restrict student/counsellor
    if (role !== 'admin') {
      if (conversation.student_id !== userId && conversation.counsellor_id !== userId) {
        return res.status(403).json({ message: 'Access denied.' });
      }
    }

    const messages = await Message.find({ conversation_id: conversationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json(messages.reverse());
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}



// ─── POST /chat/conversations/start ───────────────────────────────────────────
// Create or get existing conversation between student and counsellor
export async function startConversation(req, res) {
  try {
    const userId = req.user.id;
    const role   = req.user.role;

    let student_id, counsellor_id, student_name, counsellor_name;

    if (role === 'student') {
      student_id      = userId;
      student_name    = req.user.name;
      counsellor_id   = parseInt(req.body.counsellor_id);
      counsellor_name = req.body.counsellor_name || 'Counsellor';
    } else {
      counsellor_id   = userId;
      counsellor_name = req.user.name;
      student_id      = parseInt(req.body.student_id);
      student_name    = req.body.student_name || 'Student';
    }

    if (!student_id || !counsellor_id) {
      return res.status(400).json({ message: 'student_id and counsellor_id required.' });
    }

    // Find or create conversation
    let conversation = await Conversation.findOne({ student_id, counsellor_id });

    if (!conversation) {
      conversation = await Conversation.create({
        student_id,
        counsellor_id,
        student_name,
        counsellor_name,
      });
    }

    res.json(conversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── PUT /chat/messages/read/:conversationId ──────────────────────────────────
// Mark all messages as read for current user
export async function markAsRead(req, res) {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const role   = req.user.role;

    // Mark messages as read
    await Message.updateMany(
      { conversation_id: conversationId, sender_id: { $ne: userId }, is_read: false },
      { is_read: true }
    );

    // Reset unread count
    const unreadField = role === 'student' ? 'student_unread' : 'counsellor_unread';
    await Conversation.findByIdAndUpdate(conversationId, { [unreadField]: 0 });

    res.json({ message: 'Messages marked as read.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}



// GET /chat/admin/conversations  (admin only — sees all)
export async function getAllConversations(req, res) {
  try {
    const conversations = await Conversation.find({})
      .sort({ last_message_at: -1 });
    res.json(conversations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}