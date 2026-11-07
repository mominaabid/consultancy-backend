// src/controllers/activityLog.controller.js
import rawDb from "../config/db.js";

export async function getApplicationLogs(req, res) {
  try {
    const { id } = req.params;

    const [logs] = await rawDb.query(
      `SELECT
        aal.id,
        aal.application_id,
        aal.action_type,
        aal.from_status,
        aal.to_status,
        aal.note,
        aal.user_id,
        aal.performed_by_role,
        aal.performed_by_name,
        aal.metadata,
        aal.created_at,
        u.name as fallback_performed_by_name
       FROM application_activity_logs aal
       LEFT JOIN users u ON aal.user_id = u.id
       WHERE aal.application_id = ?
       ORDER BY aal.created_at DESC`,
      [id],
    );

    const formatted = (logs || []).map((log) => ({
      id: log.id,
      action_type: log.action_type || "note_added",
      stage_from: log.from_status || null,
      stage_to: log.to_status || null,
      note: log.note || "",
      performed_by_name: log.performed_by_name || log.fallback_performed_by_name || "System",
      performed_by_role: log.performed_by_role || null,
      metadata: log.metadata || null,
      created_at: log.created_at || new Date().toISOString(),
    }));

    res.json(formatted);
  } catch (error) {
    console.error("❌ Get application logs error:", error);
    res.status(500).json({ success: false, message: error.message, data: [] });
  }
}

export async function getLeadLogs(req, res) {
  try {
    const { id } = req.params;
    
    // ✅ FIX: Destructure [rows] from the result
    // rawDb.query() returns [rows, fields]
    const [logs] = await rawDb.query(
      `SELECT 
        lal.id,
        lal.lead_id,
        lal.action_type,
        lal.from_value,
        lal.to_value,
        lal.note,
        lal.user_id,
        lal.created_at,
        u.name as performed_by_name
       FROM lead_activity_logs lal
       LEFT JOIN users u ON lal.user_id = u.id
       WHERE lal.lead_id = ?
       ORDER BY lal.created_at DESC`,
      [id]
    );
    
    // ✅ Check if logs exist
    if (!logs || logs.length === 0) {
      return res.json([]);
    }
    
    
    // ✅ Format the response
    const formatted = logs.map(log => ({
      id: log.id,
      action_type: log.action_type || 'note_added',
      stage_from: log.from_value || null,
      stage_to: log.to_value || null,
      note: log.note || '',
      performed_by_name: log.performed_by_name || 'System',
      created_at: log.created_at || new Date().toISOString(),
    }));

    res.json(formatted);
  } catch (error) {
    console.error("❌ Get lead logs error:", error);
    res.status(500).json({ 
      success: false,
      message: error.message,
      data: []
    });
  }
}