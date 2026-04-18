// import db from '../models/mysql/index.js';
// const { Lead, User } = db;

// // CREATE LEAD
// export async function createLead(req, res) {
//   try {
//     const data = {
//       ...req.body,
//       counsellor_id:
//         req.body.counsellor_id === "" || !req.body.counsellor_id
//           ? null
//           : Number(req.body.counsellor_id),
//     };

//     const lead = await Lead.create(data);
//     res.status(201).json(lead);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: error.message });
//   }
// }
// export async function updateLead(req, res) {
//   try {
//     const lead = await Lead.findByPk(req.params.id);
//     if (!lead) return res.status(404).json({ message: "Lead not found" });

//     await lead.update(req.body);

//     res.json(lead);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// }
// // DELETE LEAD
// export async function deleteLead(req, res) {
//   try {
//     const lead = await Lead.findByPk(req.params.id);

//     if (!lead) {
//       return res.status(404).json({ message: "Lead not found" });
//     }

//     await lead.destroy();

//     res.json({ message: "Lead deleted successfully" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: error.message });
//   }
// }
// // GET ALL LEADS
// export async function getAllLeads(req, res) {
//   try {
//     const leads = await Lead.findAll({
//       include: [{ model: User, as: 'counsellor' }]
//       // Removed is_deleted filter because column doesn't exist in your table
//     });
//     res.json(leads);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: error.message });
//   }
// }

// // ASSIGN COUNSELLOR
// export async function assignCounsellor(req, res) {
//   try {
//     const lead = await Lead.findByPk(req.params.id);
//     if (!lead) return res.status(404).json({ message: "Lead not found" });

//     lead.counsellor_id = req.body.counsellor_id;
//     await lead.save();
//     res.json(lead);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: error.message });
//   }
// }

// // UPDATE STAGE
// export async function updateStage(req, res) {
//   try {
//     const lead = await Lead.findByPk(req.params.id);
//     if (!lead) return res.status(404).json({ message: "Lead not found" });

//     lead.status = req.body.status;
//     await lead.save();
//     res.json(lead);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: error.message });
//   }
// }
import db from '../models/mysql/index.js';

const { Lead, User } = db;

// POST /admin/leads
export async function createLead(req, res) {
  try {
    const data = {
      ...req.body,
      counsellor_id:
        req.body.counsellor_id === '' || !req.body.counsellor_id
          ? null
          : Number(req.body.counsellor_id),
    };
    const lead = await Lead.create(data);
    res.status(201).json(lead);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// GET /admin/leads
export async function getAllLeads(req, res) {
  try {
    const leads = await Lead.findAll({
      include: [{ model: User, as: 'counsellor' }],
      order: [['createdAt', 'DESC']],
    });
    res.json(leads);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// GET /admin/leads/:id
export async function getLeadById(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id, {
      include: [{ model: User, as: 'counsellor' }],
    });
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    res.json(lead);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// PUT /admin/leads/:id
export async function updateLead(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    await lead.update(req.body);
    res.json(lead);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// PUT /admin/leads/:id/assign
export async function assignCounsellor(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    lead.counsellor_id = req.body.counsellor_id || null;
    await lead.save();
    res.json(lead);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// PUT /admin/leads/:id/stage
export async function updateStage(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    lead.status = req.body.status;
    await lead.save();
    res.json(lead);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// DELETE /admin/leads/:id
export async function deleteLead(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    await lead.destroy();
    res.json({ message: 'Lead deleted successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}