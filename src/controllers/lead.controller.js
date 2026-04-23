import crypto from 'crypto';
import db from '../models/mysql/index.js';
import { sendPasswordSetupEmail } from '../services/email.service.js';
import { logActivity } from '../services/activityLog.service.js';
import Conversation from '../models/mongo/Conversation.js';
const { Lead, User, PasswordResetToken } = db;

// ─── POST /admin/leads ────────────────────────────────────────────────────────
export async function createLead(req, res) {
  try {
    const data = {
      ...req.body,
      counsellor_id:
        req.body.counsellor_id === "" || !req.body.counsellor_id
          ? null
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

// ─── PUT /admin/leads/:id/stage ───────────────────────────────────────────────
export async function updateStage(req, res) {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ message: "Lead not found." });

    const previousStatus = lead.status;
    const newStatus      = req.body.status;
    const userNote       = req.body.note || null; // ✅ accept note from frontend

    lead.status = newStatus;
    await lead.save();

    await logActivity({
      leadId:          lead.id,
      actionType:      'stage_changed',
      fromValue:       previousStatus,
      toValue:         newStatus,
      note:            userNote
        ? `${userNote}` // ✅ use counsellor's note
        : `Stage moved from "${previousStatus}" to "${newStatus}"`,
      performedBy:     req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    console.log(`📊 Stage: ${previousStatus} → ${newStatus}`);

    // ─── Counseling trigger ────────────────────────────────────────────────────
    const isMovingToCounseling =
      newStatus === 'counseling' && previousStatus !== 'counseling';
if (isMovingToCounseling && lead.email) {

  console.log("💬 Creating chat conversation...");

  await Conversation.create({
    student_id: lead.id,              // MySQL lead ID
    counsellor_id: lead.counsellor_id,

    student_name: lead.name,
    counsellor_name: newCounsellor?.name || "Counsellor",

    last_message: "",
    last_message_at: new Date(),

    student_unread: 0,
    counsellor_unread: 0
  });

  console.log("✅ Conversation created in MongoDB");
}
    if (isMovingToCounseling && lead.email) {
      console.log("🎯 Counseling trigger fired for:", lead.email);

      const existingUser = await User.findOne({ where: { email: lead.email } });

      // If email belongs to staff — skip silently
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
        // Resend fresh link
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

      // Generate token
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

    await lead.update({ is_deleted: false });

    res.json({ message: "Lead deleted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}
