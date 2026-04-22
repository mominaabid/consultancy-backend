import db from '../models/mysql/index.js';

const { LeadActivityLog } = db;

// GET /admin/leads/:id/logs
export async function getLeadLogs(req, res) {
  try {
    const logs = await LeadActivityLog.findAll({
      where: { lead_id: req.params.id },
      order: [['created_at', 'DESC']],
    });
    res.json(logs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}