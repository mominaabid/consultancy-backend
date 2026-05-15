import db from "../models/mysql/index.js";
const { LeadActivityLog, User } = db;

export async function getLeadLogs(req, res) {
  try {
    const logs = await LeadActivityLog.findAll({
      where: { lead_id: req.params.id },
      order: [['created_at', 'DESC']],
      include: [
        {
          model: User,
          as: "performer",
          attributes: ["name"],
          required: false,
        }
      ],
    });

    const formatted = logs.map(log => ({
      id: log.id,
      action_type: log.action_type,
      note: log.note,
      stage_from: log.stage_from,
      stage_to: log.stage_to,
      performed_by_name: log.performer?.name || "System",
      created_at: log.created_at,
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}