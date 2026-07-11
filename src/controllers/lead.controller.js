// src/controllers/lead.controller.js
import crypto from "crypto";
import db from "../models/mysql/index.js";
// ✅ IMPORT RAW DATABASE CONNECTION
import rawDb from "../config/db.js";
import { sendPasswordSetupEmail } from "../services/email.service.js";
import { logActivity } from "../services/activityLog.service.js";
import { sendLeadAssignmentEmail } from "../services/counsellorEmail.service.js";
import Conversation from "../models/mongo/Conversation.js";
import sseManager from "../utils/sseManager.js";
import { storeNotification } from "../utils/notificationHelper.js";

const { Lead, User, PasswordResetToken, LeadEducation } = db;

// ✅ Helper function for search conditions (replaces Op.or)
function buildSearchConditions(searchTerm) {
    if (!searchTerm) return { sql: '', params: [] };
    return {
        sql: `AND (l.name LIKE ? OR l.email LIKE ? OR l.phone LIKE ?)`,
        params: [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]
    };
}

function validateNoDuplicateDegrees(educationArray) {
  if (!educationArray || !Array.isArray(educationArray)) return null;
  const degrees = educationArray.map((edu) => edu.degree_id || edu.degree);  // ← FIXED
  const uniqueDegrees = new Set(degrees);
  if (degrees.length !== uniqueDegrees.size) {
    return "Duplicate degrees are not allowed for a lead.";
  }
  return null;
}


async function ensureConversation(
  studentId,
  counsellorId,
  studentName,
  counsellorName,
) {
  if (!studentId || !counsellorId) return null;
  let conversation = await Conversation.findOne({
    student_id: studentId,
    counsellor_id: counsellorId,
  });
  if (!conversation) {
    conversation = await Conversation.create({
      student_id: studentId,
      counsellor_id: counsellorId,
      student_name: studentName,
      counsellor_name: counsellorName,
      last_message: "",
    });
    console.log(
      `[Chat] Created conversation: student ${studentId} ↔ counsellor ${counsellorId}`,
    );
  }
  return conversation;
}

function computeEnglishTestOverallScore(testType, scores) {
  if (!testType || !scores) return null;

  try {
    const values = Object.values(scores).filter(
      (v) => v !== "" && !isNaN(parseFloat(v)),
    );
    if (values.length === 0) return null;

    switch (testType) {
      case "ielts":
      case "pte":
        if (values.length !== 4) return null;
        const avg = values.reduce((a, b) => a + parseFloat(b), 0) / 4;
        return Math.round(avg * 2) / 2;
      case "toefl":
        if (values.length !== 4) return null;
        return values.reduce((a, b) => a + parseFloat(b), 0);
      case "duolingo":
        if (values.length !== 4) return null;
        return values.reduce((a, b) => a + parseFloat(b), 0) / 4;
      default:
        return null;
    }
  } catch (err) {
    console.error("Error computing score:", err);
    return null;
  }
}

// src/controllers/lead.controller.js

// src/controllers/lead.controller.js

function sanitizeLeadData(data) {
  const sanitized = { ...data };

  // ✅ Map frontend field names to database column names
  const fieldMap = {
    'source': 'source_id',
    'marital_status': 'marital_status_id',
    'english_proficiency_test': 'english_test_id',
    'preferred_country': 'preferred_country',
  };

  // Apply field mapping
  Object.keys(fieldMap).forEach(frontendField => {
    if (sanitized[frontendField] !== undefined) {
      sanitized[fieldMap[frontendField]] = sanitized[frontendField];
      if (frontendField !== fieldMap[frontendField]) {
        delete sanitized[frontendField];
      }
    }
  });

  // Handle date fields
const dateFields = ["dob"];
for (const field of dateFields) {
  if (!sanitized[field]) {
    sanitized[field] = null;
  } else {
    try {
      const dateObj = new Date(sanitized[field]);
      if (!isNaN(dateObj.getTime())) {
        // ✅ Convert to YYYY-MM-DD format
        sanitized[field] = dateObj.toISOString().split('T')[0];
      } else {
        sanitized[field] = null;
      }
    } catch {
      sanitized[field] = null;
    }
  }
}

  // Handle integer fields
  const intFields = ["counsellor_id", "source_id", "marital_status_id", "english_test_id"];
  for (const field of intFields) {
    if (sanitized[field] === "" || sanitized[field] === null || sanitized[field] === undefined) {
      sanitized[field] = null;
    } else if (!isNaN(Number(sanitized[field]))) {
      sanitized[field] = Number(sanitized[field]);
    } else {
      sanitized[field] = null;
    }
  }



  if (sanitized.english_test_overall_score === "" || sanitized.english_test_overall_score === null) {
    sanitized.english_test_overall_score = null;
  } else if (!isNaN(parseFloat(sanitized.english_test_overall_score))) {
    sanitized.english_test_overall_score = parseFloat(sanitized.english_test_overall_score);
  } else {
    sanitized.english_test_overall_score = null;
  }

  // ✅ Updated valid columns - REMOVED study_level_id
  const validColumns = [
    'name', 'email', 'phone', 'dob', 'marital_status_id', 
    'father_name', 'father_contact', 'home_address', 'source_id', 
    'preferred_country', 'english_test_id', 
    'english_test_overall_score',  'counsellor_id',
    'status', 'profile_picture', 'has_entered_counseling', 'user_id'
  ];

  Object.keys(sanitized).forEach(key => {
    if (!validColumns.includes(key)) {
      delete sanitized[key];
    }
  });

  return sanitized;
}

// ✅ FIXED: Use rawDb instead of db for raw queries
async function handleLeadEducation(leadId, educationArray, transaction = null) {
  if (!educationArray || !Array.isArray(educationArray)) return;

  // ✅ Use rawDb for direct queries
  await rawDb.query('DELETE FROM lead_educations WHERE lead_id = ?', [leadId]);

  if (educationArray.length > 0) {
    for (const edu of educationArray) {
      // ✅ Changed 'degree' to 'degree_id'
      await rawDb.query(
        `INSERT INTO lead_educations (lead_id, degree_id, year_awarded, grades_cgpa, board_university) 
         VALUES (?, ?, ?, ?, ?)`,
        [leadId, edu.degree_id || edu.degree, edu.year_awarded, edu.grades_cgpa || null, edu.board_university || null]
      );
    }
  }
}

async function handleFirstCounselingEntry(lead, actor) {
  if (!lead.email) {
    console.log(`Lead ${lead.id} has no email; cannot send password setup.`);
    return;
  }

  if (lead.has_entered_counseling) {
    console.log(`Lead ${lead.id} already entered counseling before; skipping.`);
    return;
  }

  let student = await User.findOne({
    where: { email: lead.email, role: "student" },
  });
  if (!student) {
    student = await User.create({
      name: lead.name,
      email: lead.email,
      password_hash: "PENDING_SETUP",
      role: "student",
      is_active: false,
    });
  } else {
    await PasswordResetToken.destroy({ where: { user_id: student.id } });
  }

  if (!lead.user_id || lead.user_id !== student.id) {
    await Lead.update({ user_id: student.id }, { where: { id: lead.id } });
  }

  const token = crypto.randomBytes(32).toString("hex");
  await PasswordResetToken.create({
    user_id: student.id,
    token,
    expires_at: new Date(Date.now() + 86400000),
  });

  const setupLink = `${process.env.FRONTEND_URL}/setup-password?token=${token}`;
  await sendPasswordSetupEmail({
    name: lead.name,
    email: lead.email,
    setupLink,
  });

  await Lead.update({ has_entered_counseling: true }, { where: { id: lead.id } });

  await logActivity({
    leadId: lead.id,
    actionType: "setup_email_sent",
    note: `Password setup email sent to ${lead.email} (first entry into Counseling)`,
    performedBy: actor.id,
    performedByRole: actor.role,
    performedByName: actor.name,
  });

  if (lead.counsellor_id) {
    const counsellor = await User.findByPk(lead.counsellor_id, {
      attributes: ["name"],
    });
    const exists = await Conversation.findOne({
      student_id: student.id,
      counsellor_id: lead.counsellor_id,
    });
    if (!exists) {
      await Conversation.create({
        student_id: student.id,
        counsellor_id: lead.counsellor_id,
        student_name: lead.name,
        counsellor_name: counsellor?.name || "Counsellor",
        last_message: "",
      });
    }
  }
}
// src/controllers/lead.controller.js - Fixed createLead

export async function createLead(req, res) {
  try {
    let sanitizedBody = sanitizeLeadData(req.body);

    // ✅ FIX: Auto-assign counsellor_id if user is counsellor
    let counsellorId = null;
    
    // If user is counsellor, get their counsellor ID
 // In lead.controller.js - getAllLeads
if (req.user.role === "counsellor") {
  const [counsellorRows] = await rawDb.query(
    'SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0',
    [req.user.id]
  );
  
  if (counsellorRows && counsellorRows.length > 0) {
    sql += ` AND l.counsellor_id = ?`;
    params.push(counsellorRows[0].id);
  } else {
    sql += ` AND 1 = 0`;
  }
}

    const data = {
      ...sanitizedBody,
      counsellor_id:
        sanitizedBody.counsellor_id === "" || !sanitizedBody.counsellor_id
          ? counsellorId // ✅ Auto-assign if counsellor
          : Number(sanitizedBody.counsellor_id),
    };

    // If admin is assigning to a counsellor, use the provided ID
    if (req.user.role === "admin" && sanitizedBody.counsellor_id) {
      data.counsellor_id = Number(sanitizedBody.counsellor_id);
    }

    // ✅ If counsellor is creating and no counsellor_id is provided, use their own
    if (req.user.role === "counsellor" && !data.counsellor_id) {
      const [counsellorRows] = await rawDb.query(
        'SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0',
        [req.user.id]
      );
      
      if (counsellorRows && counsellorRows.length > 0) {
        data.counsellor_id = counsellorRows[0].id;
      }
    }

    if (data.email) {
      data.email = data.email.trim().toLowerCase();

      const existingLead = await Lead.findOne({
        where: {
          email: data.email,
        },
      });

      if (existingLead) {
        return res.status(400).json({
          message: "A lead with this email already exists.",
        });
      }
    }

    if (data.phone) {
      data.phone = data.phone.trim();

      const existingPhoneLead = await Lead.findOne({
        where: {
          phone: data.phone,
        },
      });

      if (existingPhoneLead) {
        return res.status(400).json({
          message: "A lead with this phone number already exists.",
        });
      }
    }

    // Fix: Use english_test_id instead of english_proficiency_test
    if (
      data.english_test_id &&
      data.english_test_id !== "none"
    ) {
      if (data.english_test_scores) {
        data.english_test_overall_score = computeEnglishTestOverallScore(
          data.english_test_id,
          data.english_test_scores,
        );
      }
    } else {
      data.english_test_overall_score = null;
    }

    data.english_test_overall_score = data.english_test_overall_score || null;

    const lead = await Lead.create(data);

    if (req.body.education && Array.isArray(req.body.education)) {
      await handleLeadEducation(lead.id, req.body.education);
    }

    const degreeError = validateNoDuplicateDegrees(req.body.education);
    if (degreeError) {
      return res.status(400).json({ message: degreeError });
    }

    await logActivity({
      leadId: lead.id,
      actionType: "lead_created",
      toValue: lead.status,
      note: `Lead created · Phone: ${lead.phone || "—"} · Country: ${lead.preferred_country || "—"}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    // ✅ If lead is assigned to a counsellor, send email notification
    if (lead.counsellor_id) {
      // Get counsellor user info
      const counsellorUser = await User.findOne({
        where: { id: lead.counsellor_id, role: "counsellor" },
        attributes: ["id", "name", "email"],
      });

      if (counsellorUser?.email) {
        sendLeadAssignmentEmail({
          counsellorEmail: counsellorUser.email,
          counsellorName: counsellorUser.name,
          lead: lead,
        }).catch((err) => console.error("Background email error:", err));
      }

      // Send SSE notification to counsellor
      const sseEvent = {
        type: "lead_created",
        message: `New lead "${lead.name}" has been created and assigned to you.`,
        leadId: lead.id,
        leadName: lead.name,
        counsellorId: lead.counsellor_id,
        counsellorName: counsellorUser?.name || "Counsellor",
      };

      sseManager.sendToUser(lead.counsellor_id.toString(), sseEvent);

      await storeNotification(
        lead.counsellor_id,
        "lead_created",
        `New lead "${lead.name}" has been created and assigned to you.`,
        {
          leadId: lead.id,
          leadName: lead.name,
          counsellorId: lead.counsellor_id,
          counsellorName: counsellorUser?.name || "Counsellor",
        },
      );
    }

    // ✅ If counsellor created the lead, notify admins
    if (req.user.role === "counsellor") {
      const admins = await User.findAll({
        where: { role: "admin", is_active: true },
        attributes: ["id", "name", "email"],
      });

      for (const admin of admins) {
        const sseEvent = {
          type: "counsellor_added_lead",
          message: `Counsellor "${req.user.name}" has added a new lead: "${lead.name}".`,
          leadId: lead.id,
          leadName: lead.name,
          counsellorId: req.user.id,
          counsellorName: req.user.name,
        };

        sseManager.sendToUser(admin.id.toString(), sseEvent);

        await storeNotification(
          admin.id,
          "counsellor_added_lead",
          `Counsellor "${req.user.name}" added lead "${lead.name}".`,
          {
            leadId: lead.id,
            leadName: lead.name,
            counsellorId: req.user.id,
            counsellorName: req.user.name,
          },
        );
      }
    }

    if (lead.status === "counseling" && !lead.has_entered_counseling) {
      await handleFirstCounselingEntry(lead, req.user);
    }

    res.status(201).json(lead);
  } catch (error) {
    console.error("❌ Error creating lead:", error);
    res.status(500).json({ message: error.message });
  }
}

// src/controllers/lead.controller.js

// src/controllers/lead.controller.js

// src/controllers/lead.controller.js

// src/controllers/lead.controller.js

export async function getAllLeads(req, res) {
  try {
    const { page = 1, limit = 10, search, status, counsellor_id, source_id, start, end } = req.query;
    const offset = (page - 1) * limit;
    
    let sql = `
      SELECT 
        l.*, 
        u.name as counsellor_name,
        c.name as source_name,
        GROUP_CONCAT(
          JSON_OBJECT(
            'id', le.id,
            'degree_id', le.degree_id,
            'degree', cv.name,
            'year_awarded', le.year_awarded,
            'grades_cgpa', le.grades_cgpa,
            'board_university', le.board_university
          )
        ) as education
      FROM leads l
      LEFT JOIN users u ON l.counsellor_id = u.id AND u.is_deleted = 0
      LEFT JOIN config_values c ON l.source_id = c.id
      LEFT JOIN lead_educations le ON l.id = le.lead_id
      LEFT JOIN config_values cv ON le.degree_id = cv.id
      WHERE l.is_deleted = 0
    `;
    const params = [];
    
    if (search) {
      const searchResult = buildSearchConditions(search);
      sql += ` ${searchResult.sql}`;
      params.push(...searchResult.params);
    }
    
    if (status) {
      sql += ` AND l.status = ?`;
      params.push(status);
    }
    
    if (counsellor_id) {
      sql += ` AND l.counsellor_id = ?`;
      params.push(counsellor_id);
    }
    
    if (source_id) {
      sql += ` AND l.source_id = ?`;
      params.push(source_id);
    }
    
    if (start && end) {
      sql += ` AND l.created_at BETWEEN ? AND ?`;
      params.push(new Date(start), new Date(end));
    }
    
    // ✅ FIX: For counsellor, get their counsellor table ID
    if (req.user.role === "counsellor") {
      // Get the counsellor's ID from the counsellors table
      const [counsellorRows] = await rawDb.query(
        'SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0',
        [req.user.id]
      );
      
      if (counsellorRows && counsellorRows.length > 0) {
        const counsellorTableId = counsellorRows[0].id;
        sql += ` AND l.counsellor_id = ?`;
        params.push(counsellorTableId);
        console.log(`🔍 Filtering leads by counsellor_table_id: ${counsellorTableId} (user_id: ${req.user.id})`);
      } else {
        // If no counsellor record, return no leads
        sql += ` AND 1 = 0`;
        console.log(`❌ No counsellor record found for user_id: ${req.user.id}`);
      }
    }
    
    sql += ` GROUP BY l.id`;
    
    let countSql = `SELECT COUNT(*) as total FROM leads l WHERE l.is_deleted = 0`;
    const countParams = [];
    
    // ✅ FIX: Also fix the count query
    if (req.user.role === "counsellor") {
      const [counsellorRows] = await rawDb.query(
        'SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0',
        [req.user.id]
      );
      
      if (counsellorRows && counsellorRows.length > 0) {
        const counsellorTableId = counsellorRows[0].id;
        countSql += ` AND l.counsellor_id = ?`;
        countParams.push(counsellorTableId);
      } else {
        countSql += ` AND 1 = 0`;
      }
    }
    
    const [countResult] = await rawDb.query(countSql, countParams);
    const total = countResult[0]?.total || 0;
    
    sql += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    
    const [result] = await rawDb.query(sql, params);
    const leads = result || [];
    
    const formattedLeads = leads.map(lead => {
      let education = [];
      if (lead.education) {
        try {
          const eduStr = lead.education;
          const cleaned = eduStr.startsWith('[') ? eduStr : `[${eduStr}]`;
          education = JSON.parse(cleaned);
        } catch (e) {
          education = [];
        }
      }
      return {
        ...lead,
        education: education
      };
    });
    
    res.json({
      success: true,
      data: {
        leads: formattedLeads,
        pagination: {
          total: total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error("Get leads error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch leads",
      error: error.message
    });
  }
}

export async function getLeadById(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);

    if (!lead || lead.is_deleted) {
      return res.status(404).json({ message: "Lead not found." });
    }

    // ✅ Get education
    const educationResult = await rawDb.query(
      `SELECT le.*, cv.name as degree_name
       FROM lead_educations le
       LEFT JOIN config_values cv ON le.degree_id = cv.id
       WHERE le.lead_id = ?`,
      [lead.id]
    );
    const education = Array.isArray(educationResult) && Array.isArray(educationResult[0]) 
      ? educationResult[0] 
      : educationResult;
    
    lead.education = education || [];

    res.json(lead);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function updateLead(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);

    if (!lead) {
      return res.status(404).json({ message: "Lead not found." });
    }

    let sanitizedBody = sanitizeLeadData(req.body);

    if (sanitizedBody.email) {
      sanitizedBody.email = sanitizedBody.email.trim().toLowerCase();

      if (sanitizedBody.email !== lead.email?.trim().toLowerCase()) {
        const existingLead = await Lead.findOne({
          where: {
            email: sanitizedBody.email,
          },
        });

        if (existingLead) {
          return res.status(400).json({
            message: "A lead with this email already exists.",
          });
        }
      }
    }

    const degreeError = validateNoDuplicateDegrees(req.body.education);
    if (degreeError) {
      return res.status(400).json({ message: degreeError });
    }

    if (sanitizedBody.phone) {
      sanitizedBody.phone = sanitizedBody.phone.trim();

      if (sanitizedBody.phone !== lead.phone?.trim()) {
        const existingPhoneLead = await Lead.findOne({
          where: {
            phone: sanitizedBody.phone,
          },
        });

        if (existingPhoneLead) {
          return res.status(400).json({
            message: "A lead with this phone number already exists.",
          });
        }
      }
    }

    const fields = [
      "name",
      "email",
      "phone",
      "preferred_country",
      "source_id",
      "dob",
      "marital_status_id",
      "father_name",
      "father_contact",
      "home_address",
      "english_test_id",
      "english_test_overall_score",
    ];

    const changes = [];
    const numericFields = ["english_test_overall_score", "counsellor_id"];

    fields.forEach((field) => {
      if (sanitizedBody[field] === undefined) return;

      const oldVal = lead[field];
      const newVal = sanitizedBody[field];

      let isChanged = false;

      if (numericFields.includes(field)) {
        const oldNum = oldVal === null || oldVal === "" ? null : parseFloat(oldVal);
        const newNum = newVal === null || newVal === "" ? null : parseFloat(newVal);

        if (oldNum !== newNum && !(isNaN(oldNum) && isNaN(newNum))) {
          isChanged = true;
        }
      } else {
        if (String(oldVal) !== String(newVal)) {
          isChanged = true;
        }
      }

      if (isChanged) {
        changes.push(`${field}: "${oldVal}" → "${newVal}"`);
      }
    });

    let updateData = { ...sanitizedBody };

    if (
      sanitizedBody.english_test_id &&
      sanitizedBody.english_test_id !== "none"
    ) {
      if (sanitizedBody.english_test_scores) {
        updateData.english_test_overall_score = computeEnglishTestOverallScore(
          sanitizedBody.english_test_id,
          sanitizedBody.english_test_scores,
        );
      }
    } else {
      updateData.english_test_overall_score = null;
    }



    await Lead.update(updateData, { where: { id: lead.id } });

    if (req.body.education !== undefined) {
      await handleLeadEducation(lead.id, req.body.education);
      changes.push("Education entries updated");
    }

    await logActivity({
      leadId: lead.id,
      actionType: "lead_updated",
      note: changes.length > 0 ? `Updated — ${changes.join(" · ")}` : "Lead details updated",
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    const updatedLead = await Lead.findByPk(lead.id);
    // ✅ Use rawDb for education
    const education = await rawDb.query(
      'SELECT * FROM lead_educations WHERE lead_id = ?',
      [lead.id]
    );
    updatedLead.education = education;

    res.json(updatedLead);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function assignCounsellor(req, res) {
  try {
    console.log("🔥 ASSIGN API HIT");
    let newCounsellorId = req.body.counsellor_id ? Number(req.body.counsellor_id) : null;

    // ✅ If counsellor is assigning without specifying, assign to themselves
    if (req.user.role === "counsellor" && !newCounsellorId) {
      const [counsellorRows] = await rawDb.query(
        'SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0',
        [req.user.id]
      );
      
      if (counsellorRows && counsellorRows.length > 0) {
        newCounsellorId = counsellorRows[0].id;
      }
    }

    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found." });

    const prevCounsellor = lead.counsellor_id
      ? await User.findByPk(lead.counsellor_id, { attributes: ["name"] })
      : null;

    const newCounsellor = newCounsellorId
      ? await User.findByPk(newCounsellorId, { attributes: ["name", "email"] })
      : null;

    await Lead.update({ counsellor_id: newCounsellorId }, { where: { id: lead.id } });

    return res.status(200).json({
      success: true,
      message: "Counsellor assignment updated successfully.",
      data: {
        lead_id: lead.id,
        counsellor_id: newCounsellorId,
        previous_counsellor: prevCounsellor?.name || null,
        new_counsellor: newCounsellor?.name || null,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// src/controllers/lead.controller.js
// src/controllers/lead.controller.js

export async function updateStage(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const { status, note } = req.body;
    const oldStatus = lead.status;

    if (!status) return res.status(400).json({ message: "Status is required" });

    await Lead.update({ status }, { where: { id: lead.id } });

    if (lead.user_id) {
      const statusLabels = {
        new: "New",
        contacted: "Contacted",
        counseling: "Counseling",
        evaluated: "Evaluated",
        applied: "Applied",
        visa: "Visa",
        success: "Success",
        rejected: "Rejected",
      };
      const newStatusLabel = statusLabels[status] || status;
      await storeNotification(
        lead.user_id,
        "status_change",
        `Your lead status changed to ${newStatusLabel}`,
        {
          leadId: lead.id,
          oldStatus,
          newStatus: status,
        },
      );
    }

    // ✅ Log the stage change with proper note
    await logActivity({
      leadId: lead.id,
      actionType: "stage_changed",
      fromValue: oldStatus,
      toValue: status,
      note: note || `Moved from ${oldStatus} to ${status}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    // ✅ If there's a separate note, log it as note_added
    if (note && note.trim()) {
      await logActivity({
        leadId: lead.id,
        actionType: "note_added",
        fromValue: null,
        toValue: null,
        note: note,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    // ✅ Also add note to activity log if it was a stage change with note
    if (note && note.trim()) {
      const stageLabels = {
        new: "New",
        contacted: "Contacted",
        counseling: "Counseling",
        evaluated: "Evaluated",
        applied: "Applied",
        visa: "Visa",
        success: "Success",
        rejected: "Rejected",
      };

      const newStageLabel = stageLabels[status] || status;

      await logActivity({
        leadId: lead.id,
        actionType: "note_added",
        fromValue: null,
        toValue: null,
        note: `[${newStageLabel}] ${note}`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    const isMovingToCounseling = status === "counseling" && oldStatus !== "counseling";

    if (isMovingToCounseling && lead.email) {
      await handleFirstCounselingEntry(lead, req.user);
    }

    const updatedLead = await Lead.findByPk(lead.id);
    res.json({ 
      success: true,
      message: "Stage updated successfully", 
      lead: updatedLead 
    });
  } catch (error) {
    console.error("Stage update error:", error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

export async function deleteLead(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found." });

    await logActivity({
      leadId: lead.id,
      actionType: "lead_deleted",
      note: `Lead "${lead.name}" (${lead.email}) was soft deleted`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    await Lead.update({ is_deleted: true }, { where: { id: lead.id } });

    res.json({ message: "Lead deleted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function getStageNotes(req, res) {
  try {
    const leadId = req.params.id;
    const stage = req.query.stage;

    const where = {
      lead_id: leadId,
      action_type: "stage_note",
    };

    res.json({ data: [] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function addStageNote(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found." });

    const { stage, note } = req.body;

    if (!stage || !note) {
      return res.status(400).json({ message: "Stage and note are required." });
    }

    await logActivity({
      leadId: lead.id,
      actionType: "stage_note",
      note: note,
      metadata: JSON.stringify({ stage }),
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    res.json({ message: "Stage note added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function addNoteOnly(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found." });

    const { note } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ message: "Note is required." });
    }

    const stageLabels = {
      new: "New",
      contacted: "Contacted",
      counseling: "Counseling",
      visa_filed: "Visa Filed",
      visa_approved: "Visa Approved",
      success: "Success",
      rejected: "Rejected",
    };

    const currentStageLabel = stageLabels[lead.status] || lead.status;

    await logActivity({
      leadId: lead.id,
      actionType: "note_added",
      note: `[${currentStageLabel}] ${note}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    res.json({ message: "Note added successfully" });
  } catch (error) {
    console.error("❌ addNoteOnly error:", error);
    res.status(500).json({ message: error.message });
  }
}