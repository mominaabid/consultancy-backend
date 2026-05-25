import bcrypt from "bcryptjs";
import crypto from "crypto";
import db from "../models/mysql/index.js";
import { logActivity } from "../services/activityLog.service.js";
import { sendCounsellorPasswordSetupEmail } from "../services/counsellorEmail.service.js";

const { Counsellor, User, Lead, PasswordResetToken } = db;

export async function createCounsellor(req, res) {
  try {
    const { name, father_name, email, phone, cnic, address, role, status } =
      req.body;

    // ✅ Check duplicate email
    const existingCounsellor = await Counsellor.findOne({
      where: {
        email,
        is_deleted: false,
      },
    });

    if (existingCounsellor) {
      return res.status(400).json({
        message: "Counsellor with this email already exists",
      });
    }

    // ✅ Check duplicate phone
    const existingPhone = await Counsellor.findOne({
      where: {
        phone,
        is_deleted: false,
      },
    });

    if (existingPhone) {
      return res.status(400).json({
        message: "Counsellor with this phone number already exists",
      });
    }

    // ✅ Check duplicate CNIC
    const existingCnic = await Counsellor.findOne({
      where: {
        cnic,
        is_deleted: false,
      },
    });

    if (existingCnic) {
      return res.status(400).json({
        message: "Counsellor with this CNIC already exists",
      });
    }

    const existingUser = await User.findOne({
      where: {
        email,
        is_deleted: false,
      },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User with this email already exists",
      });
    }

    const user = await User.create({
      name,
      email,
      role: "counsellor",
      is_active: false,
    });

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

    const token = crypto.randomBytes(32).toString("hex");
    const expires_at = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await PasswordResetToken.create({
      user_id: user.id,
      token,
      expires_at,
    });

    const setupLink = `${process.env.FRONTEND_URL}/counsellor/setup-password?token=${token}`;

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
        note: `New counsellor "${name}" (${email}) created`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    return res.status(201).json({
      message: "Counsellor created successfully. Setup email sent.",
      data: counsellor,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function getAllCounsellors(req, res) {
  const counsellors = await Counsellor.findAll({
    where: { is_deleted: false, status: "active" },
    attributes: {
      include: [
        [
          db.sequelize.literal(`(
            SELECT COUNT(*) FROM leads 
            WHERE leads.counsellor_id = Counsellor.user_id
          )`),
          "assigned_leads",
        ],
      ],
    },
    include: [{ model: User, as: "user", attributes: ["id"] }],
  });
  res.json(counsellors);
}

export async function updateCounsellor(req, res) {
  try {
    const counsellor = await Counsellor.findByPk(req.params.id);

    if (!counsellor) {
      return res.status(404).json({
        message: "Counsellor not found",
      });
    }

    // ✅ Duplicate email validation
    // ✅ Duplicate email validation
    if (req.body.email) {
      const existingCounsellor = await Counsellor.findOne({
        where: {
          email: req.body.email,
          is_deleted: false,
        },
      });

      if (existingCounsellor && existingCounsellor.id !== counsellor.id) {
        return res.status(400).json({
          message: "Counsellor with this email already exists",
        });
      }
    }

    // ✅ Duplicate phone validation
    if (req.body.phone) {
      const existingPhone = await Counsellor.findOne({
        where: {
          phone: req.body.phone,
          is_deleted: false,
        },
      });

      if (existingPhone && existingPhone.id !== counsellor.id) {
        return res.status(400).json({
          message: "Counsellor with this phone number already exists",
        });
      }
    }

    // ✅ Duplicate CNIC validation
    if (req.body.cnic) {
      const existingCnic = await Counsellor.findOne({
        where: {
          cnic: req.body.cnic,
          is_deleted: false,
        },
      });

      if (existingCnic && existingCnic.id !== counsellor.id) {
        return res.status(400).json({
          message: "Counsellor with this CNIC already exists",
        });
      }
    }

    const oldEmail = counsellor.email;

    const fields = ["name", "email", "phone", "cnic", "address", "status"];
    const changes = [];

    fields.forEach((field) => {
      if (
        req.body[field] !== undefined &&
        String(req.body[field]) !== String(counsellor[field])
      ) {
        changes.push(`${field}: "${counsellor[field]}" → "${req.body[field]}"`);
      }
    });

    await counsellor.update(req.body);

    await User.update(
      {
        name: req.body.name || counsellor.name,
        email: req.body.email || counsellor.email,
        is_active: req.body.status ? req.body.status === "active" : undefined,
      },
      {
        where: {
          email: oldEmail,
        },
      },
    );

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

    res.json({
      message: "Counsellor updated successfully",
      data: counsellor,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function deleteCounsellor(req, res) {
  try {
    const counsellor = await Counsellor.findByPk(req.params.id);
    if (!counsellor) {
      return res.status(404).json({ message: "Counsellor not found" });
    }

    await counsellor.update({
      is_deleted: true,
      status: "inactive",
    });

    try {
      const user = await User.findOne({
        where: {
          email: counsellor.email,
          role: "counsellor",
        },
      });

      if (user) {
        await user.update({
          is_active: false,
          is_deleted: true,
        });
      }
    } catch (userError) {
      console.warn("Could not update associated user:", userError.message);
    }

    await Lead.update(
      { counsellor_id: null },
      { where: { counsellor_id: counsellor.id } },
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

    res.json({ message: "Counsellor deleted successfully" });
  } catch (error) {
    console.error("Error in deleteCounsellor:", error);
    res.status(500).json({
      message: "Failed to delete counsellor",
      error: error.message,
    });
  }
}
