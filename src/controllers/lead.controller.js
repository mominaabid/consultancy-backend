import crypto from 'crypto';
import db from '../models/mysql/index.js';
import { sendPasswordSetupEmail } from '../services/email.service.js';

const { Lead, User, PasswordResetToken } = db;

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
    const where = {};
    if (req.user.role === 'counsellor') {
      where.counsellor_id = req.user.id;
    }
    const leads = await Lead.findAll({
      where,
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

    const previousStatus = lead.status;
    const newStatus      = req.body.status;

    lead.status = newStatus;
    await lead.save();

    console.log(`📊 Stage: ${previousStatus} → ${newStatus}`);

    // ── Trigger ONLY when moving TO counseling for first time ──────────────
    const isMovingToCounseling = newStatus === 'counseling' && previousStatus !== 'counseling';

    if (isMovingToCounseling && lead.email) {
      console.log('🎯 Counseling trigger fired for:', lead.email);

      // Check if student account already exists
      let student = await User.findOne({ where: { email: lead.email, role: 'student' } });

      if (student) {
        // Student exists — just resend a fresh setup link
        console.log('👤 Student exists, resending setup link...');

        // Delete old tokens for this user
        await PasswordResetToken.destroy({ where: { user_id: student.id } });

      } else {
        // Create fresh student account
        console.log('🆕 Creating new student account...');
        student = await User.create({
          name:          lead.name,
          email:         lead.email,
          password_hash: 'PENDING_SETUP',
          role:          'student',
          is_active:     false,
        });
        console.log('✅ Student created with id:', student.id);
      }

      // Generate fresh token
      const token     = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await PasswordResetToken.create({
        user_id:    student.id,
        token,
        expires_at: expiresAt,
      });

      const setupLink = `${process.env.FRONTEND_URL}/setup-password?token=${token}`;
      console.log('🔗 Setup link:', setupLink);

      // Send email
      const emailResult = await sendPasswordSetupEmail({
        name:      lead.name,
        email:     lead.email,
        setupLink,
      });

      console.log('📨 Email result:', JSON.stringify(emailResult));
    }

    res.json(lead);
  } catch (error) {
    console.error('❌ updateStage error:', error);
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