import db from '../models/mysql/index.js';
const { Lead, User } = db;

// CREATE LEAD
export async function createLead(req, res) {
  try {
    const lead = await Lead.create(req.body);
    res.status(201).json(lead);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// GET ALL LEADS
export async function getAllLeads(req, res) {
  try {
    const leads = await Lead.findAll({
      include: [{ model: User, as: 'counsellor' }]
      // Removed is_deleted filter because column doesn't exist in your table
    });
    res.json(leads);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ASSIGN COUNSELLOR
export async function assignCounsellor(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    lead.counsellor_id = req.body.counsellor_id;
    await lead.save();
    res.json(lead);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// UPDATE STAGE
export async function updateStage(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    lead.status = req.body.status;
    await lead.save();
    res.json(lead);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}