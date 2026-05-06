import Lead from "../../models/mysql/Lead.js";
import User from "../../models/mysql/User.js";

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
      return res.status(404).json({
        message: "Student profile not found",
      });
    }

    return res.status(200).json(student);
  } catch (error) {
    console.error("GET STUDENT PROFILE ERROR:", error);
    return res.status(500).json({
      message: "Server error while fetching profile",
    });
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