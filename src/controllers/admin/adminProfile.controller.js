import db from "../../models/mysql/index.js";

export const getAdminProfile = async (req, res) => {
  try {
    const userId = req.db.User.id;

    const admin = await db.User.findOne({
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
        "profile_image",
      ],
    });

    if (!admin) {
      return res.status(404).json({ message: "Admin profile not found" });
    }

    if (admin.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Not an admin." });
    }
    const response = admin.toJSON();

    if (response.profile_image) {
      response.profilePictureUrl = `${req.protocol}://${req.get("host")}/${response.profile_image}`;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching admin profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateAdminProfile = async (req, res) => {
  try {
    const userId = req.db.User.id;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    const admin = await db.User.findOne({
      where: { id: userId, is_deleted: false, role: "admin" },
    });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    admin.name = name.trim();
    await admin.save();

    res.status(200).json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      is_active: admin.is_active,
      profile_image: admin.profile_image,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    });
  } catch (error) {
    console.error("Error updating admin profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const uploadAdminProfileImage = async (req, res) => {
  try {
    const userId = req.db.User.id;

    if (!req.file) {
      return res.status(400).json({
        message: "No image file provided",
      });
    }

    const relativePath = `uploads/${req.file.filename}`;

    const admin = await db.User.findOne({
      where: {
        id: userId,
        is_deleted: false,
        role: "admin",
      },
    });

    if (!admin) {
      return res.status(404).json({
        message: "Admin profile not found",
      });
    }

    await admin.update({
      profile_image: relativePath,
    });

    const fullUrl = `${req.protocol}://${req.get("host")}/${relativePath}`;

    return res.status(200).json({
      message: "Profile image uploaded successfully",
      profilePictureUrl: fullUrl,
      profilePicturePath: relativePath,
    });
  } catch (error) {
    console.error("Upload admin profile image error:", error);

    return res.status(500).json({
      message: "Failed to upload profile image",
    });
  }
};
