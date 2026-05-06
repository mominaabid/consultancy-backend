import User from "../../models/mysql/User.js";
import bcrypt from "bcryptjs";

export const getAdminProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const admin = await User.findOne({
      where: {
        id: userId,
        is_deleted: false,
      },
      attributes: [
        "id",
        "name",
        "email",
        "role",
        "is_active",
        "createdAt",
        "updatedAt",
      ],
    });

    if (!admin) {
      return res.status(404).json({ message: "Admin profile not found" });
    }

    if (admin.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Not an admin." });
    }

    res.status(200).json(admin.toJSON());
  } catch (error) {
    console.error("Error fetching admin profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateAdminProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    const admin = await User.findOne({
      where: { id: userId, is_deleted: false, role: "admin" },
    });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    if (email !== admin.email) {
      const existingUser = await User.findOne({
        where: { email, is_deleted: false },
      });
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    admin.name = name;
    admin.email = email;
    await admin.save();

    res.status(200).json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      is_active: admin.is_active,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    });
  } catch (error) {
    console.error("Error updating admin profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const changeAdminPassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters",
      });
    }

    const admin = await User.findOne({
      where: { id: userId, is_deleted: false, role: "admin" },
    });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, admin.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        message: "Current password is incorrect",
      });
    }

    const salt = await bcrypt.genSalt(10);

    admin.password_hash = await bcrypt.hash(newPassword, salt);

    await admin.save();

    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing admin password:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
