import Conversation from "../models/mongo/Conversation.js";
import Message from "../models/mongo/Message.js";
import { publishToChannel } from "../services/ably.service.js";
import { sendChatNotificationEmail } from "../services/email.service.js";
import sseManager from "../utils/sseManager.js";
import db from "../models/mysql/index.js";
import { Op } from "sequelize";
import { storeNotification } from "../utils/notificationHelper.js"; // <-- ADDED

const { Lead, User } = db;

async function isConversationCurrentlyAssigned(conversation, userRole, userId) {
  if (userRole === "student") {
    // Find the lead belonging to this student (by user_id)
    const lead = await Lead.findOne({
      where: { user_id: userId, is_deleted: false },
      attributes: ["counsellor_id"],
    });
    if (!lead) return false;
    return lead.counsellor_id === conversation.counsellor_id;
  } else if (userRole === "counsellor") {
    // Find a lead where counsellor_id = userId and lead's user_id = conversation.student_id
    const lead = await Lead.findOne({
      where: {
        counsellor_id: userId,
        user_id: conversation.student_id,
        is_deleted: false,
      },
      attributes: ["id"],
    });
    return !!lead;
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

    if (!conversationId || !content?.trim()) {
      return res
        .status(400)
        .json({ message: "conversationId and content required." });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation)
      return res.status(404).json({ message: "Conversation not found." });

    // Check if this conversation is currently assigned
    const isAssigned = await isConversationCurrentlyAssigned(
      conversation,
      user.role,
      user.id,
    );
    if (!isAssigned) {
      return res.status(403).json({
        message:
          "Cannot send message: this counsellor/student is no longer assigned.",
      });
    }

    if (
      conversation.student_id !== user.id &&
      conversation.counsellor_id !== user.id
    ) {
      return res.status(403).json({ message: "Access denied." });
    }

    const message = await Message.create({
      conversation_id: conversationId,
      sender_id: user.id,
      sender_role: user.role,
      sender_name: user.name,
      content: content.trim(),
      type: "text",
    });

    const isStudent = user.role === "student";
    const recipientId = isStudent
      ? conversation.counsellor_id
      : conversation.student_id;
    const unreadField = isStudent ? "counsellor_unread" : "student_unread";

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

    // ---------- SSE NOTIFICATION FOR RECIPIENT (BELL) ----------
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
      // Don't break the response if SSE fails
    }

    // ---------- STORE NOTIFICATION IN DATABASE (PERSISTENT) ----------
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
      // Don't break the response if storage fails
    }

    // ---------- SEND EMAIL NOTIFICATION TO RECIPIENT ----------
    try {
      const recipientUser = await User.findOne({
        where: { id: recipientId },
        attributes: ["email", "name"],
      });

      if (recipientUser && recipientUser.email) {
        await sendChatNotificationEmail({
          recipientName: recipientUser.name || "User",
          recipientEmail: recipientUser.email,
          senderName: user.name,
          senderRole: user.role,
          messagePreview: content.trim(),
          conversationId: conversationId,
        });
        console.log(
          `📧 Chat notification email sent to ${recipientUser.email}`,
        );
      } else {
        console.warn(
          `⚠️ Could not find user or email for recipientId: ${recipientId}`,
        );
      }
    } catch (emailError) {
      // Don't break the message sending if email fails
      console.error("❌ Failed to send chat notification email:", emailError);
    }
    // ------------------------------------------------------------

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
    const leads = await Lead.findAll({
      where: {
        status: ["counseling", "applied", "visa", "success"],
        counsellor_id: { [Op.ne]: null },
      },
      include: [{ model: User, as: "counsellor", attributes: ["id", "name"] }],
    });

    let created = 0;

    for (const lead of leads) {
      const studentUser = await User.findOne({
        where: { email: lead.email, role: "student" },
        attributes: ["id", "name"],
      });

      if (!studentUser) continue;

      const existing = await Conversation.findOne({
        student_id: studentUser.id,
        counsellor_id: lead.counsellor_id,
      });

      if (!existing) {
        await Conversation.create({
          student_id: studentUser.id,
          counsellor_id: lead.counsellor_id,
          student_name: lead.name,
          counsellor_name: lead.counsellor?.name || "Counsellor",
          last_message: "",
        });
        created++;
        console.log(
          `💬 Created conversation: ${lead.name} ↔ ${lead.counsellor?.name}`,
        );
      }
    }

    res.json({ message: `Sync complete. ${created} conversations created.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function getConversations(req, res) {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    const query =
      role === "student" ? { student_id: userId } : { counsellor_id: userId };

    let conversations = await Conversation.find(query).sort({
      last_message_at: -1,
    });

    // Attach is_currently_assigned to each conversation
    const enrichedConversations = [];
    for (let conv of conversations) {
      const isAssigned = await isConversationCurrentlyAssigned(
        conv,
        role,
        userId,
      );
      const convObj = conv.toObject();
      convObj.is_currently_assigned = isAssigned;
      enrichedConversations.push(convObj);
    }

    res.json(enrichedConversations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function getMessages(req, res) {
  try {
    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation)
      return res.status(404).json({ message: "Conversation not found." });

    const userId = req.user.id;
    const role = req.user.role;

    if (role !== "admin") {
      if (
        conversation.student_id !== userId &&
        conversation.counsellor_id !== userId
      ) {
        return res.status(403).json({ message: "Access denied." });
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