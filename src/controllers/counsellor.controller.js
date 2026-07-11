// src/controllers/counsellor.controller.js
import bcrypt from "bcryptjs";
import crypto from "crypto";
import db from "../models/mysql/index.js";
import rawDb from "../config/db.js";
import { logActivity } from "../services/activityLog.service.js";
import { sendCounsellorPasswordSetupEmail } from "../services/email.service.js";
import jwt from "jsonwebtoken";

const { Counsellor, User, Lead } = db;

const emailRegex = /^[a-zA-Z][a-zA-Z0-9._%+-]*@[a-zA-Z.-]+\.[a-zA-Z]{2,}$/;

// ──────────────────────────────────────────────────────────────────────────────
// CREATE COUNSELLOR
// ──────────────────────────────────────────────────────────────────────────────
export async function createCounsellor(req, res) {
  try {
    const { name, father_name, email, phone, cnic, address, role, status } =
      req.body;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Check duplicate CNIC
    if (cnic) {
      const existingCnic = await Counsellor.findOne({
        where: {
          cnic,
          is_deleted: false,
        },
      });

      if (existingCnic) {
        return res.status(400).json({
          success: false,
          message: "Counsellor with this CNIC already exists",
        });
      }
    }

    // Check duplicate phone
    const existingPhone = await Counsellor.findOne({
      where: {
        phone,
        is_deleted: false,
      },
    });

    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: "Counsellor with this phone number already exists",
      });
    }

    // Check duplicate email in users
    const existingUser = await User.findOne({
      where: {
        email,
        is_deleted: false,
      },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Create user (INACTIVE initially)
    const user = await User.create({
      name,
      email,
      role: "counsellor",
      is_active: false, // ✅ Set to false until password is set
    });

    // Create counsellor profile
    const counsellor = await Counsellor.create({
      user_id: user.id,
      name,
      father_name,
      email,
      phone,
      cnic,
      address,
      role: role || "counsellor",
      status: status || "active",
    });

    // ✅ Generate JWT token for password setup (matches your auth.controller.js)
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        role: 'counsellor',
        purpose: 'setup' 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const setupLink = `${process.env.FRONTEND_URL}/counsellor/setup-password?token=${token}`;

    // ✅ Send email
    await sendCounsellorPasswordSetupEmail({
      name,
      email,
      setupLink,
    });

    if (req.user) {
      await logActivity({
        leadId: null,
        actionType: "counsellor_created",
        toValue: email,
        note: `New counsellor "${name}" (${email}) created. Setup email sent.`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Counsellor created successfully. Setup email sent.",
      data: counsellor,
    });
  } catch (error) {
    console.error("❌ Create counsellor error:", error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET ALL COUNSELLORS
// ──────────────────────────────────────────────────────────────────────────────
export async function getAllCounsellors(req, res) {
  try {
    const [counsellors] = await rawDb.query(`
      SELECT 
        c.id as counsellor_id,
        c.name,
        c.father_name,
        c.email,
        c.phone,
        c.cnic,
        c.address,
        c.role,
        c.status,
        c.profile_image,
        u.id as user_id,
        u.email as user_email,
        u.is_active
      FROM counsellors c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.is_deleted = 0
      ORDER BY c.name
    `);

    // Check if we got valid data
    if (!counsellors || counsellors.length === 0) {
      return res.json({
        success: true,
        data: {
          counsellors: []
        }
      });
    }

    // Format properly
    const formatted = counsellors
      .filter(c => c && c.counsellor_id)
      .map(c => ({
        counsellor_id: c.counsellor_id,
        name: c.name || 'Unknown',
        father_name: c.father_name || '',
        email: c.email || '',
        phone: c.phone || '',
        cnic: c.cnic || '',
        address: c.address || '',
        role: c.role || 'counsellor',
        status: c.status || 'inactive',
        profile_image: c.profile_image || null,
        user_id: c.user_id,
        user_email: c.user_email,
        is_active: c.is_active || 0
      }));

    res.json({
      success: true,
      data: {
        counsellors: formatted
      }
    });
  } catch (error) {
    console.error("Get counsellors error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch counsellors",
      error: error.message
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET COUNSELLOR BY ID
// ──────────────────────────────────────────────────────────────────────────────
export async function getCounsellorById(req, res) {
  try {
    const { id } = req.params;

    const [counsellor] = await rawDb.query(
      `SELECT 
        c.id as counsellor_id,
        c.name,
        c.father_name,
        c.email,
        c.phone,
        c.cnic,
        c.address,
        c.role,
        c.status,
        c.profile_image,
        u.id as user_id,
        u.email as user_email,
        u.is_active
       FROM counsellors c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.id = ? AND c.is_deleted = 0`,
      [id]
    );

    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: "Counsellor not found"
      });
    }

    res.json({
      success: true,
      data: counsellor
    });
  } catch (error) {
    console.error("Get counsellor error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch counsellor",
      error: error.message
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// UPDATE COUNSELLOR
// ──────────────────────────────────────────────────────────────────────────────
export async function updateCounsellor(req, res) {
  try {
    const counsellor = await Counsellor.findByPk(req.params.id);

    if (!counsellor) {
      return res.status(404).json({
        success: false,
        message: "Counsellor not found"
      });
    }

    if (req.body.email && !emailRegex.test(req.body.email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Duplicate email validation
    if (req.body.email) {
      const existingCounsellor = await Counsellor.findOne({
        where: {
          email: req.body.email,
          is_deleted: false,
        },
      });

      if (existingCounsellor && existingCounsellor.id !== counsellor.id) {
        return res.status(400).json({
          success: false,
          message: "Counsellor with this email already exists",
        });
      }
    }

    // Duplicate phone validation
    if (req.body.phone) {
      const existingPhone = await Counsellor.findOne({
        where: {
          phone: req.body.phone,
          is_deleted: false,
        },
      });

      if (existingPhone && existingPhone.id !== counsellor.id) {
        return res.status(400).json({
          success: false,
          message: "Counsellor with this phone number already exists",
        });
      }
    }

    // Duplicate CNIC validation
    if (req.body.cnic) {
      const existingCnic = await Counsellor.findOne({
        where: {
          cnic: req.body.cnic,
          is_deleted: false,
        },
      });

      if (existingCnic && existingCnic.id !== counsellor.id) {
        return res.status(400).json({
          success: false,
          message: "Counsellor with this CNIC already exists",
        });
      }
    }

    const oldEmail = counsellor.email;

    const fields = ["name", "father_name", "email", "phone", "cnic", "address", "status", "role"];
    const changes = [];

    fields.forEach((field) => {
      if (
        req.body[field] !== undefined &&
        String(req.body[field]) !== String(counsellor[field])
      ) {
        changes.push(`${field}: "${counsellor[field]}" → "${req.body[field]}"`);
      }
    });

    // Update counsellor
    await Counsellor.update(req.body, { where: { id: counsellor.id } });

    // Update associated user
    const updateUserData = {
      name: req.body.name || counsellor.name,
      email: req.body.email || counsellor.email,
    };
    
    // Only update is_active if status is explicitly provided
    if (req.body.status !== undefined) {
      updateUserData.is_active = req.body.status === "active";
    }

    await User.update(updateUserData, {
      where: {
        email: oldEmail,
      },
    });

    if (req.user) {
      await logActivity({
        leadId: null,
        actionType: "counsellor_updated",
        note:
          changes.length > 0
            ? `Counsellor "${counsellor.name}" updated — ${changes.join(" · ")}`
            : `Counsellor "${counsellor.name}" updated`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    const updatedCounsellor = await Counsellor.findByPk(counsellor.id);
    
    // Get updated user data
    const [userData] = await rawDb.query(
      'SELECT id, name, email, is_active FROM users WHERE id = ?',
      [updatedCounsellor.user_id]
    );

    res.json({
      success: true,
      message: "Counsellor updated successfully",
      data: {
        ...updatedCounsellor,
        user: userData || null
      }
    });
  } catch (error) {
    console.error("Update counsellor error:", error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// DELETE COUNSELLOR (Soft Delete)
// ──────────────────────────────────────────────────────────────────────────────
export async function deleteCounsellor(req, res) {
  try {
    const counsellor = await Counsellor.findByPk(req.params.id);
    if (!counsellor) {
      return res.status(404).json({ 
        success: false,
        message: "Counsellor not found" 
      });
    }

    await Counsellor.update(
      {
        is_deleted: true,
        status: "inactive",
      },
      { where: { id: counsellor.id } }
    );

    try {
      const user = await User.findOne({
        where: {
          email: counsellor.email,
          role: "counsellor",
        },
      });

      if (user) {
        await User.update(
          {
            is_active: false,
            is_deleted: true,
          },
          { where: { id: user.id } }
        );
      }
    } catch (userError) {
      console.warn("Could not update associated user:", userError.message);
    }

    await Lead.update(
      { counsellor_id: null },
      { where: { counsellor_id: counsellor.id } }
    );

    if (req.user) {
      await logActivity({
        leadId: null,
        actionType: "counsellor_deleted",
        note: `Counsellor "${counsellor.name}" soft deleted`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    res.json({
      success: true,
      message: "Counsellor deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteCounsellor:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete counsellor",
      error: error.message,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET COUNSELLOR STATS
// ──────────────────────────────────────────────────────────────────────────────
export async function getCounsellorStats(req, res) {
  try {
    const [totalResult] = await rawDb.query(`
      SELECT COUNT(*) as total 
      FROM counsellors c
      WHERE c.is_deleted = 0
    `);

    const [activeResult] = await rawDb.query(`
      SELECT COUNT(*) as active 
      FROM counsellors c
      WHERE c.status = 'active' AND c.is_deleted = 0
    `);

    const [leadsResult] = await rawDb.query(`
      SELECT COUNT(*) as totalLeads 
      FROM leads l
      WHERE l.is_deleted = 0
    `);

    res.json({
      success: true,
      data: {
        total: totalResult?.total || 0,
        active: activeResult?.active || 0,
        totalLeads: leadsResult?.totalLeads || 0,
      },
    });
  } catch (error) {
    console.error("Get counsellor stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch stats",
      error: error.message,
    });
  }
}