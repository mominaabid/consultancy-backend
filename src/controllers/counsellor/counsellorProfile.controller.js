// src/controllers/counsellor/counsellorProfile.controller.js
import rawDb from "../../config/db.js";

// Helper to normalize CNIC (remove dashes)
const normalizeCNIC = (cnic) => cnic?.replace(/-/g, "") || null;

export const uploadProfileImage = async (req, res) => {
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
        message: "No image file provided"
      });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Invalid file type. Only JPEG, PNG, GIF, and WEBP are allowed.",
      });
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 5MB.",
      });
    }

    const relativePath = `uploads/${req.file.filename}`;

    // Check if counsellor exists
    const [counsellors] = await rawDb.query(
      `SELECT id FROM counsellors 
       WHERE user_id = ? AND is_deleted = 0`,
      [userId]
    );

    if (!counsellors || counsellors.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Counsellor profile not found"
      });
    }

    // Update profile image in counsellors table
    await rawDb.query(
      `UPDATE counsellors 
       SET profile_image = ?, updated_at = NOW() 
       WHERE user_id = ? AND is_deleted = 0`,
      [relativePath, userId]
    );

    // Also update profile_image in users table
    await rawDb.query(
      `UPDATE users 
       SET profile_image = ?, updated_at = NOW() 
       WHERE id = ? AND is_deleted = 0`,
      [relativePath, userId]
    );

    const fullUrl = `${req.protocol}://${req.get("host")}/${relativePath}`;

    return res.status(200).json({
      success: true,
      message: "Profile image uploaded successfully",
      data: {
        profilePictureUrl: fullUrl,
        profilePicturePath: relativePath,
      },
    });
  } catch (error) {
    console.error("Upload profile image error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload profile image"
    });
  }
};

export const getCounsellorProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    // Get counsellor with user details
    const [counsellors] = await rawDb.query(
      `SELECT 
        c.id,
        c.name,
        c.father_name,
        c.email,
        c.phone,
        c.cnic,
        c.address,
        c.role,
        c.status,
        c.profile_image,
        c.is_deleted,
        c.created_at,
        c.updated_at,
        u.is_active as user_is_active
      FROM counsellors c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.user_id = ? AND c.is_deleted = 0`,
      [userId]
    );

    if (!counsellors || counsellors.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Counsellor profile not found"
      });
    }

    const counsellor = counsellors[0];

    // Build response
    const response = {
      id: counsellor.id,
      name: counsellor.name,
      father_name: counsellor.father_name,
      email: counsellor.email,
      phone: counsellor.phone,
      cnic: counsellor.cnic,
      address: counsellor.address,
      role: counsellor.role || "counsellor",
      status: counsellor.status,
      is_active: counsellor.user_is_active === 1,
      profile_image: counsellor.profile_image,
      created_at: counsellor.created_at,
      updated_at: counsellor.updated_at,
    };

    if (counsellor.profile_image) {
      response.profilePictureUrl = `${req.protocol}://${req.get("host")}/${counsellor.profile_image}`;
    }

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("GET counsellor profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error, please try again later"
    });
  }
};

export const updateCounsellorProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    const { name, father_name, phone, cnic, address } = req.body;
    const normalizedCNIC = cnic ? normalizeCNIC(cnic) : null;

    // Check if counsellor exists
    const [counsellors] = await rawDb.query(
      `SELECT id, phone, cnic, name FROM counsellors 
       WHERE user_id = ? AND is_deleted = 0`,
      [userId]
    );

    if (!counsellors || counsellors.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Counsellor profile not found"
      });
    }

    const counsellor = counsellors[0];

    // Check phone uniqueness
    if (phone && phone !== counsellor.phone) {
      const [existingPhone] = await rawDb.query(
        `SELECT id FROM counsellors 
         WHERE phone = ? AND user_id != ? AND is_deleted = 0`,
        [phone, userId]
      );
      if (existingPhone && existingPhone.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Phone number already registered"
        });
      }
    }

    // Check CNIC uniqueness
    if (normalizedCNIC && normalizedCNIC !== counsellor.cnic) {
      const [existingCNIC] = await rawDb.query(
        `SELECT id FROM counsellors 
         WHERE cnic = ? AND user_id != ? AND is_deleted = 0`,
        [normalizedCNIC, userId]
      );
      if (existingCNIC && existingCNIC.length > 0) {
        return res.status(409).json({
          success: false,
          message: "CNIC already registered"
        });
      }
    }

    // Build update query parts
    const updates = [];
    const params = [];

    if (name !== undefined && name !== counsellor.name) {
      updates.push("name = ?");
      params.push(name);
    }

    if (father_name !== undefined) {
      updates.push("father_name = ?");
      params.push(father_name);
    }

    if (phone !== undefined && phone !== counsellor.phone) {
      updates.push("phone = ?");
      params.push(phone);
    }

    if (normalizedCNIC !== undefined && normalizedCNIC !== counsellor.cnic) {
      updates.push("cnic = ?");
      params.push(normalizedCNIC);
    }

    if (address !== undefined) {
      updates.push("address = ?");
      params.push(address);
    }

    // Update counsellor table
    if (updates.length > 0) {
      updates.push("updated_at = NOW()");
      params.push(userId);

      await rawDb.query(
        `UPDATE counsellors 
         SET ${updates.join(", ")} 
         WHERE user_id = ? AND is_deleted = 0`,
        params
      );
    }

    // Update user name if provided
    if (name !== undefined && name !== counsellor.name) {
      await rawDb.query(
        `UPDATE users 
         SET name = ?, updated_at = NOW() 
         WHERE id = ? AND is_deleted = 0`,
        [name, userId]
      );
    }

    // Get updated profile
    const [updatedCounsellors] = await rawDb.query(
      `SELECT 
        c.id,
        c.name,
        c.father_name,
        c.email,
        c.phone,
        c.cnic,
        c.address,
        c.role,
        c.status,
        c.profile_image,
        c.created_at,
        c.updated_at,
        u.is_active as user_is_active
      FROM counsellors c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.user_id = ? AND c.is_deleted = 0`,
      [userId]
    );

    const updatedCounsellor = updatedCounsellors[0];

    const response = {
      id: updatedCounsellor.id,
      name: updatedCounsellor.name,
      father_name: updatedCounsellor.father_name,
      email: updatedCounsellor.email,
      phone: updatedCounsellor.phone,
      cnic: updatedCounsellor.cnic,
      address: updatedCounsellor.address,
      role: updatedCounsellor.role || "counsellor",
      status: updatedCounsellor.status,
      is_active: updatedCounsellor.user_is_active === 1,
      profile_image: updatedCounsellor.profile_image,
      created_at: updatedCounsellor.created_at,
      updated_at: updatedCounsellor.updated_at,
    };

    if (updatedCounsellor.profile_image) {
      response.profilePictureUrl = `${req.protocol}://${req.get("host")}/${updatedCounsellor.profile_image}`;
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: response,
    });
  } catch (error) {
    console.error("UPDATE counsellor profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error, update failed"
    });
  }
};