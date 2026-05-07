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

    // const existingUser = await User.findOne({
    //   where: {
    //     email,
    //     is_deleted: false,
    //   },
    // });

    // const existingCounsellor = await Counsellor.findOne({
    //   where: {
    //     email,
    //     is_deleted: false,
    //   },
    // });

    // if (existingUser || existingCounsellor) {
    //   return res.status(409).json({
    //     message: "This email is already registered.",
    //   });
    // }

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

    // 5. Log activity
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

// export async function getAllCounsellors(req, res) {
//   try {
//     // const counsellors = await Counsellor.findAll({
//     //   where: { is_deleted: false },
//     //   order: [["id", "DESC"]],
//     // });

//     const counsellors = await Counsellor.findAll({
//       where: { is_deleted: false, status: "active" },
//       include: [{ model: User, as: "user", attributes: ["id"] }], // assuming you add association
//     });
//     res.json(counsellors);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: error.message });
//   }
// }

// const counsellors = await Counsellor.findAll({
//   where: { is_deleted: false, status: "active" },
//   attributes: {
//     include: [
//       [
//         db.sequelize.literal(`(
//         SELECT COUNT(*) FROM leads
//         WHERE leads.counsellor_id = Counsellor.user_id
//       )`),
//         "assigned_leads",
//       ],
//     ],
//   },
// });

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
    if (!counsellor)
      return res.status(404).json({ message: "Counsellor not found" });

    const fields = ["name", "email", "phone", "address", "status"];
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
        is_active: req.body.status ? req.body.status === "active" : undefined,
      },
      { where: { email: counsellor.email } },
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

    res.json({ message: "Counsellor updated successfully", data: counsellor });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// export async function deleteCounsellor(req, res) {
//   try {
//     const counsellor = await Counsellor.findByPk(req.params.id);
//     if (!counsellor)
//       return res.status(404).json({ message: "Counsellor not found" });

//     await counsellor.update({ is_deleted: true, status: "inactive" });

//     await User.update(
//       { is_active: false, is_deleted: true },
//       {
//         where: {
//           email: counsellor.email,
//           role: "counsellor",
//           is_deleted: false,
//         },
//       },
//     );

//     await Lead.update(
//       { counsellor_id: null },
//       { where: { counsellor_id: counsellor.id } },
//     );

//     if (req.user) {
//       await logActivity({
//         leadId: null,
//         actionType: "counsellor_deleted",
//         note: `Counsellor "${counsellor.name}" soft deleted`,
//         performedBy: req.user.id,
//         performedByRole: req.user.role,
//         performedByName: req.user.name,
//       });
//     }

//     res.json({ message: "Counsellor deleted successfully" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: error.message });
//   }
// }

export async function deleteCounsellor(req, res) {
  try {
    const counsellor = await Counsellor.findByPk(req.params.id);
    if (!counsellor) {
      return res.status(404).json({ message: "Counsellor not found" });
    }

    // Soft delete the counsellor
    await counsellor.update({
      is_deleted: true,
      status: "inactive",
    });

    // Try to update the associated user, but don't fail if user doesn't exist
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
      // Continue with deletion even if user update fails
    }

    // Unassign leads from this counsellor (optional, based on your needs)
    await Lead.update(
      { counsellor_id: null },
      { where: { counsellor_id: counsellor.id } },
    );

    // Log activity if user is authenticated
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
