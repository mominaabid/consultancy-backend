import bcrypt from 'bcryptjs';
import db from "../models/mysql/index.js";
const { Counsellor, User } = db;

export async function createCounsellor(req, res) {
  try {
    const {
      name, father_name, email, phone,
      cnic, password, address, role, status
    } = req.body;

    // 1. Check if email already exists in users table
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: 'This email is already registered.' });
    }

    // 2. Hash the password
    const password_hash = await bcrypt.hash(password, 10);

    // 3. Save in users table → so they can LOGIN
    await User.create({
      name,
      email,
      password_hash,
      role: 'counsellor',
      is_active: true,
    });

    // 4. Save in counsellors table → full profile data
    const counsellor = await Counsellor.create({
      name,
      father_name,
      email,
      phone,
      cnic,
      password: password_hash,  // store hashed here too
      address,
      role: role || 'counsellor',
      status: status || 'active',
    });

    return res.status(201).json({
      message: "Counsellor created successfully",
      data: counsellor,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ── Keep these exactly as they are ──────────────────────────────
export async function getAllCounsellors(req, res) {
  try {
    const counsellors = await Counsellor.findAll({ order: [["id", "DESC"]] });
    res.json(counsellors);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function updateCounsellor(req, res) {
  try {
    const counsellor = await Counsellor.findByPk(req.params.id);
    if (!counsellor) return res.status(404).json({ message: "Counsellor not found" });
    await counsellor.update(req.body);
    res.json({ message: "Counsellor updated successfully", data: counsellor });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function deleteCounsellor(req, res) {
  try {
    const counsellor = await Counsellor.findByPk(req.params.id);
    if (!counsellor) return res.status(404).json({ message: "Counsellor not found" });
    await counsellor.destroy();
    res.json({ message: "Counsellor deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}