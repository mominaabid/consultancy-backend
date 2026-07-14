// src/controllers/admin/adminProfile.controller.js
import rawDb from "../../config/db.js";

export const getAdminProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    // ✅ Raw SQL query
    const [admins] = await rawDb.query(
      `SELECT 
        id, 
        name, 
        email, 
        role, 
        is_active, 
        created_at, 
        updated_at, 
        profile_image 
      FROM users 
      WHERE id = ? AND is_deleted = 0`,
      [userId]
    );

    if (!admins || admins.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Admin profile not found"
      });
    }

    const admin = admins[0];

    if (admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Not an admin."
      });
    }

    // ✅ Build response matching frontend expectations
    const response = {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      is_active: admin.is_active === 1,
      profile_image: admin.profile_image,
      createdAt: admin.created_at,  // Frontend expects camelCase
      updatedAt: admin.updated_at,  // Frontend expects camelCase
    };

    // ✅ Add profile picture URL if exists
    if (admin.profile_image) {
      response.profilePictureUrl = `${req.protocol}://${req.get("host")}/${admin.profile_image}`;
    }

    // ✅ Return directly without wrapper (frontend expects data at res.data)
    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching admin profile:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const updateAdminProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required"
      });
    }

    // ✅ Check if admin exists
    const [admins] = await rawDb.query(
      `SELECT id FROM users 
       WHERE id = ? AND is_deleted = 0 AND role = 'admin'`,
      [userId]
    );

    if (!admins || admins.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    // ✅ Update admin
    await rawDb.query(
      `UPDATE users 
       SET name = ?, updated_at = NOW() 
       WHERE id = ? AND is_deleted = 0 AND role = 'admin'`,
      [name.trim(), userId]
    );

    // ✅ Get updated admin data
    const [updatedAdmins] = await rawDb.query(
      `SELECT 
        id, 
        name, 
        email, 
        role, 
        is_active, 
        profile_image, 
        created_at, 
        updated_at 
      FROM users 
      WHERE id = ? AND is_deleted = 0`,
      [userId]
    );

    const updatedAdmin = updatedAdmins[0];

    // ✅ Build response matching frontend expectations
    const response = {
      id: updatedAdmin.id,
      name: updatedAdmin.name,
      email: updatedAdmin.email,
      role: updatedAdmin.role,
      is_active: updatedAdmin.is_active === 1,
      profile_image: updatedAdmin.profile_image,
      createdAt: updatedAdmin.created_at,
      updatedAt: updatedAdmin.updated_at,
    };

    if (updatedAdmin.profile_image) {
      response.profilePictureUrl = `${req.protocol}://${req.get("host")}/${updatedAdmin.profile_image}`;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error("Error updating admin profile:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const uploadAdminProfileImage = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      });
    }

    // ✅ Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Invalid file type. Only JPEG, PNG, GIF, and WEBP are allowed.",
      });
    }

    // ✅ Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 5MB.",
      });
    }

    const relativePath = `uploads/${req.file.filename}`;

    // ✅ Check if admin exists
    const [admins] = await rawDb.query(
      `SELECT id FROM users 
       WHERE id = ? AND is_deleted = 0 AND role = 'admin'`,
      [userId]
    );

    if (!admins || admins.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Admin profile not found",
      });
    }

    // ✅ Update profile image
    await rawDb.query(
      `UPDATE users 
       SET profile_image = ?, updated_at = NOW() 
       WHERE id = ? AND is_deleted = 0 AND role = 'admin'`,
      [relativePath, userId]
    );

    const fullUrl = `${req.protocol}://${req.get("host")}/${relativePath}`;

    // ✅ Return response matching frontend expectations
    return res.status(200).json({
      message: "Profile image uploaded successfully",
      profilePictureUrl: fullUrl,
      profilePicturePath: relativePath,
    });
  } catch (error) {
    console.error("Upload admin profile image error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to upload profile image",
    });
  }
};