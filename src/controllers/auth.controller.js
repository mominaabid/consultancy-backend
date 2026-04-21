import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../models/mysql/index.js';
import crypto from 'crypto';
import { sendPasswordSetupEmail } from '../services/email.service.js';
const { Lead, User, PasswordResetToken } = db;


// GET /auth/verify-setup-token?token=xxx  (frontend calls on page load)
export async function verifySetupToken(req, res) {
  try {
    const { token } = req.query;
    const { PasswordResetToken, User } = db;

    const record = await PasswordResetToken.findOne({ where: { token } });

    if (!record) 
      return res.status(400).json({ valid: false, message: 'Invalid or expired link.' });

    if (new Date() > new Date(record.expires_at))
      return res.status(400).json({ valid: false, message: 'Link has expired.' });

    const user = await User.findByPk(record.user_id, {
      attributes: ['id', 'name', 'email'],
    });

    res.json({ valid: true, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// POST /auth/setup-password  { token, password }
export async function setupPassword(req, res) {
  try {
    const { token, password } = req.body;
    const { PasswordResetToken, User } = db;

    if (!token || !password)
      return res.status(400).json({ message: 'Token and password are required.' });

    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });

    const record = await PasswordResetToken.findOne({ where: { token } });

    if (!record)
      return res.status(400).json({ message: 'Invalid or expired link.' });

    if (new Date() > new Date(record.expires_at))
      return res.status(400).json({ message: 'Link has expired. Contact your counsellor.' });

    // Hash and save password, activate account
    const password_hash = await bcrypt.hash(password, 10);
    await User.update(
      { password_hash, is_active: true },
      { where: { id: record.user_id } }
    );

    // Delete token — one time use
    await record.destroy();

    res.json({ message: 'Password set successfully. You can now login.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
// POST /api/v1/auth/login
export async function login(req, res) {
  try {
    const { email, password } = req.body;
    
    console.log('=== LOGIN ATTEMPT ===');
    console.log('Email:', email);
    console.log('Password received:', password);

    const user = await User.findOne({ where: { email } });
    
    console.log('User found:', user ? 'YES' : 'NO');
    if (user) {
      console.log('Hash in DB:', user.password_hash);
      console.log('Hash starts with $2a$:', user.password_hash?.startsWith('$2a$'));
    }

    if (!user) return res.status(401).json({ message: 'User not found.' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    console.log('bcrypt.compare result:', isMatch);

    if (!isMatch) return res.status(401).json({ message: 'Password mismatch.' });

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}
// GET /api/v1/auth/me  (protected)
export async function getMe(req, res) {
  try {
    const user = await User.findOne({
      where: { id: req.user.id },
      attributes: ['id', 'name', 'email', 'role', 'is_active'],
    });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ data: user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}