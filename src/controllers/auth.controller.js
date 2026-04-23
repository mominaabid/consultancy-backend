import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import db from "../models/mysql/index.js";

const { User, PasswordResetToken } = db;

/* ================= STUDENT ================= */

// GET /auth/verify-setup-token
export async function verifySetupToken(req, res) {
  try {
    const { token } = req.query;

    const record = await PasswordResetToken.findOne({ where: { token } });

    if (!record)
      return res
        .status(400)
        .json({ valid: false, message: "Invalid or expired link." });

    if (new Date() > new Date(record.expires_at))
      return res
        .status(400)
        .json({ valid: false, message: "Link has expired." });

    const user = await User.findByPk(record.user_id, {
      attributes: ["id", "name", "email"],
    });

    res.json({ valid: true, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// POST /auth/setup-password
export async function setupPassword(req, res) {
  try {
    const { token, password } = req.body;

    if (!token || !password)
      return res
        .status(400)
        .json({ message: "Token and password are required." });

    if (password.length < 6)
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters." });

    const record = await PasswordResetToken.findOne({ where: { token } });

    if (!record)
      return res.status(400).json({ message: "Invalid or expired link." });

    if (new Date() > new Date(record.expires_at))
      return res
        .status(400)
        .json({ message: "Link has expired. Contact your counsellor." });

    const password_hash = await bcrypt.hash(password, 10);

    await User.update(
      { password_hash, is_active: true },
      { where: { id: record.user_id } },
    );

    await record.destroy();

    res.json({ message: "Password set successfully. You can now login." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// POST /auth/login
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });

    if (!user) return res.status(401).json({ message: "User not found." });

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch)
      return res.status(401).json({ message: "Password mismatch." });

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/* ================= COUNSELLOR ================= */

// GET /auth/counsellor/verify-setup-token
export async function verifyCounsellorSetupToken(req, res) {
  try {
    const { token } = req.query;

    const record = await PasswordResetToken.findOne({ where: { token } });

    if (!record)
      return res
        .status(400)
        .json({ valid: false, message: "Invalid or expired link." });

    if (new Date() > new Date(record.expires_at))
      return res
        .status(400)
        .json({ valid: false, message: "Link has expired." });

    const user = await User.findByPk(record.user_id, {
      attributes: ["id", "name", "email", "role"],
    });

    if (user.role !== "counsellor")
      return res
        .status(403)
        .json({ valid: false, message: "Unauthorized access." });

    res.json({ valid: true, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// POST /auth/counsellor/setup-password
export async function setupCounsellorPassword(req, res) {
  try {
    const { token, password } = req.body;

    if (!token || !password)
      return res
        .status(400)
        .json({ message: "Token and password are required." });

    if (password.length < 6)
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters." });

    const record = await PasswordResetToken.findOne({ where: { token } });

    if (!record)
      return res.status(400).json({ message: "Invalid or expired link." });

    if (new Date() > new Date(record.expires_at))
      return res
        .status(400)
        .json({ message: "Link has expired. Contact admin." });

    const user = await User.findByPk(record.user_id);

    if (!user || user.role !== "counsellor")
      return res.status(403).json({ message: "Unauthorized." });

    const password_hash = await bcrypt.hash(password, 10);

    await User.update(
      { password_hash, is_active: true },
      { where: { id: user.id } },
    );

    await record.destroy();

    res.json({ message: "Counsellor password set successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// POST /auth/counsellor/login
export async function counsellorLogin(req, res) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email, role: "counsellor" } });

    if (!user)
      return res.status(401).json({ message: "Counsellor not found." });

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch)
      return res.status(401).json({ message: "Password mismatch." });

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/* ================= COMMON ================= */

// GET /auth/me
export async function getMe(req, res) {
  try {
    const user = await User.findOne({
      where: { id: req.user.id },
      attributes: ["id", "name", "email", "role", "is_active"],
    });

    if (!user) return res.status(404).json({ message: "User not found." });

    res.json({ data: user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
