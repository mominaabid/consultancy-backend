import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import Notification from "../models/mysql/Notification.js";

const router = express.Router();

// GET /api/notifications?unread=true
router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { unread } = req.query;

  try {
    const whereClause = { user_id: userId };
    if (unread === "true") {
      whereClause.is_read = false;
    }

    const notifications = await Notification.findAll({
      where: whereClause,
      order: [["created_at", "DESC"]],
    });

    res.json({ success: true, notifications });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// PATCH /api/notifications/mark-all-read
router.patch("/mark-all-read", authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    await Notification.update(
      { is_read: true },
      { where: { user_id: userId, is_read: false } },
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    await Notification.update(
      { is_read: true },
      { where: { id, user_id: userId } },
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
