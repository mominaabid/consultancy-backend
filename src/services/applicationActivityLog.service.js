// src/services/applicationActivityLog.service.js
import rawDb from "../config/db.js";

export async function logApplicationActivity({
  applicationId,
  studentId,
  actionType,
  fromValue,
  toValue,
  note,
  performedBy,
  performedByRole,
  performedByName,
  metadata,
}) {
  try {
    const [result] = await rawDb.query(
      `INSERT INTO application_activity_logs
       (application_id, student_id, action_type, from_status, to_status, note, user_id, performed_by_role, performed_by_name, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        applicationId,
        studentId || null,
        actionType || "note_added",
        fromValue || null,
        toValue || null,
        note || null,
        performedBy || null,
        performedByRole || null,
        performedByName || null,
        metadata ? JSON.stringify(metadata) : null,
      ],
    );
    return result.insertId;
  } catch (error) {
    console.error("❌ Error logging application activity:", error);
    return null;
  }
}
