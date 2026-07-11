// src/services/activityLog.service.js
import rawDb from "../config/db.js";

export async function logActivity({
  leadId,
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
    // ✅ rawDb.query() returns [result, fields]
    const [result] = await rawDb.query(
      `INSERT INTO lead_activity_logs 
       (lead_id, action_type, from_value, to_value, note, user_id, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        leadId, 
        actionType || 'note_added', 
        fromValue || null, 
        toValue || null, 
        note || null,
        performedBy || null
      ]
    );
    
    console.log(`✅ Log created for lead ${leadId}:`, { 
      actionType, 
      note: note || 'No note',
      insertId: result.insertId
    });
    
    return result.insertId;
  } catch (error) {
    console.error("❌ Error logging activity:", error);
    return null;
  }
}