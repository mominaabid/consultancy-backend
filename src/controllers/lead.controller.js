// src/controllers/lead.controller.js
import jwt from "jsonwebtoken";
import db from "../models/mysql/index.js";
// ✅ IMPORT RAW DATABASE CONNECTION
import rawDb from "../config/db.js";
import {
  sendPasswordSetupEmail,
  sendNewWebsiteLeadEmail,
  sendLeadConfirmationEmail,
  sendNoteAddedEmail,
} from "../services/email.service.js";
import { logActivity } from "../services/activityLog.service.js";
import { sendLeadAssignmentEmail } from "../services/counsellorEmail.service.js";
import Conversation from "../models/mongo/Conversation.js";
import sseManager from "../utils/sseManager.js";
import { storeNotification } from "../utils/notificationHelper.js";

const { Lead, User, LeadEducation } = db;

// ✅ Helper function for search conditions (replaces Op.or)
function buildSearchConditions(searchTerm) {
    if (!searchTerm) return { sql: '', params: [] };
    return {
        sql: `AND (l.name LIKE ? OR l.email LIKE ? OR l.phone LIKE ?)`,
        params: [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]
    };
}

export function validateNoDuplicateDegrees(educationArray) {
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

  // Snapshot which columns were actually supplied (under either their own
  // name or a frontend alias) BEFORE normalization — a field genuinely
  // absent from the request must never be normalized/nulled below.
  const providedFields = new Set(Object.keys(sanitized));

  // Handle date fields — only touch a field if it was actually present in
  // this request; a field simply not sent must NOT be wiped to null.
const dateFields = ["dob"];
for (const field of dateFields) {
  if (!providedFields.has(field)) continue;
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

  // Handle integer fields — same rule: only normalize a field that was
  // actually present in this request, never invent/null one that wasn't sent.
  const intFields = ["counsellor_id", "source_id", "marital_status_id", "english_test_id"];
  for (const field of intFields) {
    if (!providedFields.has(field)) continue;
    if (sanitized[field] === "" || sanitized[field] === null || sanitized[field] === undefined) {
      sanitized[field] = null;
    } else if (!isNaN(Number(sanitized[field]))) {
      sanitized[field] = Number(sanitized[field]);
    } else {
      sanitized[field] = null;
    }
  }

  if (providedFields.has("english_test_overall_score")) {
    if (sanitized.english_test_overall_score === "" || sanitized.english_test_overall_score === null) {
      sanitized.english_test_overall_score = null;
    } else if (!isNaN(parseFloat(sanitized.english_test_overall_score))) {
      sanitized.english_test_overall_score = parseFloat(sanitized.english_test_overall_score);
    } else {
      sanitized.english_test_overall_score = null;
    }
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
export async function handleLeadEducation(leadId, educationArray, transaction = null) {
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
    return;
  }

  if (lead.has_entered_counseling) {
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
  }

  if (!lead.user_id || lead.user_id !== student.id) {
    await Lead.update({ user_id: student.id }, { where: { id: lead.id } });
  }

  // Matches the counsellor/processing-officer setup-link pattern — a JWT,
  // not a random token — because /setup-password's verify endpoint
  // (verifySetupToken/setupPassword in auth.controller.js) does
  // jwt.verify() on whatever token it's given. A random hex string isn't a
  // valid JWT at all, so it failed jwt.verify() and reported "Invalid or
  // expired token" on the very first click, every time — not an actual
  // expiry, a token-format mismatch.
  const token = jwt.sign(
    { id: student.id, email: student.email, role: "student", purpose: "setup" },
    process.env.JWT_SECRET,
    { expiresIn: "24h" },
  );

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

    // ✅ FIX: Auto-assign the lead to the counsellor who is creating it.
    // The counsellor's identity always comes from the authenticated token
    // (req.user), NOT from the request body — so a counsellor can never
    // be bypassed out of their own lead. Only an admin can assign/unassign.
    let counsellorId = null;

    if (req.user.role === "counsellor") {
      const [counsellorRows] = await rawDb.query(
        'SELECT id FROM counsellors WHERE user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)',
        [req.user.id]
      );

      if (counsellorRows && counsellorRows.length > 0) {
        counsellorId = counsellorRows[0].id;
      }
    }

    const data = {
      ...sanitizedBody,
      counsellor_id: counsellorId, // ✅ counsellor is always assigned to themselves
    };

    // Only non-counsellors (admin) may set/unset the counsellor assignment.
    if (req.user.role !== "counsellor") {
      data.counsellor_id = sanitizedBody.counsellor_id
        ? Number(sanitizedBody.counsellor_id)
        : null;
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

    // ✅ If lead is assigned to a counsellor, send email + notifications
    if (lead.counsellor_id) {
      try {
        // Resolve the counsellor's LOGIN (users) row via the counsellors table.
        // NOTE: lead.counsellor_id stores the counsellors-table record ID,
        // NOT the users-table ID — so we must join to get the real user_id
        // before storing notifications / sending SSE events.
        const [counsellorRows] = await rawDb.query(
          `SELECT u.id AS user_id, u.name, u.email
           FROM counsellors c
           INNER JOIN users u ON u.id = c.user_id
           WHERE c.id = ? AND c.is_deleted = 0`,
          [lead.counsellor_id],
        );
        const counsellorUser = counsellorRows?.[0];

        if (counsellorUser?.email) {
          sendLeadAssignmentEmail({
            counsellorEmail: counsellorUser.email,
            counsellorName: counsellorUser.name,
            lead: lead,
          }).catch((err) => console.error("Background email error:", err));
        }

        // Send SSE + stored notification using the USER id (not counsellors.id)
        if (counsellorUser?.user_id) {
          sseManager.sendToUser(counsellorUser.user_id.toString(), {
            type: "lead_created",
            message: `New lead "${lead.name}" has been created and assigned to you.`,
            leadId: lead.id,
            leadName: lead.name,
            counsellorId: lead.counsellor_id,
            counsellorName: counsellorUser?.name || "Counsellor",
          });

          await storeNotification(
            counsellorUser.user_id,
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
      } catch (notifErr) {
        // Never fail the lead creation because a notification could not be stored
        console.error("⚠️ Failed to notify counsellor about new lead:", notifErr);
      }
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
      // Same reasoning as updateStage: the lead is already created successfully
      // at this point — an email failure here must not turn into a 500.
      try {
        await handleFirstCounselingEntry(lead, req.user);
      } catch (setupErr) {
        console.error("⚠️ handleFirstCounselingEntry failed (lead still created):", setupErr);
      }
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
      LEFT JOIN counsellors cc ON l.counsellor_id = cc.id AND cc.is_deleted = 0
      LEFT JOIN users u ON cc.user_id = u.id AND u.is_deleted = 0
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
      } else {
        // If no counsellor record, return no leads
        sql += ` AND 1 = 0`;
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

    // ✅ Resolve display names for all the FK/id columns
    const [[nameRows]] = await Promise.all([
      rawDb.query(
        `SELECT
          (SELECT u.name FROM counsellors cc INNER JOIN users u ON u.id = cc.user_id WHERE cc.id = ?) AS counsellor_name,
          (SELECT name FROM config_values WHERE id = ?) AS source_name,
          (SELECT name FROM config_values WHERE id = ?) AS marital_status_name,
          (SELECT name FROM config_values WHERE id = ?) AS english_test_name,
          (SELECT name FROM config_values WHERE id = ?) AS lost_reason_name,
          (SELECT u.name FROM processing_officers p INNER JOIN users u ON u.id = p.user_id WHERE p.id = ?) AS assigned_officer_name
        `,
        [
          lead.counsellor_id,
          lead.source_id,
          lead.marital_status_id,
          lead.english_test_id,
          lead.lost_reason_id,
          lead.assigned_processing_officer_id,
        ],
      ),
    ]);
    Object.assign(lead, nameRows[0] || {});

    // ✅ Linked applications (if this lead has converted/applied)
    const [applications] = await rawDb.query(
      `SELECT a.id, a.status, a.university_id, a.course_id, a.processing_officer_id,
              u.name AS university_name, cv.name AS course_name,
              po_u.name AS processing_officer_name
       FROM applications a
       LEFT JOIN universities u ON u.id = a.university_id
       LEFT JOIN config_values cv ON cv.id = a.course_id
       LEFT JOIN processing_officers po ON po.id = a.processing_officer_id
       LEFT JOIN users po_u ON po_u.id = po.user_id
       WHERE a.lead_id = ? AND a.is_deleted = 0
       ORDER BY a.created_at DESC`,
      [lead.id],
    );
    lead.applications = applications || [];

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

    if (changes.length > 0) {
      await notifyLeadCounsellor(lead, req.user, {
        type: "lead_info_updated",
        message: `${req.user.name || "Someone"} updated lead "${lead.name}"'s information.`,
        note: changes.join(" · "),
        emailSubjectLabel: `Lead: ${lead.name}`,
      });
    }

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

    const newCounsellorId = req.body.counsellor_id
      ? Number(req.body.counsellor_id)
      : null;

    const lead = await Lead.findByPk(req.params.id);
    if (!lead) {
      return res.status(404).json({ message: "Lead not found." });
    }

    const [previousRows] = await rawDb.query(
      `SELECT u.name, u.email
       FROM counsellors c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.id = ? AND c.is_deleted = 0`,
      [lead.counsellor_id],
    );

    const [counsellorRows] = newCounsellorId
      ? await rawDb.query(
          `SELECT c.id AS counsellor_id, u.id AS user_id, u.name, u.email
           FROM counsellors c
           INNER JOIN users u ON u.id = c.user_id
           WHERE c.id = ? AND c.is_deleted = 0`,
          [newCounsellorId],
        )
      : [[]];

    const counsellor = counsellorRows[0];

    if (newCounsellorId && !counsellor) {
      return res.status(404).json({
        message: "Counsellor not found.",
      });
    }

    await Lead.update(
      { counsellor_id: newCounsellorId },
      { where: { id: lead.id } },
    );

    await logActivity({
      leadId: lead.id,
      actionType: "counsellor_assigned",
      fromValue: previousRows[0]?.name || "Unassigned",
      toValue: counsellor?.name || "Unassigned",
      note: newCounsellorId
        ? `Counsellor assigned: ${counsellor?.name || "Unknown"}`
        : "Counsellor unassigned",
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    if (counsellor?.email) {
      await sendLeadAssignmentEmail({
        counsellorEmail: counsellor.email,
        counsellorName: counsellor.name,
        lead,
      });
    }

    if (counsellor?.user_id) {
      try {
        await storeNotification(
          counsellor.user_id,
          "lead_assigned",
          `Lead "${lead.name}" has been assigned to you.`,
          {
            leadId: lead.id,
            leadName: lead.name,
            counsellorId: newCounsellorId,
          },
        );
      } catch (notifErr) {
        // Don't fail the assignment response if storing the notification fails
        console.error("⚠️ Failed to store lead_assigned notification:", notifErr);
      }

      sseManager.sendToUser(counsellor.user_id.toString(), {
        type: "lead_assigned",
        message: `Lead "${lead.name}" has been assigned to you.`,
        leadId: lead.id,
        leadName: lead.name,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Counsellor assignment updated and email sent successfully.",
      data: {
        lead_id: lead.id,
        counsellor_id: newCounsellorId,
        previous_counsellor: previousRows[0]?.name || null,
        new_counsellor: counsellor?.name || null,
      },
    });
  } catch (error) {
    console.error("❌ Assignment/email error:", error);
    return res.status(500).json({ message: error.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// MARK LEAD READY FOR APPLICATION (admin-only; requires status === 'converted')
// ──────────────────────────────────────────────────────────────────────────────
export async function markLeadReadyForApplication(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found." });

    if (lead.status !== "converted") {
      return res.status(400).json({
        message: "Only a converted lead can be marked ready for application.",
      });
    }

    if (lead.is_ready_for_application) {
      return res.status(400).json({ message: "Lead is already marked ready for application." });
    }

    await Lead.update({ is_ready_for_application: true }, { where: { id: lead.id } });

    await logActivity({
      leadId: lead.id,
      actionType: "ready_for_application",
      fromValue: null,
      toValue: null,
      note: "Marked Ready for Application",
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    return res.status(200).json({
      success: true,
      message: "Lead marked ready for application.",
    });
  } catch (error) {
    console.error("❌ Ready-for-application error:", error);
    return res.status(500).json({ message: error.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// ASSIGN PROCESSING OFFICER TO A READY LEAD (admin-only)
// ──────────────────────────────────────────────────────────────────────────────
export async function assignProcessingOfficerToLead(req, res) {
  try {
    const newOfficerId = req.body.processing_officer_id
      ? Number(req.body.processing_officer_id)
      : null;

    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found." });

    if (!lead.is_ready_for_application) {
      return res.status(400).json({
        message: "Lead must be marked ready for application before assigning a processing officer.",
      });
    }

    const [previousRows] = await rawDb.query(
      `SELECT u.name, u.email
       FROM processing_officers p
       INNER JOIN users u ON u.id = p.user_id
       WHERE p.id = ? AND p.is_deleted = 0`,
      [lead.assigned_processing_officer_id],
    );

    const [officerRows] = newOfficerId
      ? await rawDb.query(
          `SELECT p.id AS officer_id, u.id AS user_id, u.name, u.email
           FROM processing_officers p
           INNER JOIN users u ON u.id = p.user_id
           WHERE p.id = ? AND p.is_deleted = 0`,
          [newOfficerId],
        )
      : [[]];

    const officer = officerRows[0];

    if (newOfficerId && !officer) {
      return res.status(404).json({ message: "Processing officer not found." });
    }

    await Lead.update(
      { assigned_processing_officer_id: newOfficerId },
      { where: { id: lead.id } },
    );

    await logActivity({
      leadId: lead.id,
      actionType: "processing_officer_assigned",
      fromValue: previousRows[0]?.name || "Unassigned",
      toValue: officer?.name || "Unassigned",
      note: newOfficerId
        ? `Processing officer assigned: ${officer?.name || "Unknown"}`
        : "Processing officer unassigned",
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    if (officer?.user_id) {
      await storeNotification(
        officer.user_id,
        "lead_assigned_for_application",
        `Lead "${lead.name}" has been assigned to you for application creation.`,
        { leadId: lead.id, leadName: lead.name },
      );
      sseManager.sendToUser(officer.user_id.toString(), {
        type: "lead_assigned_for_application",
        message: `Lead "${lead.name}" has been assigned to you for application creation.`,
        leadId: lead.id,
        leadName: lead.name,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Processing officer assignment updated.",
      data: {
        lead_id: lead.id,
        processing_officer_id: newOfficerId,
        previous_officer: previousRows[0]?.name || null,
        new_officer: officer?.name || null,
      },
    });
  } catch (error) {
    console.error("❌ Processing officer assignment error:", error);
    return res.status(500).json({ message: error.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET LEADS READY FOR APPLICATION, ASSIGNED TO THE LOGGED-IN PROCESSING OFFICER
// ──────────────────────────────────────────────────────────────────────────────
export async function getReadyLeadsForOfficer(req, res) {
  try {
    const isAdmin = req.user.role === "admin";
    let officerId = null;

    if (!isAdmin) {
      const [officerRows] = await rawDb.query(
        "SELECT id FROM processing_officers WHERE user_id = ? AND is_deleted = 0",
        [req.user.id],
      );
      if (!officerRows || officerRows.length === 0) {
        return res.json({ success: true, leads: [], count: 0 });
      }
      officerId = officerRows[0].id;
    }

    // Note: a lead already carrying one application is still listed here —
    // a person can have multiple applications (e.g. to different
    // universities/courses), so having an existing one must not block
    // creating another for the same lead.
    const query = `
      SELECT l.id, l.name, l.email, l.phone, l.preferred_country, l.status,
             l.is_ready_for_application, l.assigned_processing_officer_id, l.created_at
      FROM leads l
      WHERE l.is_deleted = 0 AND l.status = 'converted' AND l.is_ready_for_application = 1
        ${isAdmin ? "" : "AND l.assigned_processing_officer_id = ?"}
      ORDER BY l.created_at DESC
    `;
    const [leads] = await rawDb.query(query, isAdmin ? [] : [officerId]);

    res.json({ success: true, leads: leads || [], count: leads?.length || 0 });
  } catch (error) {
    console.error("Error fetching ready leads:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// src/controllers/lead.controller.js
// src/controllers/lead.controller.js

export async function updateStage(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const { status, note, lost_reason_id, lost_note } = req.body;
    const oldStatus = lead.status;

    if (!status) return res.status(400).json({ message: "Status is required" });

    if (oldStatus === "converted") {
      return res.status(400).json({
        message: "This lead is converted and can never be moved to another stage.",
      });
    }

    if (status === "lost" && !lost_reason_id) {
      return res.status(400).json({
        message: "A lost reason is required when marking a lead as lost.",
      });
    }

    const updateData = { status };
    if (status === "lost") {
      updateData.lost_reason_id = lost_reason_id;
      updateData.lost_note = lost_note || null;
    }

    await Lead.update(updateData, { where: { id: lead.id } });

    // ✅ Log the stage change with proper note
    let stageChangeNote = note || `Moved from ${oldStatus} to ${status}`;
    if (status === "lost") {
      const [reasonRows] = await rawDb.query(
        "SELECT name FROM config_values WHERE id = ?",
        [lost_reason_id],
      );
      const reasonName = reasonRows?.[0]?.name || "Unknown";
      stageChangeNote = `Marked Lost — Reason: ${reasonName}${lost_note ? ` — ${lost_note}` : ""}`;
    }

    await logActivity({
      leadId: lead.id,
      actionType: "stage_changed",
      fromValue: oldStatus,
      toValue: status,
      note: stageChangeNote,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    await notifyLeadCounsellor(lead, req.user, {
      type: "lead_stage_changed",
      message: `${req.user.name || "Someone"} moved lead "${lead.name}" from ${oldStatus} to ${status}.`,
      note: stageChangeNote,
      emailSubjectLabel: `Lead: ${lead.name}`,
    });

    // A note attached to a stage change used to be written to
    // lead_activity_logs THREE times total (the stage_changed row above,
    // plus two near-identical note_added rows here — one raw, one with a
    // "[Stage]" prefix) — that's why the same note visibly appeared 3x in
    // the lead's history. One note_added row (prefixed, so it reads
    // sensibly on its own if ever shown outside the stage-change context)
    // is enough; groupLogs() on the frontend already merges it back into
    // the stage_changed entry for display when they're close in time.
    if (note && note.trim()) {
      const stageLabels = {
        new: "New",
        contacted: "Contacted",
        counseling: "Counseling",
        converted: "Converted",
        lost: "Lost",
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
      // The stage change itself already succeeded and is already logged above —
      // a failure sending the student's password-setup email (e.g. an invalid/
      // unreachable address) must not turn into a 500 for an operation that
      // actually worked.
      try {
        await handleFirstCounselingEntry(lead, req.user);
      } catch (setupErr) {
        console.error("⚠️ handleFirstCounselingEntry failed (stage change still succeeded):", setupErr);
      }
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

// Notify the lead's assigned counsellor of any important event on their
// lead — skipped if the lead has no counsellor, or if the actor IS that
// counsellor (no self-notification). `note` is optional extra detail shown
// in the notification/email body (e.g. the note text, or the stage change).
async function notifyLeadCounsellor(lead, actor, { type, message, note, emailSubjectLabel }) {
  try {
    if (!lead.counsellor_id) return;

    const [rows] = await rawDb.query(
      `SELECT u.id AS user_id, u.name, u.email
       FROM counsellors c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.id = ? AND c.is_deleted = 0`,
      [lead.counsellor_id],
    );
    const counsellor = rows[0];
    if (!counsellor || !counsellor.user_id) return;
    if (counsellor.user_id === actor.id) return; // self-notification skip

    await storeNotification(counsellor.user_id, type, message, {
      leadId: lead.id,
      leadName: lead.name,
      note: note || null,
    });
    sseManager.sendToUser(counsellor.user_id.toString(), {
      type,
      message,
      leadId: lead.id,
    });

    if (counsellor.email) {
      await sendNoteAddedEmail({
        recipientName: counsellor.name,
        recipientEmail: counsellor.email,
        addedByName: actor.name,
        subjectLabel: emailSubjectLabel || `Lead: ${lead.name}`,
        notePreview: note || message,
        portalLink: `${process.env.FRONTEND_URL}/counsellor/leads`,
      });
    }
  } catch (err) {
    console.error("⚠️ Failed to notify counsellor:", err);
  }
}

async function notifyLeadCounsellorOfNote(lead, note, actor) {
  return notifyLeadCounsellor(lead, actor, {
    type: "lead_note_added",
    message: `${actor.name || "Someone"} added a note on lead "${lead.name}".`,
    note,
    emailSubjectLabel: `Lead: ${lead.name}`,
  });
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

    await notifyLeadCounsellorOfNote(lead, note, req.user);

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
      converted: "Converted",
      lost: "Lost",
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

    await notifyLeadCounsellorOfNote(lead, note, req.user);

    res.json({ message: "Note added successfully" });
  } catch (error) {
    console.error("❌ addNoteOnly error:", error);
    res.status(500).json({ message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ✅ PUBLIC WEBSITE LEAD ENDPOINT (no auth — used by the Educatia website)
// Creates a lead with status "new" and source "Website" so it appears in the
// portal Leads page exactly like a manually created lead.
// ─────────────────────────────────────────────────────────────────────────────

// Simple in-memory rate limiter: max 5 submissions per IP per 10 minutes
const websiteLeadRateMap = new Map();
const WEBSITE_LEAD_RATE_WINDOW_MS = 10 * 60 * 1000;
const WEBSITE_LEAD_RATE_MAX = 5;

function isWebsiteLeadRateLimited(ip) {
  const now = Date.now();
  const entry = websiteLeadRateMap.get(ip);
  if (!entry || now - entry.start > WEBSITE_LEAD_RATE_WINDOW_MS) {
    websiteLeadRateMap.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > WEBSITE_LEAD_RATE_MAX;
}

// Generic find-or-create helper for config_values (used for lead_source,
// english_test_type, degree_type) so public website submissions can resolve
// config IDs by name without any authenticated lookups.
export async function resolveConfigId(type, name) {
  try {
    const [rows] = await rawDb.query(
      `SELECT id FROM config_values WHERE type = ? AND name = ? AND is_deleted = 0 LIMIT 1`,
      [type, name]
    );
    if (rows && rows.length > 0) return rows[0].id;

    const [result] = await rawDb.query(
      `INSERT INTO config_values (name, type, is_active, is_deleted, sort_order, user_id)
       VALUES (?, ?, 1, 0, 99, NULL)`,
      [name, type]
    );
    return result.insertId;
  } catch (err) {
    console.error(`⚠️ Could not resolve config '${type}' → '${name}':`, err.message);
    return null; // FK columns are nullable — submission still succeeds
  }
}

// Find (or create) the "Website" entry in config_values (type: lead_source)
// so the lead shows up in the portal with source "Website".
async function resolveWebsiteSourceId() {
  return resolveConfigId("lead_source", "Website");
}

// ⚠️ DEPRECATED — ab koi route is par point nahi karta.
// Website submissions onlineQuery.controller.js :: createOnlineQuery() handle
// karta hai. Ye function sirf reference ke liye rakha hai; Phase 4 cleanup me
// hata dena.
export async function createWebsiteLead(req, res) {
  try {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    if (isWebsiteLeadRateLimited(ip)) {
      return res.status(429).json({
        success: false,
        message: "Too many submissions. Please try again later.",
      });
    }

    const {
      name,
      email,
      phone,
      city,
      country,
      course,
      message,
      english_test,
      english_test_score,
      education,
    } = req.body || {};

    // ── Validation (aligned with portal rules) ──
    const errors = [];
    const trimmedName = String(name || "").trim();
    if (!trimmedName) errors.push("Full name is required.");
    else if (trimmedName.length < 3 || trimmedName.length > 50)
      errors.push("Name must be 3–50 characters long.");
    else if (!/^[A-Za-z\s]+$/.test(trimmedName))
      errors.push("Name must contain only letters and spaces.");

    const trimmedEmail = String(email || "").trim().toLowerCase();
    if (!trimmedEmail) errors.push("Email is required.");
    else if (!/^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/.test(trimmedEmail))
      errors.push("Email must be a valid format (e.g., name@domain.com).");

    const trimmedPhone = String(phone || "").trim();
    if (!trimmedPhone) errors.push("Phone number is required.");
    else if (trimmedPhone.replace(/\D/g, "").length < 11)
      errors.push("Phone number must have at least 11 digits.");

    // ── English test (optional) ──
    const ENGLISH_TEST_MAX = { ielts: 9, toefl: 120, pte: 90, duolingo: 160 };
    const englishTestName = String(english_test || "").trim();
    const hasEnglishTest =
      englishTestName.length > 0 && !/not\s*yet/i.test(englishTestName);
    let englishScoreValue = null;
    if (hasEnglishTest) {
      const max = ENGLISH_TEST_MAX[englishTestName.toLowerCase()];
      englishScoreValue = parseFloat(String(english_test_score ?? "").trim());
      if (isNaN(englishScoreValue)) {
        errors.push(`Please provide your ${englishTestName} overall score.`);
      } else if (max && (englishScoreValue < 0 || englishScoreValue > max)) {
        errors.push(`${englishTestName} score must be between 0 and ${max}.`);
      } else if (
        englishTestName.toLowerCase() !== "ielts" &&
        !Number.isInteger(englishScoreValue)
      ) {
        errors.push(`${englishTestName} score must be a whole number.`);
      }
    }

    // ── Education entries (optional; latest degree) ──
    const currentYear = new Date().getFullYear();
    const educationInput = (Array.isArray(education) ? education : []).filter(
      (e) => e && (e.degree || e.degree_id)
    );
    educationInput.forEach((edu, idx) => {
      const year = Number(edu.year_awarded);
      if (!edu.year_awarded || isNaN(year) || year < 1950 || year > currentYear) {
        errors.push(
          `Education #${idx + 1}: year awarded must be between 1950 and ${currentYear}.`
        );
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join(" ") });
    }

    // ── Duplicate checks (same rules as the portal) ──
    // If the visitor already exists, don't create a second lead — instead
    // greet them and point them to the status tracker (better UX than an
    // error dead-end). Phone is normalized to digits so formatting
    // differences (spaces/dashes/country code) still match.
    const phoneDigits = trimmedPhone.replace(/\D/g, "");

    const existingLead = await Lead.findOne({ where: { email: trimmedEmail } });
    let duplicateLead = existingLead || null;
    let duplicateField = null;

    if (duplicateLead) {
      duplicateField = "email";
    } else {
      // Compare against normalized digits — catches +92 300 1234567 vs 03001234567
      try {
        const [phoneRows] = await rawDb.query(
          `SELECT * FROM leads 
           WHERE is_deleted = 0 
             AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') 
                 = REPLACE(REPLACE(REPLACE(REPLACE(?, ' ', ''), '-', ''), '+', ''), '(', '')
           LIMIT 1`,
          [phoneDigits]
        );
        duplicateLead = phoneRows?.[0] || null;
      } catch {
        // Fallback: exact match on the raw string
        duplicateLead = await Lead.findOne({ where: { phone: trimmedPhone } });
      }
      if (duplicateLead) duplicateField = "phone";
    }

    if (duplicateLead) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        duplicateField,
        message:
          duplicateField === "email"
            ? "This email is already registered with us."
            : "This phone number is already registered with us.",
        lead: {
          id: duplicateLead.id,
          name: duplicateLead.name,
          status: duplicateLead.status,
        },
      });
    }

    // ── Build lead data ──
    const data = {
      name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
      source_id: await resolveWebsiteSourceId(),
      status: "new", // appears in the portal "New" stage
      counsellor_id: null, // unassigned — admin assigns from the portal
    };
    if (city && String(city).trim()) data.home_address = String(city).trim();
    if (country && String(country).trim())
      data.preferred_country = String(country).trim();

    // ── English test → english_test_id + overall score ──
    if (hasEnglishTest) {
      data.english_test_id = await resolveConfigId(
        "english_test_type",
        englishTestName
      );
      data.english_test_overall_score = englishScoreValue;
    }

    const lead = await Lead.create(data);

    // ── Education entries → lead_educations (same table the portal uses) ──
    let lastDegreeLabel = null;
    if (educationInput.length > 0) {
      lastDegreeLabel = `${educationInput[0].degree} (${educationInput[0].year_awarded})`;
      const educationRows = [];
      for (const edu of educationInput) {
        educationRows.push({
          degree_id: edu.degree_id
            ? Number(edu.degree_id)
            : await resolveConfigId("degree_type", String(edu.degree).trim()),
          year_awarded: Number(edu.year_awarded),
          grades_cgpa: edu.grades_cgpa ? String(edu.grades_cgpa).trim() : null,
          board_university: edu.board_university
            ? String(edu.board_university).trim()
            : null,
        });
      }

      const degreeError = validateNoDuplicateDegrees(educationRows);
      if (degreeError) {
        return res.status(400).json({ success: false, message: degreeError });
      }

      await handleLeadEducation(lead.id, educationRows);
    }

    // Extra website-specific info (course/message) goes to the activity log,
    // since the leads table has no dedicated columns for them.
    const extraParts = [];
    if (course && String(course).trim()) extraParts.push(`Course: ${String(course).trim()}`);
    if (hasEnglishTest)
      extraParts.push(`English: ${englishTestName} — ${englishScoreValue}`);
    if (lastDegreeLabel) extraParts.push(`Last degree: ${lastDegreeLabel}`);
    if (message && String(message).trim()) extraParts.push(`Message: ${String(message).trim()}`);

    await logActivity({
      leadId: lead.id,
      actionType: "lead_created",
      toValue: "new",
      note:
        `Website lead submitted (source: Website) · Phone: ${lead.phone} · Country: ${lead.preferred_country || "—"}` +
        (extraParts.length > 0 ? ` · ${extraParts.join(" · ")}` : ""),
      performedBy: null,
      performedByRole: "website",
      performedByName: lead.name,
    });

    // ✅ Notify all admins (real-time SSE + stored notification + email) so
    // website leads never sit unseen. Notification errors must never fail
    // the lead creation itself.
    try {
      const admins = await User.findAll({
        where: { role: "admin", is_active: true },
        attributes: ["id", "name", "email"],
      });

      for (const admin of admins) {
        const notifMessage = `🌐 New website lead: "${lead.name}"${
          lead.preferred_country ? ` (${lead.preferred_country})` : ""
        } — check the Leads page.`;

        // Real-time push (SSE) → portal notification bell
        sseManager.sendToUser(admin.id.toString(), {
          type: "website_lead_created",
          message: notifMessage,
          leadId: lead.id,
          leadName: lead.name,
        });

        await storeNotification(
          admin.id,
          "website_lead_created",
          notifMessage,
          { leadId: lead.id, leadName: lead.name, source: "Website" }
        );

        // 📧 Email (fire-and-forget)
        if (admin.email) {
          sendNewWebsiteLeadEmail({
            adminEmail: admin.email,
            adminName: admin.name,
            lead,
          }).catch((err) => console.error("Background email error:", err));
        }
      }
    } catch (notifErr) {
      console.error(
        "⚠️ Failed to notify admins about new website lead:",
        notifErr
      );
    }


    // 📧 Confirm receipt to the visitor (fire-and-forget — must never fail lead creation)
    sendLeadConfirmationEmail({
      to: lead.email,
      name: lead.name,
      reference: `EDU-${lead.id}`,
    }).catch((err) => console.error("Background lead confirmation email error:", err));

    res.status(201).json({
      success: true,
      message: "Your consultation request has been received!",
      lead: { id: lead.id, name: lead.name, status: lead.status },
    });
  } catch (error) {
    console.error("❌ Error creating website lead:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while submitting your request. Please try again.",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ✅ PUBLIC LEAD STATUS TRACKER (no auth — used by the Educatia website)
// A visitor enters the SAME email AND phone they applied with; both must match
// the same lead. Returns only public-safe info: status + friendly message,
// counsellor first name, submitted date. Anti-enumeration: identical generic
// response whether the email is unknown or the phone doesn't match.
// ─────────────────────────────────────────────────────────────────────────────

// Separate rate limiter for tracking lookups: max 10 per IP per 10 minutes
const websiteTrackRateMap = new Map();
const WEBSITE_TRACK_RATE_WINDOW_MS = 10 * 60 * 1000;
const WEBSITE_TRACK_RATE_MAX = 10;

function isWebsiteTrackRateLimited(ip) {
  const now = Date.now();
  const entry = websiteTrackRateMap.get(ip);
  if (!entry || now - entry.start > WEBSITE_TRACK_RATE_WINDOW_MS) {
    websiteTrackRateMap.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > WEBSITE_TRACK_RATE_MAX;
}

function friendlyStatusLabel(status) {
  const s = String(status || "new").replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Tracker fallback: wo online query jo abhi lead me convert nahi hui.
// 'spam' aur 'converted' ko jaan boojh kar chhora hai — converted ki lead upar
// hi mil jati hai, aur spam ko confirmation dena bot ko signal dena hai.
async function findPendingQueryForTracker(email, phoneDigits) {
  try {
    const [rows] = await rawDb.query(
      `SELECT * FROM online_queries
        WHERE is_deleted = 0
          AND status IN ('new','reviewed')
          AND email = ?
          AND REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'+',''),'(','') = ?
        ORDER BY created_at DESC
        LIMIT 1`,
      [email, phoneDigits]
    );
    return rows?.[0] || null;
  } catch (err) {
    console.error("⚠️ Tracker online-query lookup failed:", err.message);
    return null;
  }
}

export async function getLeadHistory(req, res) {
  try {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    if (isWebsiteTrackRateLimited(ip)) {
      return res.status(429).json({
        success: false,
        message: "Too many lookups. Please try again later.",
      });
    }

    const email = String(req.query.email || "").trim().toLowerCase();
    const phoneDigits = String(req.query.phone || "").replace(/\D/g, "");

    if (!email || phoneDigits.length < 7) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter the same email and phone number you used when applying.",
      });
    }

    const lead = await Lead.findOne({ where: { email } });

    // Lead nahi mili (ya phone match nahi hua) to ho sakta hai visitor ki
    // submission abhi Online Queries me pending ho aur admin ne usay lead me
    // convert na kiya ho. Aise visitor ko "not found" dikhana ghalat hai —
    // usne form to bhara hai.
    if (!lead || String(lead.phone || "").replace(/\D/g, "") !== phoneDigits) {
      const pending = await findPendingQueryForTracker(email, phoneDigits);
      if (pending) {
        return res.json({
          success: true,
          data: {
            reference: `EDU-Q-${pending.id}`,
            name: pending.name,
            country: pending.preferred_country || null,
            status: "received",
            status_label: "Received",
            message:
              "✅ We've received your request — our team is reviewing it and a counsellor will contact you within 24 hours.",
            counsellor: null,
            submitted_on: pending.created_at,
            last_updated: pending.updated_at,
          },
        });
      }

      // Same generic message whether the email is unknown or the phone doesn't
      // match — nobody can probe which emails exist in the system.
      return res.status(404).json({
        success: false,
        message:
          "No application found for those details. Please double-check the email and phone number you used.",
      });
    }

    // ── Friendly status message (the core of the tracker) ──
    const statusRaw = String(lead.status || "new").toLowerCase();
    let message;
    if (/contact/.test(statusRaw)) {
      message =
        "📞 A counsellor has contacted you — please check your phone and email.";
    } else if (/counsell|counsel/.test(statusRaw)) {
      message =
        "📧 Your application is in the counselling stage — please check your email for details from your counsellor.";
    } else if (/enrol|admit|accept|offer/.test(statusRaw)) {
      message =
        "🎓 Great news — there's an update on your application. Please check your email!";
    } else if (/reject|close|lost|not interest/.test(statusRaw)) {
      message =
        "Your application has been closed. If you think this is a mistake, please contact us.";
    } else {
      message =
        "✅ We've received your details — a counsellor will contact you within 24 hours.";
    }

    // ── Assigned counsellor (first name only) ──
    let counsellor = null;
    if (lead.counsellor_id) {
      try {
        const c = await User.findByPk(lead.counsellor_id, {
          attributes: "first_name, last_name",
        });
        const full = [c?.first_name, c?.last_name].filter(Boolean).join(" ");
        if (full) counsellor = full.split(" ")[0];
      } catch {
        counsellor = null;
      }
    }

    res.json({
      success: true,
      data: {
        reference: `EDU-${lead.id}`,
        name: lead.name,
        country: lead.preferred_country || null,
        status: statusRaw,
        status_label: friendlyStatusLabel(lead.status),
        message,
        counsellor,
        submitted_on: lead.created_at,
        last_updated: lead.updated_at,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching lead status:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again in a moment.",
    });
  }
}