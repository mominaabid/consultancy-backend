import Notification from "../models/mysql/Notification.js";

export async function storeNotification(userId, type, message, metadata = {}) {
  if (!userId) {
    throw new Error("User ID is required to store notification");
  }

  try {
    const safeMetadata = typeof metadata === "object" ? metadata : {};

    const notification = await Notification.create({
      user_id: userId,
      type,
      message,
      metadata: safeMetadata,
      is_read: false,
    });

    console.log(`📦 Stored notification for user ${userId}: ${type}`);
    return notification.toJSON();
  } catch (err) {
    console.error("Failed to store notification:", err);
    throw err;
  }
}
