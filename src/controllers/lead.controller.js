import crypto from "crypto";
import db from "../models/mysql/index.js";
import { sendPasswordSetupEmail } from "../services/email.service.js";
import { logActivity } from "../services/activityLog.service.js";
import { sendLeadAssignmentEmail } from "../services/counsellorEmail.service.js";
import Conversation from "../models/mongo/Conversation.js";
import sseManager from "../utils/sseManager.js";

const { Lead, User, PasswordResetToken } = db;

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

/**
 * Sanitizes lead data before DB insertion/update.
 * Converts empty strings and "Invalid date" to null for date, integer, and JSON fields.
 */
function sanitizeLeadData(data) {
  const sanitized = { ...data };

  // Date fields
  const dateFields = ["dob"];
  for (const field of dateFields) {
    if (sanitized[field] === "" || sanitized[field] === "Invalid date") {
      sanitized[field] = null;
    }
  }

  // Integer fields
  const intFields = ["year_awarded", "counsellor_id"];
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

  // JSON field
  if (
    sanitized.english_test_scores === "" ||
    sanitized.english_test_scores === null
  ) {
    sanitized.english_test_scores = null;
  }

  return sanitized;
}

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

    if (data.english_proficiency_test && data.english_test_scores) {
      data.english_test_overall_score = computeEnglishTestOverallScore(
        data.english_proficiency_test,
        data.english_test_scores,
      );
    }

    const lead = await Lead.create(data);

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

    res.status(201).json(lead);
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
      include: [{ model: User, as: "counsellor" }],
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

    const fields = [
      "name",
      "email",
      "phone",
      "preferred_country",
      "study_level",
      "source",
      "dob",
      "marital_status",
      "father_name",
      "father_contact",
      "home_address",
      "year_awarded",
      "grades_cgpa",
      "board_university",
      "english_proficiency_test",
      "english_test_scores",
    ];

    const changes = [];
    fields.forEach((field) => {
      if (
        sanitizedBody[field] !== undefined &&
        String(sanitizedBody[field]) !== String(lead[field])
      ) {
        changes.push(`${field}: "${lead[field]}" → "${sanitizedBody[field]}"`);
      }
    });

    let updateData = { ...sanitizedBody };
    if (
      sanitizedBody.english_proficiency_test ||
      sanitizedBody.english_test_scores
    ) {
      const testType =
        sanitizedBody.english_proficiency_test || lead.english_proficiency_test;
      const scores =
        sanitizedBody.english_test_scores || lead.english_test_scores;
      if (testType && scores) {
        updateData.english_test_overall_score = computeEnglishTestOverallScore(
          testType,
          scores,
        );
      }
    }

    await lead.update(updateData);

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

    res.json(lead);
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

    const isMovingToCounseling =
      status === "counseling" && oldStatus !== "counseling";

    if (isMovingToCounseling && lead.email) {
      const existingUser = await User.findOne({ where: { email: lead.email } });

      let student;

      if (existingUser && existingUser.role === "student") {
        student = existingUser;
        await PasswordResetToken.destroy({ where: { user_id: student.id } });

        if (lead.user_id !== student.id) {
          lead.user_id = student.id;
          await lead.save();
        }
      } else if (!existingUser) {
        student = await User.create({
          name: lead.name,
          email: lead.email,
          password_hash: "PENDING_SETUP",
          role: "student",
          is_active: false,
        });

        lead.user_id = student.id;
        await lead.save();
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

      await logActivity({
        leadId: lead.id,
        actionType: "setup_email_sent",
        note: `Password setup email sent to ${lead.email}`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });

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
