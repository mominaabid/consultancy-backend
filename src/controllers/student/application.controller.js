import db from "../../models/mysql/index.js";

const { Application, Document, Sequelize } = db;

export const getProfile = async (req, res) => {
  try {
    const lead = await Lead.findOne({
      where: { email: req.user?.email, is_deleted: false },
    });

    res.json({
      name: lead?.name || req.user?.name || "Student",
      email: lead?.email || req.user?.email,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching profile" });
  }
};

export const getApplications = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    console.log(
      "Student fetching applications - User ID:",
      userId,
      "Email:",
      userEmail,
    );

    if (!userId && !userEmail) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const applications = await Application.findAll({
      where: {
        [db.Sequelize.Op.or]: [
          { user_id: userId },
          { email: userEmail?.toLowerCase() },
        ],
      },
      order: [["created_at", "DESC"]],
    });

    console.log(`✅ Found ${applications.length} applications for student`);

    res.json(applications);
  } catch (err) {
    console.error("Error fetching applications:", err);
    res.status(500).json({ message: "Error fetching applications" });
  }
};

export const getApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user?.email;

    const application = await Application.findOne({
      where: {
        id: id,
        [db.Sequelize.Op.or]: [
          { user_id: req.user?.id },
          { email: userEmail?.toLowerCase() },
        ],
      },
    });

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    res.json(application);
  } catch (err) {
    console.error("Error fetching application:", err);
    res.status(500).json({ message: "Error fetching application" });
  }
};
