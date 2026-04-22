import bcrypt from 'bcryptjs';
import db from '../models/mysql/index.js';
import { logActivity } from '../services/activityLog.service.js';

const { Counsellor, User, Lead } = db;

// ─── POST /admin/addCounsellor ────────────────────────────────────────────────
export async function createCounsellor(req, res) {
  try {
    const { name, father_name, email, phone, cnic, password, address, role, status } = req.body;

    // Check duplicate email
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: 'This email is already registered.' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create in users table — for login
    const newUser = await User.create({
      name,
      email,
      password_hash,
      role:      'counsellor',
      is_active: true,
    });

    // Create in counsellors table — full profile
    const counsellor = await Counsellor.create({
      name,
      father_name,
      email,
      phone,
      cnic,
      password: password_hash,
      address,
      role:   role   || 'counsellor',
      status: status || 'active',
    });

    // Log — admin created counsellor
    // req.user may not exist if called without auth middleware on this route
    if (req.user) {
      await logActivity({
        leadId:          null, // not lead-specific
        actionType:      'counsellor_created',
        toValue:         email,
        note:            `New counsellor "${name}" (${email}) created`,
        performedBy:     req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    return res.status(201).json({
      message: 'Counsellor created successfully',
      data:    counsellor,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── GET /admin/getCounsellors ────────────────────────────────────────────────
export async function getAllCounsellors(req, res) {
  try {
    const counsellors = await Counsellor.findAll({ order: [['id', 'DESC']] });
    res.json(counsellors);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── PUT /admin/updateCounsellor/:id ─────────────────────────────────────────
export async function updateCounsellor(req, res) {
  try {
    const counsellor = await Counsellor.findByPk(req.params.id);
    if (!counsellor) return res.status(404).json({ message: 'Counsellor not found' });

    // Track what changed
    const fields  = ['name', 'email', 'phone', 'address', 'status'];
    const changes = [];
    fields.forEach(field => {
      if (req.body[field] !== undefined && String(req.body[field]) !== String(counsellor[field])) {
        changes.push(`${field}: "${counsellor[field]}" → "${req.body[field]}"`);
      }
    });

    await counsellor.update(req.body);

    // Also update name in users table if name changed
    if (req.body.name && req.body.name !== counsellor.name) {
      await User.update({ name: req.body.name }, { where: { email: counsellor.email } });
    }

    // Also update status in users table if status changed
    if (req.body.status) {
      await User.update(
        { is_active: req.body.status === 'active' },
        { where: { email: counsellor.email } }
      );
    }

    if (req.user) {
      await logActivity({
        leadId:          null,
        actionType:      'counsellor_updated',
        note:            changes.length > 0
          ? `Counsellor "${counsellor.name}" updated — ${changes.join(' · ')}`
          : `Counsellor "${counsellor.name}" details updated`,
        performedBy:     req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    res.json({ message: 'Counsellor updated successfully', data: counsellor });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── DELETE /admin/deleteCounsellor/:id ───────────────────────────────────────
export async function deleteCounsellor(req, res) {
  try {
    const counsellor = await Counsellor.findByPk(req.params.id);
    if (!counsellor) return res.status(404).json({ message: 'Counsellor not found' });

    if (req.user) {
      await logActivity({
        leadId:          null,
        actionType:      'counsellor_deleted',
        note:            `Counsellor "${counsellor.name}" (${counsellor.email}) was deleted`,
        performedBy:     req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    // Unassign their leads first
    await Lead.update({ counsellor_id: null }, { where: { counsellor_id: counsellor.id } });

    // Delete from users table
    await User.destroy({ where: { email: counsellor.email, role: 'counsellor' } });

    // Delete from counsellors table
    await counsellor.destroy();

    res.json({ message: 'Counsellor deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}