import crypto from "crypto";
import db from "../models/mysql/index.js";
import { sendPasswordSetupEmail } from "../services/email.service.js";
import { logActivity } from "../services/activityLog.service.js";
import Conversation from "../models/mongo/Conversation.js";
const { Lead, User, PasswordResetToken } = db;

// ─── POST /admin/leads ────────────────────────────────────────────────────────
// src/controllers/admin/lead.controller.js

export async function createLead(req, res) {
  try {
    const data = {
      ...req.body,
      counsellor_id:
        req.body.counsellor_id === "" || !req.body.counsellor_id
          ? (req.user.role === 'counsellor' ? req.user.id : null)  // ← Auto-assign for counsellor
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

    res.status(201).json(lead);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── GET /admin/leads ─────────────────────────────────────────────────────────
export async function getAllLeads(req, res) {
  try {
    const where = {
      is_deleted: false,
    };

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

    // Track exactly what changed
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
export async function assignCounsellor(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found." });

    const prevCounsellor = lead.counsellor_id
      ? await User.findByPk(lead.counsellor_id, { attributes: ["name"] })
      : null;

    const newCounsellor = req.body.counsellor_id
      ? await User.findByPk(req.body.counsellor_id, { attributes: ["name"] })
      : null;

    lead.counsellor_id = req.body.counsellor_id || null;
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
    if (!lead) return res.status(404).json({ message: "Lead not found." });

    const previousStatus = lead.status;
    const newStatus = req.body.status;
    const userNote = req.body.note || null;

    lead.status = newStatus;
    await lead.save();

    // ── Log stage change ───────────────────────────────────────────────────
    await logActivity({
      leadId: lead.id,
      actionType: "stage_changed",
      fromValue: previousStatus,
      toValue: newStatus,
      note: userNote
        ? userNote
        : `Stage moved from "${previousStatus}" to "${newStatus}"`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    // ── Log note separately if provided ───────────────────────────────────
    if (userNote) {
      await logActivity({
        leadId: lead.id,
        actionType: "note_added",
        note: userNote,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    console.log(`📊 Stage: ${previousStatus} → ${newStatus}`);

    // ── Counseling trigger ─────────────────────────────────────────────────
    const isMovingToCounseling =
      newStatus === "counseling" && previousStatus !== "counseling";

    if (isMovingToCounseling && lead.email) {
      console.log("🎯 Counseling trigger fired for:", lead.email);

      const existingUser = await User.findOne({ where: { email: lead.email } });

      // If email belongs to admin/counsellor — skip
      if (existingUser && existingUser.role !== "student") {
        console.log(
          "⚠️ Email belongs to staff:",
          existingUser.role,
          "— skipping",
        );
        return res.json(lead);
      }

      let student;

      if (existingUser && existingUser.role === "student") {
        // Student already exists — resend fresh link
        console.log("👤 Student exists — resending link");
        student = existingUser;
        await PasswordResetToken.destroy({ where: { user_id: student.id } });

        await logActivity({
          leadId: lead.id,
          actionType: "setup_email_resent",
          note: `Setup email resent to ${lead.email}`,
          performedBy: req.user.id,
          performedByRole: req.user.role,
          performedByName: req.user.name,
        });
      } else {
        // Create new student user
        console.log("🆕 Creating new student account...");
        student = await User.create({
          name: lead.name,
          email: lead.email,
          password_hash: "PENDING_SETUP",
          role: "student",
          is_active: false,
        });
        console.log("✅ Student created with id:", student.id);

        await logActivity({
          leadId: lead.id,
          actionType: "student_account_created",
          note: `Student portal account created for ${lead.email}`,
          performedBy: req.user.id,
          performedByRole: req.user.role,
          performedByName: req.user.name,
        });
      }

      // ── Generate token + send email ──────────────────────────────────────
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24hrs

      await PasswordResetToken.create({
        user_id: student.id,
        token,
        expires_at: expiresAt,
      });

      const setupLink = `${process.env.FRONTEND_URL}/setup-password?token=${token}`;
      console.log("🔗 Setup link:", setupLink);

      const emailResult = await sendPasswordSetupEmail({
        name: lead.name,
        email: lead.email,
        setupLink,
      });
      console.log("📨 Email result:", JSON.stringify(emailResult));

      await logActivity({
        leadId: lead.id,
        actionType: "setup_email_sent",
        note: `Password setup email sent to ${lead.email}. Link expires in 24 hours.`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });

      // ── Auto-create MongoDB conversation ─────────────────────────────────
      if (lead.counsellor_id) {
        const counsellor = await User.findByPk(lead.counsellor_id, {
          attributes: ["id", "name"],
        });

        const existingConv = await Conversation.findOne({
          student_id: student.id,
          counsellor_id: lead.counsellor_id,
        });

        if (!existingConv) {
          await Conversation.create({
            student_id: student.id,
            counsellor_id: lead.counsellor_id,
            student_name: lead.name,
            counsellor_name: counsellor?.name || "Counsellor",
            last_message: "",
          });
          console.log(
            `💬 Conversation created: ${lead.name} ↔ ${counsellor?.name}`,
          );

          await logActivity({
            leadId: lead.id,
            actionType: "conversation_started",
            note: `Chat conversation opened between ${lead.name} and ${counsellor?.name}`,
            performedBy: req.user.id,
            performedByRole: req.user.role,
            performedByName: req.user.name,
          });
        } else {
          console.log("💬 Conversation already exists — skipping");
        }
      } else {
        console.log(
          "⚠️ No counsellor assigned to lead — conversation not created",
        );
      }
    }

    res.json(lead);
  } catch (error) {
    console.error("❌ updateStage error:", error);
    res.status(500).json({ message: error.message });
  }
}

// ─── DELETE /admin/leads/:id ──────────────────────────────────────────────────
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
// GET /admin/leads/:id/stage-notes
export async function getStageNotes(req, res) {
  try {
    const leadId = req.params.id;
    const stage = req.query.stage; // Optional stage filter
    
    // You'll need a new table 'stage_notes' or use existing logs
    // For now, let's fetch from activity logs grouped by stage
    const where = {
      lead_id: leadId,
      action_type: 'stage_note', // New action type
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
    
    const userNote = req.body.note;
    
    if (!userNote || !userNote.trim()) {
      return res.status(400).json({ message: "Note is required." });
    }
    
    await logActivity({
      leadId: lead.id,
      actionType: "note_added",
      note: userNote,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });
    
    res.json({ message: "Note added successfully", lead });
  } catch (error) {
    console.error("❌ addNoteOnly error:", error);
    res.status(500).json({ message: error.message });
  }
}