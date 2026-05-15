import crypto from "crypto";
import db from "../models/mysql/index.js";
import { sendPasswordSetupEmail } from "../services/email.service.js";
import { logActivity } from "../services/activityLog.service.js";
import { sendLeadAssignmentEmail } from "../services/counsellorEmail.service.js"; // ✅ merged
import Conversation from "../models/mongo/Conversation.js";
import sseManager from "../utils/sseManager.js";

const { Lead, User, PasswordResetToken } = db;

export async function createLead(req, res) {
  try {
    const data = {
      ...req.body,
      counsellor_id:
        req.body.counsellor_id === "" || !req.body.counsellor_id
          ? req.user.role === "counsellor"
            ? req.user.id // ✅ auto assign
            : null
          : Number(req.body.counsellor_id),
    };

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

    // ✅ Send email if counsellor assigned
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

// ─── GET /admin/leads ─────────────────────────────────────────────────────────
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

// ─── GET /admin/leads/:id ─────────────────────────────────────────────────────
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

// ─── PUT /admin/leads/:id ─────────────────────────────────────────────────────
export async function updateLead(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found." });

    const fields = [
      "name",
      "email",
      "phone",
      "preferred_country",
      "study_level",
      "source",
    ];

    const changes = [];
    fields.forEach((field) => {
      if (
        req.body[field] !== undefined &&
        String(req.body[field]) !== String(lead[field])
      ) {
        changes.push(`${field}: "${lead[field]}" → "${req.body[field]}"`);
      }
    });

    await lead.update(req.body);

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

// ─── PUT /admin/leads/:id/assign ──────────────────────────────────────────────
// export async function assignCounsellor(req, res) {
//   try {
//     console.log("🔥 ASSIGN API HIT");
//     console.log("BODY:", req.body);
//     console.log("COUNCELLOR ID:", req.body.counsellor_id);

//     const newCounsellorId = req.body.counsellor_id
//       ? Number(req.body.counsellor_id)
//       : null;

//     console.log("PARSED ID:", newCounsellorId);

//     const lead = await Lead.findByPk(req.params.id);

//     if (!lead) {
//       return res.status(404).json({ message: "Lead not found." });
//     }

//     const prevCounsellor = lead.counsellor_id
//       ? await User.findByPk(lead.counsellor_id, {
//           attributes: ["name"],
//         })
//       : null;

//     const newCounsellor = newCounsellorId
//       ? await User.findByPk(newCounsellorId, {
//           attributes: ["name", "email"],
//         })
//       : null;

//     console.log("FOUND COUNSELLOR:", newCounsellor);

//     lead.counsellor_id = newCounsellorId;
//     await lead.save();

//     await logActivity({
//       leadId: lead.id,
//       actionType: "counsellor_assigned",
//       fromValue: prevCounsellor?.name || "Unassigned",
//       toValue: newCounsellor?.name || "Unassigned",
//       note: `Counsellor changed from "${prevCounsellor?.name || "Unassigned"}" to "${newCounsellor?.name || "Unassigned"}"`,
//       performedBy: req.user.id,
//       performedByRole: req.user.role,
//       performedByName: req.user.name,
//     });

//     // ✅ send email on assignment
//     if (newCounsellor?.email) {
//       try {
//         const result = await sendLeadAssignmentEmail({
//           counsellorEmail: newCounsellor.email,
//           counsellorName: newCounsellor.name,
//           lead: lead.toJSON(),
//         });

//         console.log("✅ EMAIL RESULT:", result);
//       } catch (err) {
//         console.error("❌ Background email error:", err);
//       }
//     } else {
//       console.log("❌ No counsellor email found");
//     }

//     res.json(lead);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: error.message });
//   }
// }

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

    // Send email to counsellor
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

    // 🟢 NEW: Send SSE real-time notification
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

// ─── PUT /admin/leads/:id/stage ───────────────────────────────────────────────
// ─── PUT /admin/leads/:id/stage ───────────────────────────────────────────────
export async function updateStage(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const { status, note } = req.body;
    const oldStatus = lead.status;

    if (!status) return res.status(400).json({ message: "Status is required" });

    // Update lead status
    await lead.update({ status });

    // Log Stage Change
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

    // === IMPORTANT: Save note with NEW stage ===
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

    // Keep your existing counseling flow
    const isMovingToCounseling = status === "counseling" && oldStatus !== "counseling";

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

      // Conversation creation
      if (lead.counsellor_id) {
        const counsellor = await User.findByPk(lead.counsellor_id, { attributes: ["name"] });

        const exists = await Conversation.findOne({
          where: { student_id: student.id, counsellor_id: lead.counsellor_id }
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

// ─── DELETE ───────────────────────────────────────────────────────────────────
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
    const stage = req.query.stage; // Optional stage filter

    // You'll need a new table 'stage_notes' or use existing logs
    // For now, let's fetch from activity logs grouped by stage
    const where = {
      lead_id: leadId,
      action_type: "stage_note", // New action type
    };

    if (stage) {
      where.metadata = { stage }; // You'll need to store stage in metadata
    }

    // Query your activity logs and group by stage
    // This is simplified - you'll need to implement based on your DB schema

    res.json({}); // Placeholder
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// POST /admin/leads/:id/stage-notes
export async function addStageNote(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found." });

    const { stage, note } = req.body;

    if (!stage || !note) {
      return res.status(400).json({ message: "Stage and note are required." });
    }

    // Log as a special note type with stage metadata
    await logActivity({
      leadId: lead.id,
      actionType: "stage_note",
      note: note,
      metadata: JSON.stringify({ stage }), // Store which stage this note belongs to
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
