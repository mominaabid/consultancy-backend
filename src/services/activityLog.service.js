import db from '../models/mysql/index.js';

const { LeadActivityLog } = db;

export async function logActivity({
  leadId,
  actionType,
  fromValue        = null,
  toValue          = null,
  note             = null,
  performedBy      = null,
  performedByRole  = null,
  performedByName  = null,
}) {
  try {
    // leadId can be null for non-lead actions (counsellor created etc.)
    await LeadActivityLog.create({
      lead_id:           leadId,
      action_type:       actionType,
      from_value:        fromValue,
      to_value:          toValue,
      note,
      performed_by:      performedBy,
      performed_by_role: performedByRole,
      performed_by_name: performedByName,
    });
  } catch (err) {
    // Never throw — log failure must never break main API flow
    console.error('⚠️ Activity log failed:', err.message);
  }
}