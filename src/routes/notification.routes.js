// src/routes/notification.routes.js
import { Router } from "express";
import db from "../models/mysql/index.js";
import auth from "../middleware/auth.middleware.js";

const router = Router();

// GET /api/notifications?unread=true
router.get("/", auth, async (req, res) => {
    try {
        const userId = req.user.id;
     const unreadOnly = req.query.unread === 'true' || req.query.is_read === 'true';
        
        const where = { user_id: userId };
        if (unreadOnly) {
            where.is_read = 0;
        }
        
        const notifications = await db.Notification.findAll({
            where,
            order: [['created_at', 'DESC']]
        });
        
       res.json({ success: true, notifications });
    } catch (error) {
        console.error("Get notifications error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch notifications",
            error: error.message
        });
    }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", auth, async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.user.id;
        
        const updated = await db.Notification.update(
            { is_read: 1 },
            { where: { id: notificationId, user_id: userId } }
        );
        
        if (updated === 0) {
            return res.status(404).json({
                success: false,
                message: "Notification not found"
            });
        }
        
        res.json({
            success: true,
            message: "Notification marked as read"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to mark as read",
            error: error.message
        });
    }
});

// PATCH /api/notifications/mark-all-read
router.patch("/mark-all-read", auth, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const updated = await db.Notification.update(
            { is_read: 1 },
            { where: { user_id: userId, is_read: 0 } }
        );
        
        res.json({
            success: true,
            message: `${updated} notifications marked as read`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to mark all as read",
            error: error.message
        });
    }
});

// DELETE /api/notifications
router.delete("/", auth, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const deleted = await db.Notification.destroy({
            where: { user_id: userId }
        });
        
        res.json({
            success: true,
            message: `${deleted} notifications deleted`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to delete notifications",
            error: error.message
        });
    }
});

export default router;