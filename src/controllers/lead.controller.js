import crypto from "crypto";
import db from "../models/mysql/index.js";
import { sendPasswordSetupEmail } from "../services/email.service.js";
import { logActivity } from "../services/activityLog.service.js";
import { sendLeadAssignmentEmail } from "../services/counsellorEmail.service.js";
import Conversation from "../models/mongo/Conversation.js";
import sseManager from "../utils/sseManager.js";

const { Lead, User, PasswordResetToken, LeadEducation } = db;

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

function sanitizeLeadData(data) {
  const sanitized = { ...data };

  // Date fields
  const dateFields = ["dob"];
  for (const field of dateFields) {
    if (sanitized[field] === "" || sanitized[field] === "Invalid date") {
      sanitized[field] = null;
    }
  }

  // Integer fields (keep counsellor_id, remove year_awarded etc. as they are deprecated)
  const intFields = ["counsellor_id"];
  for (const field of intFields) {
    if (
      sanitized[field] === "" ||
      sanitized[field] === null ||
      sanitized[field] === undefined
    ) {
      sanitized[field] = null;
    } else if (!isNaN(Number(sanitized[field]))) {
      sanitized[field] = Number(sanitized[field]);
    } else {
      sanitized[field] = null;
    }
  }

  // JSON field - we keep it but will usually be null now
  if (
    sanitized.english_test_scores === "" ||
    sanitized.english_test_scores === null
  ) {
    sanitized.english_test_scores = null;
  }

  // Handle total score
  if (
    sanitized.english_test_overall_score === "" ||
    sanitized.english_test_overall_score === null
  ) {
    sanitized.english_test_overall_score = null;
  } else if (!isNaN(parseFloat(sanitized.english_test_overall_score))) {
    sanitized.english_test_overall_score = parseFloat(
      sanitized.english_test_overall_score,
    );
  } else {
    sanitized.english_test_overall_score = null;
  }

  // Remove deprecated single-degree fields if present, to avoid confusion
  delete sanitized.study_level;
  delete sanitized.year_awarded;
  delete sanitized.grades_cgpa;
  delete sanitized.board_university;

  return sanitized;
}

// Helper to handle education entries
async function handleLeadEducation(leadId, educationArray, transaction = null) {
  if (!educationArray || !Array.isArray(educationArray)) return;

  // Delete existing entries
  await LeadEducation.destroy({ where: { lead_id: leadId }, transaction });

  // Insert new ones
  if (educationArray.length > 0) {
    const educationData = educationArray.map((edu) => ({
      lead_id: leadId,
      degree: edu.degree,
      year_awarded: edu.year_awarded,
      grades_cgpa: edu.grades_cgpa || null,
      board_university: edu.board_university || null,
    }));
    await LeadEducation.bulkCreate(educationData, { transaction });
  }
}

// ------------------------------------------------------------
// NEW HELPER: handle first entry into Counseling
// ------------------------------------------------------------
async function handleFirstCounselingEntry(lead, actor) {
  if (!lead.email) {
    console.log(`Lead ${lead.id} has no email; cannot send password setup.`);
    return;
  }

  if (lead.has_entered_counseling) {
    console.log(`Lead ${lead.id} already entered counseling before; skipping.`);
    return;
  }

  // Find or create student user
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
    // Clear any existing reset tokens for this user
    await PasswordResetToken.destroy({ where: { user_id: student.id } });
  }

  // Link lead to student user if not already linked
  if (!lead.user_id || lead.user_id !== student.id) {
    lead.user_id = student.id;
    await lead.save();
  }

  // Generate password reset token (used for setup)
  const token = crypto.randomBytes(32).toString("hex");
  await PasswordResetToken.create({
    user_id: student.id,
    token,
    expires_at: new Date(Date.now() + 86400000), // 24 hours
  });

  const setupLink = `${process.env.FRONTEND_URL}/setup-password?token=${token}`;
  await sendPasswordSetupEmail({
    name: lead.name,
    email: lead.email,
    setupLink,
  });

  // Mark that the lead has entered counseling
  await lead.update({ has_entered_counseling: true });

  // Log the email send
  await logActivity({
    leadId: lead.id,
    actionType: "setup_email_sent",
    note: `Password setup email sent to ${lead.email} (first entry into Counseling)`,
    performedBy: actor.id,
    performedByRole: actor.role,
    performedByName: actor.name,
  });

  // Create conversation if counsellor assigned
  if (lead.counsellor_id) {
    const counsellor = await User.findByPk(lead.counsellor_id, {
      attributes: ["name"],
    });
    const exists = await Conversation.findOne({
      where: { student_id: student.id, counsellor_id: lead.counsellor_id },
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
// ------------------------------------------------------------

export async function createLead(req, res) {
  try {
    // Sanitize incoming data
    let sanitizedBody = sanitizeLeadData(req.body);

    // Handle counsellor assignment logic
    const data = {
      ...sanitizedBody,
      counsellor_id:
        sanitizedBody.counsellor_id === "" || !sanitizedBody.counsellor_id
          ? req.user.role === "counsellor"
            ? req.user.id
            : null
          : Number(sanitizedBody.counsellor_id),
    };

    // Compute overall score only if direct score is not provided
    if (
      data.english_proficiency_test &&
      data.english_proficiency_test !== "none"
    ) {
      if (
        data.english_test_overall_score !== undefined &&
        data.english_test_overall_score !== null
      ) {
        // Use the direct total score from frontend
        // already set in sanitizedBody
      }
      // Fallback for legacy clients that still send module scores
      else if (data.english_test_scores) {
        data.english_test_overall_score = computeEnglishTestOverallScore(
          data.english_proficiency_test,
          data.english_test_scores,
        );
      }
    } else {
      data.english_test_overall_score = null;
    }

    // Ensure we don't store modular scores (optional: set to null)
    data.english_test_scores = null;

    const lead = await Lead.create(data);

    // Handle education entries
    if (req.body.education && Array.isArray(req.body.education)) {
      await handleLeadEducation(lead.id, req.body.education);
    }

    await logActivity({
      leadId: lead.id,
      actionType: "lead_created",
      toValue: lead.status,
      note: `Lead created via ${lead.source || "unknown"} · Phone: ${lead.phone || "—"} · Country: ${lead.preferred_country || "—"}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    if (lead.counsellor_id) {
      const counsellorUser = await User.findOne({
        where: { id: lead.counsellor_id, role: "counsellor" },
        attributes: ["id", "name", "email"],
      });

      if (counsellorUser?.email) {
        sendLeadAssignmentEmail({
          counsellorEmail: counsellorUser.email,
          counsellorName: counsellorUser.name,
          lead: lead.toJSON(),
        }).catch((err) => console.error("Background email error:", err));
      }
    }

    // --------------------------------------------------------
    // NEW: If lead is created directly in Counseling, send password setup email (only once)
    // --------------------------------------------------------
    if (lead.status === "counseling" && !lead.has_entered_counseling) {
      await handleFirstCounselingEntry(lead, req.user);
    }
    // --------------------------------------------------------

    // Return lead with education included
    const leadWithEducation = await Lead.findByPk(lead.id, {
      include: [
        { model: User, as: "counsellor" },
        { model: LeadEducation, as: "education" },
      ],
    });

    res.status(201).json(leadWithEducation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function getAllLeads(req, res) {
  try {
    const where = { is_deleted: false };

    if (req.user.role === "counsellor") {
      where.counsellor_id = req.user.id;
    }

    const leads = await Lead.findAll({
      where,
      include: [{ model: User, as: "counsellor" }],
      order: [["createdAt", "DESC"]],
    });

    res.json(leads);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function getLeadById(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id, {
      include: [
        { model: User, as: "counsellor" },
        { model: LeadEducation, as: "education" },
      ],
    });

    if (!lead || lead.is_deleted) {
      return res.status(404).json({ message: "Lead not found." });
    }

    res.json(lead);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function updateLead(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found." });

    // Sanitize the incoming update data
    let sanitizedBody = sanitizeLeadData(req.body);

    // Fields that can be updated (excluding deprecated single-degree fields)
    const fields = [
      "name",
      "email",
      "phone",
      "preferred_country",
      "source",
      "dob",
      "marital_status",
      "father_name",
      "father_contact",
      "home_address",
      "english_proficiency_test",
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
        // Compare numerically
        const oldNum =
          oldVal === null || oldVal === "" ? null : parseFloat(oldVal);
        const newNum =
          newVal === null || newVal === "" ? null : parseFloat(newVal);
        if (oldNum !== newNum && !(isNaN(oldNum) && isNaN(newNum))) {
          isChanged = true;
        }
      } else {
        // String comparison for other fields
        if (String(oldVal) !== String(newVal)) {
          isChanged = true;
        }
      }

      if (isChanged) {
        changes.push(`${field}: "${oldVal}" → "${newVal}"`);
      }
    });

    let updateData = { ...sanitizedBody };

    // Handle total score logic
    if (
      sanitizedBody.english_proficiency_test &&
      sanitizedBody.english_proficiency_test !== "none"
    ) {
      if (
        sanitizedBody.english_test_overall_score !== undefined &&
        sanitizedBody.english_test_overall_score !== null
      ) {
        // Direct score provided – use it
        updateData.english_test_overall_score =
          sanitizedBody.english_test_overall_score;
      }
      // Fallback for legacy clients: compute from module scores (if any)
      else if (sanitizedBody.english_test_scores) {
        updateData.english_test_overall_score = computeEnglishTestOverallScore(
          sanitizedBody.english_proficiency_test,
          sanitizedBody.english_test_scores,
        );
      }
    } else {
      updateData.english_test_overall_score = null;
    }

    // We no longer store modular scores – set to null
    updateData.english_test_scores = null;

    await lead.update(updateData);

    // Handle education entries if provided
    if (req.body.education !== undefined) {
      await handleLeadEducation(lead.id, req.body.education);
      changes.push("Education entries updated");
    }

    await logActivity({
      leadId: lead.id,
      actionType: "lead_updated",
      note:
        changes.length > 0
          ? `Updated — ${changes.join(" · ")}`
          : "Lead details updated",
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    // Return updated lead with education
    const updatedLead = await Lead.findByPk(lead.id, {
      include: [
        { model: User, as: "counsellor" },
        { model: LeadEducation, as: "education" },
      ],
    });

    res.json(updatedLead);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function assignCounsellor(req, res) {
  try {
    console.log("🔥 ASSIGN API HIT");
    const newCounsellorId = req.body.counsellor_id
      ? Number(req.body.counsellor_id)
      : null;

    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found." });

    const prevCounsellor = lead.counsellor_id
      ? await User.findByPk(lead.counsellor_id, { attributes: ["name"] })
      : null;

    const newCounsellor = newCounsellorId
      ? await User.findByPk(newCounsellorId, { attributes: ["name", "email"] })
      : null;

    lead.counsellor_id = newCounsellorId;
    await lead.save();

    // ✅ If a new counsellor is assigned and the lead has a student user, ensure conversation exists
    if (newCounsellorId && lead.user_id) {
      const studentUser = await User.findByPk(lead.user_id, {
        attributes: ["name"],
      });
      if (studentUser) {
        await ensureConversation(
          lead.user_id,
          newCounsellorId,
          lead.name,
          newCounsellor?.name || "Counsellor",
        );
      }
    }

    await logActivity({
      leadId: lead.id,
      actionType: "counsellor_assigned",
      fromValue: prevCounsellor?.name || "Unassigned",
      toValue: newCounsellor?.name || "Unassigned",
      note: `Counsellor changed from "${prevCounsellor?.name || "Unassigned"}" to "${newCounsellor?.name || "Unassigned"}"`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    if (newCounsellor?.email) {
      try {
        await sendLeadAssignmentEmail({
          counsellorEmail: newCounsellor.email,
          counsellorName: newCounsellor.name,
          lead: lead.toJSON(),
        });
      } catch (err) {
        console.error("Email error:", err);
      }
    }

    if (newCounsellorId && newCounsellor) {
      const event = {
        type: "lead_assigned",
        message: `A new lead "${lead.name}" has been assigned to you.`,
        leadId: lead.id,
        leadName: lead.name,
        counsellorId: newCounsellorId,
        assignedBy: req.user.name,
        assignedByRole: req.user.role,
      };
      const sent = sseManager.sendToUser(newCounsellorId.toString(), event);
      if (sent)
        console.log(`SSE lead_assigned sent to counsellor ${newCounsellorId}`);
      else console.log(`Counsellor ${newCounsellorId} not connected via SSE`);
    }

    res.json(lead);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function updateStage(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const { status, note } = req.body;
    const oldStatus = lead.status;

    if (!status) return res.status(400).json({ message: "Status is required" });

    await lead.update({ status });

    await logActivity({
      leadId: lead.id,
      actionType: "stage_changed",
      from_value: oldStatus,
      to_value: status,
      note: `Moved from ${oldStatus} to ${status}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    if (note && note.trim()) {
      const stageLabels = {
        new: "New",
        contacted: "Contacted",
        counseling: "Counseling",
        visa_filed: "Visa Filed",
        visa_approved: "Visa Approved",
        success: "Success",
        rejected: "Rejected",
      };

      const newStageLabel = stageLabels[status] || status;

      await logActivity({
        leadId: lead.id,
        actionType: "note_added",
        note: `[${newStageLabel}] ${note}`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    // --------------------------------------------------------
    // MODIFIED: Send password setup email ONLY on first entry into Counseling
    // --------------------------------------------------------
    const isMovingToCounseling =
      status === "counseling" && oldStatus !== "counseling";

    if (isMovingToCounseling && lead.email) {
      // Use the helper – it will check lead.has_entered_counseling internally
      await handleFirstCounselingEntry(lead, req.user);
    }
    // --------------------------------------------------------

    res.json({ message: "Stage updated successfully", lead });
  } catch (error) {
    console.error("Stage update error:", error);
    res.status(500).json({ message: error.message });
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

    await lead.update({ is_deleted: true });

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

    if (stage) {
      where.metadata = { stage };
    }

    res.json({});
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
