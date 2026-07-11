// src/utils/notificationHelper.js
import db from "../models/mysql/index.js";

export async function storeNotification(userId, type, message, metadata = {}) {
    if (!userId) {
        throw new Error("User ID is required to store notification");
    }

    try {
        const notification = await db.Notification.create({
            user_id: userId,
            type,
            message,
            metadata: JSON.stringify(metadata),
            is_read: 0,
            created_at: new Date()
        });

        console.log(`📦 Stored notification for user ${userId}: ${type}`);
        return notification;
    } catch (err) {
        console.error("Failed to store notification:", err);
        throw err;
    }
}