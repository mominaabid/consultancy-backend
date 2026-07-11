// src/controllers/activityLog.controller.js
import rawDb from "../config/db.js";

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
      console.log(`📭 No logs found for lead ${id}`);
      return res.json([]);
    }
    
    console.log(`📥 Found ${logs.length} logs for lead ${id}:`, logs);
    
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

    console.log(`📤 Returning ${formatted.length} formatted logs`);
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