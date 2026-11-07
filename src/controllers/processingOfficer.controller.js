// src/controllers/processingOfficer.controller.js
import bcrypt from "bcryptjs";
import db from "../models/mysql/index.js";
import rawDb from "../config/db.js";
import { logActivity } from "../services/activityLog.service.js";
import { sendProcessingOfficerPasswordSetupEmail } from "../services/processingOfficerEmail.service.js";
import jwt from "jsonwebtoken";

const { ProcessingOfficer, User } = db;

const emailRegex = /^[a-zA-Z][a-zA-Z0-9._%+-]*@[a-zA-Z.-]+\.[a-zA-Z]{2,}$/;

// ──────────────────────────────────────────────────────────────────────────────
// CREATE PROCESSING OFFICER
// ──────────────────────────────────────────────────────────────────────────────
export async function createProcessingOfficer(req, res) {
  try {
    const { name, father_name, email, phone, cnic, address, status } =
      req.body;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    if (cnic) {
      const existingCnic = await ProcessingOfficer.findOne({
        where: { cnic, is_deleted: false },
      });
      if (existingCnic) {
        return res.status(400).json({
          success: false,
          message: "Processing officer with this CNIC already exists",
        });
      }
    }

    if (phone) {
      const existingPhone = await ProcessingOfficer.findOne({
        where: { phone, is_deleted: false },
      });
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: "Processing officer with this phone number already exists",
        });
      }
    }

    const existingUser = await User.findOne({
      where: { email, is_deleted: false },
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    const user = await User.create({
      name,
      email,
      role: "processing_officer",
      is_active: false,
    });

    const officer = await ProcessingOfficer.create({
      user_id: user.id,
      name,
      father_name,
      email,
      phone,
      cnic,
      address,
      role: "processing_officer",
      status: status || "active",
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: "processing_officer", purpose: "setup" },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    const setupLink = `${process.env.FRONTEND_URL}/processingOfficer/setup-password?token=${token}`;

    await sendProcessingOfficerPasswordSetupEmail({ name, email, setupLink });

    if (req.user) {
      await logActivity({
        leadId: null,
        actionType: "processing_officer_created",
        toValue: email,
        note: `New processing officer "${name}" (${email}) created. Setup email sent.`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Processing officer created successfully. Setup email sent.",
      data: officer,
    });
  } catch (error) {
    console.error("❌ Create processing officer error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET ALL PROCESSING OFFICERS
// ──────────────────────────────────────────────────────────────────────────────
export async function getAllProcessingOfficers(req, res) {
  try {
    const [officers] = await rawDb.query(`
      SELECT
        p.id as officer_id,
        p.name,
        p.father_name,
        p.email,
        p.phone,
        p.cnic,
        p.address,
        p.role,
        p.status,
        p.profile_image,
        u.id as user_id,
        u.email as user_email,
        u.is_active
      FROM processing_officers p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.is_deleted = 0
      ORDER BY p.name
    `);

    if (!officers || officers.length === 0) {
      return res.json({ success: true, data: { officers: [] } });
    }

    const formatted = officers
      .filter((o) => o && o.officer_id)
      .map((o) => ({
        officer_id: o.officer_id,
        name: o.name || "Unknown",
        father_name: o.father_name || "",
        email: o.email || "",
        phone: o.phone || "",
        cnic: o.cnic || "",
        address: o.address || "",
        role: o.role || "processing_officer",
        status: o.status || "inactive",
        profile_image: o.profile_image || null,
        user_id: o.user_id,
        user_email: o.user_email,
        is_active: o.is_active || 0,
      }));

    res.json({ success: true, data: { officers: formatted } });
  } catch (error) {
    console.error("Get processing officers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch processing officers",
      error: error.message,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET PROCESSING OFFICER BY ID
// ──────────────────────────────────────────────────────────────────────────────
export async function getProcessingOfficerById(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await rawDb.query(
      `SELECT
        p.id as officer_id,
        p.name,
        p.father_name,
        p.email,
        p.phone,
        p.cnic,
        p.address,
        p.role,
        p.status,
        p.profile_image,
        u.id as user_id,
        u.email as user_email,
        u.is_active
       FROM processing_officers p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = ? AND p.is_deleted = 0`,
      [id],
    );
    const officer = rows?.[0];

    if (!officer) {
      return res.status(404).json({
        success: false,
        message: "Processing officer not found",
      });
    }

    res.json({ success: true, data: officer });
  } catch (error) {
    console.error("Get processing officer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch processing officer",
      error: error.message,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// UPDATE PROCESSING OFFICER
// ──────────────────────────────────────────────────────────────────────────────
export async function updateProcessingOfficer(req, res) {
  try {
    const officer = await ProcessingOfficer.findByPk(req.params.id);

    if (!officer) {
      return res.status(404).json({
        success: false,
        message: "Processing officer not found",
      });
    }

    if (req.body.email && !emailRegex.test(req.body.email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    if (req.body.email) {
      const existing = await ProcessingOfficer.findOne({
        where: { email: req.body.email, is_deleted: false },
      });
      if (existing && existing.id !== officer.id) {
        return res.status(400).json({
          success: false,
          message: "Processing officer with this email already exists",
        });
      }
    }

    if (req.body.phone) {
      const existing = await ProcessingOfficer.findOne({
        where: { phone: req.body.phone, is_deleted: false },
      });
      if (existing && existing.id !== officer.id) {
        return res.status(400).json({
          success: false,
          message: "Processing officer with this phone number already exists",
        });
      }
    }

    if (req.body.cnic) {
      const existing = await ProcessingOfficer.findOne({
        where: { cnic: req.body.cnic, is_deleted: false },
      });
      if (existing && existing.id !== officer.id) {
        return res.status(400).json({
          success: false,
          message: "Processing officer with this CNIC already exists",
        });
      }
    }

    const oldEmail = officer.email;

    const fields = ["name", "father_name", "email", "phone", "cnic", "address", "status"];
    const changes = [];

    fields.forEach((field) => {
      if (
        req.body[field] !== undefined &&
        String(req.body[field]) !== String(officer[field])
      ) {
        changes.push(`${field}: "${officer[field]}" → "${req.body[field]}"`);
      }
    });

    await ProcessingOfficer.update(req.body, { where: { id: officer.id } });

    const updateUserData = {
      name: req.body.name || officer.name,
      email: req.body.email || officer.email,
    };
    if (req.body.status !== undefined) {
      updateUserData.is_active = req.body.status === "active";
    }

    await User.update(updateUserData, { where: { email: oldEmail } });

    if (req.user) {
      await logActivity({
        leadId: null,
        actionType: "processing_officer_updated",
        note:
          changes.length > 0
            ? `Processing officer "${officer.name}" updated — ${changes.join(" · ")}`
            : `Processing officer "${officer.name}" updated`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    const updatedOfficer = await ProcessingOfficer.findByPk(officer.id);
    const [userData] = await rawDb.query(
      "SELECT id, name, email, is_active FROM users WHERE id = ?",
      [updatedOfficer.user_id],
    );

    res.json({
      success: true,
      message: "Processing officer updated successfully",
      data: { ...updatedOfficer, user: userData || null },
    });
  } catch (error) {
    console.error("Update processing officer error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// DELETE PROCESSING OFFICER (Soft Delete)
// ──────────────────────────────────────────────────────────────────────────────
export async function deleteProcessingOfficer(req, res) {
  try {
    const officer = await ProcessingOfficer.findByPk(req.params.id);
    if (!officer) {
      return res.status(404).json({
        success: false,
        message: "Processing officer not found",
      });
    }

    await ProcessingOfficer.update(
      { is_deleted: true, status: "inactive" },
      { where: { id: officer.id } },
    );

    try {
      const user = await User.findOne({
        where: { email: officer.email, role: "processing_officer" },
      });
      if (user) {
        await User.update(
          { is_active: false, is_deleted: true },
          { where: { id: user.id } },
        );
      }
    } catch {
      // koi linked user record nahi mila - deactivate karne ko kuch nahi
    }

    // Unassign from any leads/applications this officer owned.
    await rawDb.query(
      "UPDATE leads SET assigned_processing_officer_id = NULL WHERE assigned_processing_officer_id = ?",
      [officer.id],
    );
    await rawDb.query(
      "UPDATE applications SET processing_officer_id = NULL WHERE processing_officer_id = ?",
      [officer.id],
    );

    if (req.user) {
      await logActivity({
        leadId: null,
        actionType: "processing_officer_deleted",
        note: `Processing officer "${officer.name}" soft deleted`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    res.json({ success: true, message: "Processing officer deleted successfully" });
  } catch (error) {
    console.error("Error in deleteProcessingOfficer:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete processing officer",
      error: error.message,
    });
  }
}
