// src/controllers/staff/chat.controller.js
import db from "../../models/mysql/index.js";
import rawDb from "../../config/db.js";
import staffSocketManager from "../../services/socket.service.js";

const { StaffMessage } = db;

export async function getMessages(req, res) {
  try {
    const { channel, peer } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    if (peer) {
      // A direct-message thread between the current user and `peer`.
      const peerId = parseInt(peer, 10);
      const [rows] = await rawDb.query(
        `SELECT m.*, u.name AS sender_name, u.role AS sender_role
         FROM staff_messages m
         LEFT JOIN users u ON u.id = m.sender_id
         WHERE (m.sender_id = ? AND m.recipient_id = ?)
            OR (m.sender_id = ? AND m.recipient_id = ?)
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT ?`,
        [req.user.id, peerId, peerId, req.user.id, limit],
      );

      // Mark the peer's messages to me as read now that I've fetched the thread.
      await rawDb.query(
        `UPDATE staff_messages SET is_read = 1 WHERE sender_id = ? AND recipient_id = ? AND is_read = 0`,
        [peerId, req.user.id],
      );

      return res.json({ success: true, messages: rows.reverse() });
    }

    const chosenChannel = channel || "general";
    const [rows] = await rawDb.query(
      `SELECT m.*, u.name AS sender_name, u.role AS sender_role
       FROM staff_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.recipient_id IS NULL
         AND (m.channel = ? OR (m.channel IS NULL AND ? = 'general'))
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ?`,
      [chosenChannel, chosenChannel, limit],
    );

    res.json({ success: true, messages: rows.reverse() });
  } catch (error) {
    console.error("getMessages error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function sendMessage(req, res) {
  try {
    const { message, channel, recipient_id } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: "Message is required" });
    }

    if (recipient_id) {
      if (Number(recipient_id) === req.user.id) {
        return res.status(400).json({ success: false, message: "Cannot message yourself" });
      }
      const [recipientRows] = await rawDb.query(
        "SELECT id, name, role FROM users WHERE id = ? AND is_deleted = 0 AND role IN ('admin','counsellor','processing_officer')",
        [recipient_id],
      );
      if (!recipientRows || recipientRows.length === 0) {
        return res.status(404).json({ success: false, message: "Recipient not found" });
      }

      const created = await StaffMessage.create({
        sender_id: req.user.id,
        recipient_id: Number(recipient_id),
        channel: null,
        message,
        is_read: 0,
      });

      const fullMessage = { ...created, sender_name: req.user.name, sender_role: req.user.role };
      staffSocketManager.sendDirectMessage(req.user.id, Number(recipient_id), fullMessage);

      return res.status(201).json({ success: true, data: fullMessage });
    }

    const chosenChannel = channel || "general";

    const created = await StaffMessage.create({
      sender_id: req.user.id,
      recipient_id: null,
      channel: chosenChannel,
      message,
      is_read: 0,
    });

    const fullMessage = {
      ...created,
      sender_name: req.user.name,
      sender_role: req.user.role,
    };

    staffSocketManager.broadcastMessage(chosenChannel, fullMessage);

    res.status(201).json({ success: true, data: fullMessage });
  } catch (error) {
    console.error("sendMessage error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// Unread DM count per contact, for badges in the contact list.
export async function getUnreadCounts(req, res) {
  try {
    const [rows] = await rawDb.query(
      `SELECT sender_id, COUNT(*) AS unread
       FROM staff_messages
       WHERE recipient_id = ? AND is_read = 0
       GROUP BY sender_id`,
      [req.user.id],
    );
    const counts = {};
    rows.forEach((r) => { counts[r.sender_id] = r.unread; });
    res.json({ success: true, counts });
  } catch (error) {
    console.error("getUnreadCounts error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
