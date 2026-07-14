// src/controllers/student/studentProfile.controller.js
import rawDb from "../../config/db.js";

// Helper to ensure student exists
async function ensureStudentExists(userId, user) {
  const [students] = await rawDb.query(
    `SELECT id FROM leads WHERE user_id = ? AND is_deleted = 0`,
    [userId]
  );

  if (students && students.length > 0) {
    return students[0];
  }

  // Auto-create student (lead) record
  await rawDb.query(
    `INSERT INTO leads (
      name, email, phone, preferred_country, 
      status, profile_picture, has_entered_counseling, 
      is_deleted, user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      user.name || 'Student',
      user.email,
      null,
      null,
      'new',
      null,
      0,
      0,
      userId
    ]
  );

  const [newStudent] = await rawDb.query(
    `SELECT id FROM leads WHERE user_id = ? AND is_deleted = 0`,
    [userId]
  );

  return newStudent[0];
}

export const getStudentProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    // Get user details
    const [users] = await rawDb.query(
      `SELECT id, name, email, is_active FROM users WHERE id = ? AND is_deleted = 0`,
      [userId]
    );

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = users[0];

    // Ensure student exists
    await ensureStudentExists(userId, user);

    // Get student profile with counsellor info
    const [students] = await rawDb.query(
      `SELECT 
        l.id,
        l.name,
        l.email,
        l.phone,
        l.dob,
        l.father_name,
        l.father_contact,
        l.home_address,
        l.preferred_country,
        l.status,
        l.profile_picture,
        l.has_entered_counseling,
        l.is_deleted,
        l.created_at,
        l.updated_at,
        l.counsellor_id,
        u.name as counsellor_name,
        u.email as counsellor_email
      FROM leads l
      LEFT JOIN users u ON l.counsellor_id = u.id AND u.is_deleted = 0
      WHERE l.user_id = ? AND l.is_deleted = 0`,
      [userId]
    );

    if (!students || students.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found"
      });
    }

    const student = students[0];

    // Get education records
    const [educations] = await rawDb.query(
      `SELECT 
        le.id,
        le.degree_id,
        cv.name as degree_name,
        le.year_awarded,
        le.grades_cgpa,
        le.board_university
      FROM lead_educations le
      LEFT JOIN config_values cv ON le.degree_id = cv.id
      WHERE le.lead_id = ?`,
      [student.id]
    );

    // Build response
    const response = {
      id: student.id,
      name: student.name,
      email: student.email,
      phone: student.phone,
      dob: student.dob,
      father_name: student.father_name,
      father_contact: student.father_contact,
      home_address: student.home_address,
      preferred_country: student.preferred_country,
      status: student.status,
      profile_picture: student.profile_picture,
      has_entered_counseling: student.has_entered_counseling === 1,
      is_active: user.is_active === 1,
      counsellor_id: student.counsellor_id,
      counsellor: student.counsellor_id ? {
        id: student.counsellor_id,
        name: student.counsellor_name,
        email: student.counsellor_email,
      } : null,
      education: educations || [],
      created_at: student.created_at,
      updated_at: student.updated_at,
    };

    if (student.profile_picture) {
      response.profilePictureUrl = `${req.protocol}://${req.get("host")}/${student.profile_picture}`;
    }

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("GET student profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching profile"
    });
  }
};

export const updateStudentProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    // Get only the fields that are sent
    const { 
      name, 
      email, 
      phone, 
      preferred_country, 
      dob,
      father_name,
      father_contact,
      home_address,
      status 
    } = req.body;

    // Get user
    const [users] = await rawDb.query(
      `SELECT id, name, email FROM users WHERE id = ? AND is_deleted = 0`,
      [userId]
    );

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = users[0];

    // Ensure student exists
    await ensureStudentExists(userId, user);

    // Get current student data
    const [students] = await rawDb.query(
      `SELECT id, name, email, phone FROM leads 
       WHERE user_id = ? AND is_deleted = 0`,
      [userId]
    );

    const student = students[0];

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (name !== undefined && name !== student.name) {
      updates.push("name = ?");
      params.push(name);
      // Also update users table name
      await rawDb.query(
        `UPDATE users SET name = ?, updated_at = NOW() WHERE id = ? AND is_deleted = 0`,
        [name, userId]
      );
    }

    if (email !== undefined && email !== student.email) {
      // Check if email already exists
      const [existingEmail] = await rawDb.query(
        `SELECT id FROM leads WHERE email = ? AND user_id != ? AND is_deleted = 0`,
        [email, userId]
      );
      if (existingEmail && existingEmail.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Email already registered by another user"
        });
      }
      updates.push("email = ?");
      params.push(email);
    }

    if (phone !== undefined && phone !== student.phone) {
      // Check if phone already exists
      const [existingPhone] = await rawDb.query(
        `SELECT id FROM leads WHERE phone = ? AND user_id != ? AND is_deleted = 0`,
        [phone, userId]
      );
      if (existingPhone && existingPhone.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Phone number already registered"
        });
      }
      updates.push("phone = ?");
      params.push(phone);
    }

    if (preferred_country !== undefined) {
      updates.push("preferred_country = ?");
      params.push(preferred_country);
    }

    if (dob !== undefined) {
      updates.push("dob = ?");
      params.push(dob);
    }

    if (father_name !== undefined) {
      updates.push("father_name = ?");
      params.push(father_name);
    }

    if (father_contact !== undefined) {
      updates.push("father_contact = ?");
      params.push(father_contact);
    }

    if (home_address !== undefined) {
      updates.push("home_address = ?");
      params.push(home_address);
    }

    if (status !== undefined) {
      updates.push("status = ?");
      params.push(status);
    }

    // Only update if there are changes
    if (updates.length > 0) {
      updates.push("updated_at = NOW()");
      params.push(userId);

      await rawDb.query(
        `UPDATE leads 
         SET ${updates.join(", ")} 
         WHERE user_id = ? AND is_deleted = 0`,
        params
      );
    }

    // Get updated profile
    const [updatedStudents] = await rawDb.query(
      `SELECT 
        l.id,
        l.name,
        l.email,
        l.phone,
        l.dob,
        l.father_name,
        l.father_contact,
        l.home_address,
        l.preferred_country,
        l.status,
        l.profile_picture,
        l.has_entered_counseling,
        l.is_deleted,
        l.created_at,
        l.updated_at,
        l.counsellor_id,
        u.name as counsellor_name,
        u.email as counsellor_email
      FROM leads l
      LEFT JOIN users u ON l.counsellor_id = u.id AND u.is_deleted = 0
      WHERE l.user_id = ? AND l.is_deleted = 0`,
      [userId]
    );

    const updatedStudent = updatedStudents[0];

    // Get education records
    const [educations] = await rawDb.query(
      `SELECT 
        le.id,
        le.degree_id,
        cv.name as degree_name,
        le.year_awarded,
        le.grades_cgpa,
        le.board_university
      FROM lead_educations le
      LEFT JOIN config_values cv ON le.degree_id = cv.id
      WHERE le.lead_id = ?`,
      [updatedStudent.id]
    );

    const response = {
      id: updatedStudent.id,
      name: updatedStudent.name,
      email: updatedStudent.email,
      phone: updatedStudent.phone,
      dob: updatedStudent.dob,
      father_name: updatedStudent.father_name,
      father_contact: updatedStudent.father_contact,
      home_address: updatedStudent.home_address,
      preferred_country: updatedStudent.preferred_country,
      status: updatedStudent.status,
      profile_picture: updatedStudent.profile_picture,
      has_entered_counseling: updatedStudent.has_entered_counseling === 1,
      is_active: users[0].is_active === 1,
      counsellor_id: updatedStudent.counsellor_id,
      counsellor: updatedStudent.counsellor_id ? {
        id: updatedStudent.counsellor_id,
        name: updatedStudent.counsellor_name,
        email: updatedStudent.counsellor_email,
      } : null,
      education: educations || [],
      created_at: updatedStudent.created_at,
      updated_at: updatedStudent.updated_at,
    };

    if (updatedStudent.profile_picture) {
      response.profilePictureUrl = `${req.protocol}://${req.get("host")}/${updatedStudent.profile_picture}`;
    }

    res.status(200).json({
      success: true,
      message: updates.length > 0 ? "Profile updated successfully" : "No changes made",
      data: response,
    });
  } catch (error) {
    console.error("Update student profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update profile"
    });
  }
};

export const uploadProfilePicture = async (req, res) => {
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

    // Get user
    const [users] = await rawDb.query(
      `SELECT id, name, email FROM users WHERE id = ? AND is_deleted = 0`,
      [userId]
    );

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Ensure student exists
    await ensureStudentExists(userId, users[0]);

    // Update profile picture in leads table
    await rawDb.query(
      `UPDATE leads 
       SET profile_picture = ?, updated_at = NOW() 
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
      message: "Profile picture uploaded successfully",
      data: {
        profilePictureUrl: fullUrl,
        profilePicturePath: relativePath,
      },
    });
  } catch (error) {
    console.error("Upload profile picture error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload profile picture"
    });
  }
};