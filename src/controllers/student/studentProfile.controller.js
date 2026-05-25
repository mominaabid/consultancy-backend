import Lead from "../../models/mysql/Lead.js";
import User from "../../models/mysql/User.js";
import LeadEducation from "../../models/mysql/LeadEducation.js";

export const uploadProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const relativePath = `uploads/${req.file.filename}`;

    // const student = await Lead.findOne({
    //   where: { user_id: userId, is_deleted: false },
    // });

    const student = await Lead.findOne({
      where: { user_id: userId, is_deleted: false },
      include: [
        {
          model: User,
          as: "counsellor",
          attributes: ["id", "name", "email"],
        },
        {
          model: LeadEducation, // ✅ Add this
          as: "education", // ✅ Must match alias defined in your model association
          attributes: [
            "id",
            "degree",
            "year_awarded",
            "grades_cgpa",
            "board_university",
          ],
        },
      ],
    });

    if (!student) {
      return res.status(404).json({ message: "Student profile not found" });
    }

    await student.update({ profile_picture: relativePath });

    const fullUrl = `${req.protocol}://${req.get("host")}/${relativePath}`;
    return res.status(200).json({
      message: "Profile picture uploaded successfully",
      profilePictureUrl: fullUrl,
      profilePicturePath: relativePath,
    });
  } catch (error) {
    console.error("Upload profile picture error:", error);
    return res
      .status(500)
      .json({ message: "Failed to upload profile picture" });
  }
};

export const getStudentProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const student = await Lead.findOne({
      where: { user_id: userId, is_deleted: false },
      include: [
        {
          model: User,
          as: "counsellor",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    if (!student) {
      return res.status(404).json({ message: "Student profile not found" });
    }

    const profile = student.toJSON();
    if (profile.profile_picture) {
      profile.profilePictureUrl = `${req.protocol}://${req.get("host")}/${profile.profile_picture}`;
    }

    return res.status(200).json(profile);
  } catch (error) {
    console.error("GET STUDENT PROFILE ERROR:", error);
    return res
      .status(500)
      .json({ message: "Server error while fetching profile" });
  }
};

export const updateStudentProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, phone, preferred_country, study_level } = req.body;

    const student = await Lead.findOne({
      where: {
        user_id: userId,
        is_deleted: false,
      },
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    await student.update({
      name,
      email,
      phone,
      preferred_country,
      study_level,
    });

    return res.status(200).json(student);
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ message: "Failed to update profile" });
  }
};
