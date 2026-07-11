import Conversation from "../models/mongo/Conversation.js";
import Message from "../models/mongo/Message.js";
import { publishToChannel } from "../services/ably.service.js";
import { sendChatNotificationEmail } from "../services/email.service.js";
import sseManager from "../utils/sseManager.js";
import db from "../models/mysql/index.js";
import { Op } from "sequelize";
import { storeNotification } from "../utils/notificationHelper.js";
import rawDb from "../config/db.js";

const { Lead, User } = db;

// Helper: Get counsellor ID from user ID
async function getCounsellorId(userId) {
  const [counsellorRecord] = await rawDb.query(
    'SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0',
    [userId]
  );
  return counsellorRecord && counsellorRecord.length > 0 ? counsellorRecord[0].id : null;
}

// Helper: Get user ID from counsellor ID
async function getUserIdFromCounsellorId(counsellorId) {
  const [counsellorRecord] = await rawDb.query(
    'SELECT user_id FROM counsellors WHERE id = ? AND is_deleted = 0',
    [counsellorId]
  );
  return counsellorRecord && counsellorRecord.length > 0 ? counsellorRecord[0].user_id : null;
}

async function isConversationCurrentlyAssigned(conversation, userRole, userId) {
  console.log(`🔍 Checking assignment - Role: ${userRole}, User: ${userId}`);
  console.log(`🔍 Conversation - student: ${conversation.student_id}, counsellor: ${conversation.counsellor_id}`);
  
  if (userRole === "student") {
    const [lead] = await rawDb.query(
      'SELECT counsellor_id FROM leads WHERE user_id = ? AND is_deleted = 0',
      [userId]
    );
    console.log(`🔍 Student lead found:`, lead);
    if (!lead || lead.length === 0) return false;
    const isAssigned = lead[0].counsellor_id === conversation.counsellor_id;
    console.log(`🔍 Is student assigned to this counsellor? ${isAssigned}`);
    return isAssigned;
  } 
  else if (userRole === "counsellor") {
    const counsellorId = await getCounsellorId(userId);
    console.log(`🔍 Counsellor ID from table: ${counsellorId}, Conversation counsellor_id: ${conversation.counsellor_id}`);
    
    if (!counsellorId) return false;
    if (conversation.counsellor_id !== counsellorId) {
      console.log(`❌ Counsellor ID mismatch`);
      return false;
    }
    
    const [lead] = await rawDb.query(
      'SELECT id FROM leads WHERE counsellor_id = ? AND user_id = ? AND is_deleted = 0',
      [counsellorId, conversation.student_id]
    );
    console.log(`🔍 Lead found for this assignment:`, lead);
    return lead && lead.length > 0;
  }
  return false;
}

/**
 * Ensure a conversation exists between a student and a counsellor.
 * Creates it if missing.
 */
async function ensureConversation(
  studentId,
  counsellorId,
  studentName,
  counsellorName,
) {
  let conversation = await Conversation.findOne({
    student_id: studentId,
    counsellor_id: counsellorId,
  });
  if (!conversation) {
    conversation = await Conversation.create({
      student_id: studentId,
      counsellor_id: counsellorId,
      student_name: studentName,
      counsellor_name: counsellorName,
      last_message: "",
    });
    console.log(
      `[Chat] Created conversation: student ${studentId} ↔ counsellor ${counsellorId}`,
    );
  }
  return conversation;
}

export async function sendMessage(req, res) {
  try {
    const { conversationId, content } = req.body;
    const user = req.user;

    console.log(`📤 Sending message to conversation: ${conversationId}`);
    console.log(`📤 User: ${user.id} (${user.role})`);

    if (!conversationId || !content?.trim()) {
      return res
        .status(400)
        .json({ message: "conversationId and content required." });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      console.log(`❌ Conversation not found: ${conversationId}`);
      return res.status(404).json({ message: "Conversation not found." });
    }

    // ✅ Check if user is part of this conversation
    let isAuthorized = false;

    if (user.role === "student" && conversation.student_id === user.id) {
      isAuthorized = true;
      console.log(`✅ Student authorized`);
    } 
    else if (user.role === "counsellor") {
      const counsellorId = await getCounsellorId(user.id);
      if (counsellorId && conversation.counsellor_id === counsellorId) {
        isAuthorized = true;
        console.log(`✅ Counsellor authorized`);
      }
    }

    if (!isAuthorized) {
      console.log(`❌ User ${user.id} is not part of conversation ${conversationId}`);
      return res.status(403).json({ 
        message: "Access denied. You are not part of this conversation.",
        details: {
          userId: user.id,
          userRole: user.role,
          studentId: conversation.student_id,
          counsellorId: conversation.counsellor_id
        }
      });
    }

    // ✅ Check if this conversation is currently assigned
    const isAssigned = await isConversationCurrentlyAssigned(
      conversation,
      user.role,
      user.id,
    );
    if (!isAssigned) {
      return res.status(403).json({
        message: "Cannot send message: this counsellor/student is no longer assigned.",
      });
    }

    // ✅ Create the message
    const message = await Message.create({
      conversation_id: conversationId,
      sender_id: user.id,
      sender_role: user.role,
      sender_name: user.name,
      content: content.trim(),
      type: "text",
    });

    // ✅ Determine recipient ID (user_id, not counsellor_id)
    const isStudent = user.role === "student";
    let recipientId;

    if (isStudent) {
      // Student sending to counsellor - get counsellor's user_id
      const counsellorUserId = await getUserIdFromCounsellorId(conversation.counsellor_id);
      recipientId = counsellorUserId || conversation.counsellor_id;
      console.log(`📤 Student sending to counsellor user_id: ${recipientId}`);
    } else {
      // Counsellor sending to student
      recipientId = conversation.student_id;
      console.log(`📤 Counsellor sending to student user_id: ${recipientId}`);
    }

    // ✅ Determine unread field for recipient
    const [recipientUser] = await rawDb.query(
      'SELECT role FROM users WHERE id = ? AND is_deleted = 0',
      [recipientId]
    );

    let unreadField = "student_unread";
    if (recipientUser && recipientUser.length > 0) {
      if (recipientUser[0].role === "counsellor") {
        const counsellorId = await getCounsellorId(recipientId);
        if (counsellorId) {
          unreadField = "counsellor_unread";
        }
      } else if (recipientUser[0].role === "student") {
        unreadField = "student_unread";
      }
    }
    console.log(`📊 Updating ${unreadField} for recipient ${recipientId}`);

    // ✅ Update conversation
    await Conversation.findByIdAndUpdate(conversationId, {
      last_message: content.trim(),
      last_message_at: new Date(),
      $inc: { [unreadField]: 1 },
    });

    const messageData = {
      _id: message._id,
      conversation_id: conversationId,
      sender_id: user.id,
      sender_role: user.role,
      sender_name: user.name,
      content: message.content,
      createdAt: message.createdAt,
    };

    const fullMessagePayload = { message: messageData };

    // ✅ Publish to Ably
    await publishToChannel(
      `conversation:${conversationId}`,
      "new_message",
      fullMessagePayload,
    );

    await publishToChannel(`user:${recipientId}`, "new_message_notification", {
      conversationId,
      senderName: user.name,
      senderRole: user.role,
      preview: content.trim().slice(0, 60),
    });

    await publishToChannel(`user:${user.id}`, "new_message_notification", {
      conversationId,
      senderName: user.name,
      senderRole: user.role,
      preview: content.trim().slice(0, 60),
      isFromMe: true,
    });

    // ---------- SSE NOTIFICATION FOR RECIPIENT ----------
    try {
      const senderLabel = user.role === "counsellor" ? "Counsellor" : "Student";
      const sseEvent = {
        type: "new_chat_message",
        message: `${senderLabel} ${user.name}: ${content.trim()}`,
        senderName: user.name,
        senderRole: user.role,
        conversationId: conversationId,
        preview: content.trim(),
        timestamp: new Date().toISOString(),
      };
      sseManager.sendToUser(recipientId, sseEvent);
      console.log(`🔔 SSE chat notification sent to user ${recipientId}`);
    } catch (sseError) {
      console.error("❌ Failed to send SSE notification:", sseError);
    }

    // ---------- STORE NOTIFICATION IN DATABASE ----------
    try {
      const preview = content.trim().slice(0, 60);
      const senderLabel = user.role === "counsellor" ? "Counsellor" : "Student";
      await storeNotification(
        recipientId,
        "chat_message",
        `New message from ${senderLabel} ${user.name}: ${preview}`,
        {
          conversationId,
          senderName: user.name,
          senderRole: user.role,
          preview,
        },
      );
      console.log(`💾 Chat notification stored for user ${recipientId}`);
    } catch (storeError) {
      console.error("❌ Failed to store notification:", storeError);
    }

    // ---------- SEND EMAIL NOTIFICATION TO RECIPIENT ----------
    try {
      const [recipientUserEmail] = await rawDb.query(
        'SELECT id, name, email FROM users WHERE id = ? AND is_deleted = 0',
        [recipientId]
      );

      if (recipientUserEmail && recipientUserEmail.length > 0) {
        const userData = recipientUserEmail[0];
        await sendChatNotificationEmail({
          recipientName: userData.name || "User",
          recipientEmail: userData.email,
          senderName: user.name,
          senderRole: user.role,
          messagePreview: content.trim(),
          conversationId: conversationId,
        });
        console.log(`📧 Chat notification email sent to ${userData.email}`);
      } else {
        console.warn(`⚠️ Could not find user for recipientId: ${recipientId}`);
      }
    } catch (emailError) {
      console.error("❌ Failed to send chat notification email:", emailError);
    }

    res.status(201).json(messageData);
  } catch (error) {
    console.error("sendMessage error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function sendTyping(req, res) {
  try {
    const { conversationId, isTyping } = req.body;
    const user = req.user;

    await publishToChannel(
      `conversation:${conversationId}`,
      isTyping ? "typing_start" : "typing_stop",
      { userId: user.id, userName: user.name, role: user.role },
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function syncConversations(req, res) {
  try {
    // ✅ Get counsellor ID mapping
    const [counsellorRecords] = await rawDb.query(`
      SELECT c.id as counsellor_id, c.user_id, u.name as counsellor_name
      FROM counsellors c
      JOIN users u ON u.id = c.user_id
      WHERE c.is_deleted = 0
    `);

    const counsellorMap = {};
    counsellorRecords.forEach(c => {
      counsellorMap[c.counsellor_id] = c.counsellor_name || 'Counsellor';
    });

    // ✅ Get all leads with counsellor_id and user_id
    const [leads] = await rawDb.query(`
      SELECT 
        l.id as lead_id,
        l.name as student_name,
        l.email,
        l.user_id,
        l.counsellor_id
      FROM leads l
      WHERE l.counsellor_id IS NOT NULL
        AND l.user_id IS NOT NULL
        AND l.is_deleted = 0
        AND l.status IN ('counseling', 'evaluated', 'applied', 'visa', 'success')
    `);

    let created = 0;

    for (const lead of leads) {
      const studentId = lead.user_id;
      const counsellorId = lead.counsellor_id;
      const counsellorName = counsellorMap[counsellorId] || 'Counsellor';

      const existing = await Conversation.findOne({
        student_id: studentId,
        counsellor_id: counsellorId,
      });

      if (!existing) {
        await Conversation.create({
          student_id: studentId,
          counsellor_id: counsellorId,
          student_name: lead.student_name,
          counsellor_name: counsellorName,
          last_message: "",
        });
        created++;
        console.log(
          `💬 Created conversation: ${lead.student_name} ↔ ${counsellorName}`,
        );
      }
    }

    res.json({ 
      success: true, 
      message: `Sync complete. ${created} conversations created.` 
    });
  } catch (error) {
    console.error("Sync conversations error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getConversations(req, res) {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    console.log(`📊 Fetching conversations for ${role} with ID: ${userId}`);

    let conversations = [];

    if (role === "student") {
      const [lead] = await rawDb.query(
        'SELECT counsellor_id FROM leads WHERE user_id = ? AND is_deleted = 0',
        [userId]
      );
      
      console.log('📊 Student lead found:', lead);

      if (!lead || lead.length === 0) {
        console.log('⚠️ No lead found for student');
        return res.json([]);
      }

      if (!lead[0].counsellor_id) {
        console.log('⚠️ No counsellor assigned to student');
        return res.json([]);
      }

      const counsellorId = lead[0].counsellor_id;
      console.log(`📊 Counsellor ID: ${counsellorId}`);

      let conversation = await Conversation.findOne({
        student_id: userId,
        counsellor_id: counsellorId,
      });

      if (!conversation) {
        console.log('💬 Creating new conversation...');
        
        const [counsellor] = await rawDb.query(
          'SELECT name FROM users WHERE id = (SELECT user_id FROM counsellors WHERE id = ?) AND is_deleted = 0',
          [counsellorId]
        );
        const counsellorName = counsellor?.[0]?.name || 'Counsellor';

        conversation = await Conversation.create({
          student_id: userId,
          counsellor_id: counsellorId,
          student_name: req.user.name || 'Student',
          counsellor_name: counsellorName,
          last_message: "",
        });
        console.log('✅ Conversation created:', conversation._id);
      }

      if (conversation) {
        const convObj = conversation.toObject();
        convObj.is_currently_assigned = true;
        conversations.push(convObj);
      }
    } 
    else if (role === "counsellor") {
      // ✅ Get counsellor ID from counsellors table
      const counsellorId = await getCounsellorId(userId);
      console.log(`📊 Counsellor ID from table: ${counsellorId}`);

      if (!counsellorId) {
        console.log('⚠️ No counsellor record found');
        return res.json([]);
      }

      const [leads] = await rawDb.query(
        'SELECT id, user_id, name FROM leads WHERE counsellor_id = ? AND is_deleted = 0 AND user_id IS NOT NULL',
        [counsellorId]
      );
      
      console.log(`📊 Counsellor has ${leads?.length || 0} assigned students`);

      if (!leads || leads.length === 0) {
        return res.json([]);
      }

      for (const lead of leads) {
        let conversation = await Conversation.findOne({
          student_id: lead.user_id,
          counsellor_id: counsellorId,
        });

        if (!conversation) {
          console.log(`💬 Creating conversation for student: ${lead.name}`);
          conversation = await Conversation.create({
            student_id: lead.user_id,
            counsellor_id: counsellorId,
            student_name: lead.name,
            counsellor_name: req.user.name || 'Counsellor',
            last_message: "",
          });
        }

        if (conversation) {
          const convObj = conversation.toObject();
          convObj.is_currently_assigned = true;
          conversations.push(convObj);
        }
      }
    }

    conversations.sort((a, b) => {
      return new Date(b.last_message_at) - new Date(a.last_message_at);
    });

    console.log(`✅ Returning ${conversations.length} conversations`);
    res.json(conversations);
  } catch (error) {
    console.error("getConversations error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getMessages(req, res) {
  try {
    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    console.log(`📊 Getting messages for conversation: ${conversationId}`);
    console.log(`📊 User: ${req.user.id} (${req.user.role})`);

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      console.log(`❌ Conversation not found: ${conversationId}`);
      return res.status(404).json({ message: "Conversation not found." });
    }

    const userId = req.user.id;
    const role = req.user.role;

    // ✅ ADMIN: Always allowed
    if (role === "admin") {
      console.log(`✅ Admin access granted`);
    }
    // ✅ STUDENT: Check if they are the student in the conversation
    else if (role === "student" && conversation.student_id === userId) {
      console.log(`✅ Student access granted: ${userId} matches student_id ${conversation.student_id}`);
    }
    // ✅ COUNSELLOR: Check if they are the counsellor in the conversation
    else if (role === "counsellor") {
      const counsellorId = await getCounsellorId(userId);
      if (counsellorId && conversation.counsellor_id === counsellorId) {
        console.log(`✅ Counsellor access granted: ${userId} matches counsellor ${counsellorId}`);
      } else {
        console.log(`❌ Counsellor access denied`);
        return res.status(403).json({ 
          message: "Access denied. You are not the counsellor for this conversation."
        });
      }
    }
    else {
      console.log(`❌ Access denied. User ${userId} (${role}) cannot access conversation ${conversationId}`);
      return res.status(403).json({ 
        message: "Access denied.",
        details: {
          userId,
          role,
          studentId: conversation.student_id,
          counsellorId: conversation.counsellor_id
        }
      });
    }

    const messages = await Message.find({ conversation_id: conversationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    console.log(`✅ Returning ${messages.length} messages`);

    res.json(messages.reverse());
  } catch (error) {
    console.error("getMessages error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function startConversation(req, res) {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let student_id, counsellor_id, student_name, counsellor_name;

    if (role === "student") {
      student_id = userId;
      student_name = req.user.name;
      counsellor_id = parseInt(req.body.counsellor_id);
      counsellor_name = req.body.counsellor_name || "Counsellor";
    } else {
      counsellor_id = userId;
      counsellor_name = req.user.name;
      student_id = parseInt(req.body.student_id);
      student_name = req.body.student_name || "Student";
    }

    if (!student_id || !counsellor_id) {
      return res
        .status(400)
        .json({ message: "student_id and counsellor_id required." });
    }

    let conversation = await Conversation.findOne({
      student_id,
      counsellor_id,
    });

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

export async function markAsRead(req, res) {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    await Message.updateMany(
      {
        conversation_id: conversationId,
        sender_id: { $ne: userId },
        is_read: false,
      },
      { is_read: true },
    );

    let unreadField = "";

    if (role?.toLowerCase() === "student") {
      unreadField = "student_unread";
    }

    if (
      role?.toLowerCase() === "counsellor" ||
      role?.toLowerCase() === "counselor"
    ) {
      unreadField = "counsellor_unread";
    }
    if (unreadField) {
      await Conversation.findByIdAndUpdate(conversationId, {
        [unreadField]: 0,
      });
    }

    res.json({ message: "Messages marked as read." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function getAllConversations(req, res) {
  try {
    const { start, end } = req.query;
    let filter = {};
    if (start && end) {
      filter.createdAt = {
        $gte: new Date(start),
        $lt: new Date(end),
      };
    }

    const conversations = await Conversation.find(filter)  
      .sort({ last_message_at: -1 });
    
    res.json(conversations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}