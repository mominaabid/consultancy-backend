import Application from "../../models/mysql/Application.js";
import { sendApplicationConfirmationEmail } from "../../services/email.service.js";

export const getProfile = async (req, res) => {
  res.json({
    name: "James Wilson",
  });
};

// export const addApplication = async (req, res) => {
//   try {
//     const data = req.body;

//     if (!data.user_id) {
//       return res.status(400).json({ message: "user_id is required" });
//     }

//     if (req.file) {
//       data.profile_picture = `/uploads/${req.file.filename}`;
//     }

//     // Create the application
//     const application = await Application.create({
//       ...data,
//     });

//     // ✅ SEND CONFIRMATION EMAIL (Don't await to avoid blocking response)
//     // But we'll log errors if any
//     if (application.email) {
//       sendApplicationConfirmationEmail({
//         name: application.full_name || data.full_name || "Student",
//         email: application.email,
//         university: application.target_university,
//         course: application.course,
//         applicationId: application.id,
//         deadline: application.deadline,
//       }).catch(error => {
//         console.error("Email sending failed but application created:", error);
//         // Don't throw error - application is already created
//       });
//     }

//     res.status(201).json({
//       success: true,
//       message: "Application created successfully! A confirmation email has been sent.",
//       application: application
//     });

//   } catch (err) {
//     console.error("Error creating application:", err);
//     res.status(500).json({ message: "Failed to create application" });
//   }
// };

export const addApplication = async (req, res) => {
  try {
    const data = req.body;

    if (!data.user_id) {
      return res.status(400).json({ message: "user_id is required" });
    }

    // ✅ Check if student already has 3 applications
    const existingApplicationsCount = await Application.count({
      where: { user_id: data.user_id },
    });

    if (existingApplicationsCount >= 3) {
      return res.status(400).json({
        message:
          "You cannot add more than 3 applications. Maximum limit reached.",
        maxLimit: 3,
        currentCount: existingApplicationsCount,
      });
    }

    if (req.file) {
      data.profile_picture = `/uploads/${req.file.filename}`;
    }

    // Create the application
    const application = await Application.create({
      ...data,
    });

    // Send confirmation email
    if (application.email) {
      sendApplicationConfirmationEmail({
        name: application.full_name || data.full_name || "Student",
        email: application.email,
        university: application.target_university,
        course: application.course,
        applicationId: application.id,
        deadline: application.deadline,
      }).catch((error) => {
        console.error("Email sending failed but application created:", error);
      });
    }

    res.status(201).json({
      success: true,
      message:
        "Application created successfully! A confirmation email has been sent.",
      application: application,
      remainingSlots: 3 - (existingApplicationsCount + 1),
    });
  } catch (err) {
    console.error("Error creating application:", err);
    res.status(500).json({ message: "Failed to create application" });
  }
};

// export const getApplications = async (req, res) => {
//   try {
//     const apps = await Application.findAll({
//       order: [["created_at", "DESC"]],
//     });

//     res.json(apps);
//   } catch (err) {
//     res.status(500).json({ message: "Error fetching applications" });
//   }
// };

export const getApplications = async (req, res) => {
  try {
    // Get the user_id from the authenticated user (set by auth middleware)
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Only fetch applications belonging to the logged-in user
    const apps = await Application.findAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
    });

    res.json(apps);
  } catch (err) {
    console.error("Error fetching applications:", err);
    res.status(500).json({ message: "Error fetching applications" });
  }
};

//

//   try {
//     const { id } = req.params;
//     const data = req.body;

//     if (req.file) {
//       data.profile_picture = `/uploads/${req.file.filename}`;
//     }

//     await Application.update(data, { where: { id } });

//     const updated = await Application.findByPk(id);

//     res.json(updated);
//   } catch (err) {
//     res.status(500).json({ message: "Error updating application" });
//   }
// };

// export const updateApplicationStatus = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { status } = req.body;

//     // Map status to corresponding date field
//     const statusDateMap = {
//       inquiry: "inquiry_date",
//       evaluation: "evaluation_date",
//       "application submitted": "application_submitted_date",
//       "offer letter received": "offer_received_date",
//       "offer letter not received": "offer_not_received_date",
//       "visa filed": "visa_filed_date",
//       approved: "approved_date",
//       reject: "reject_date",
//     };

//     // Create update object with status
//     const updateData = { status };

//     // Add the current timestamp for the new status
//     if (statusDateMap[status]) {
//       updateData[statusDateMap[status]] = new Date();
//       console.log(`Setting ${statusDateMap[status]} to:`, new Date());
//     }

//     const [updated] = await Application.update(updateData, {
//       where: { id },
//       individualHooks: true,
//     });

//     if (updated) {
//       const updatedApplication = await Application.findByPk(id);
//       console.log("Updated application:", updatedApplication.toJSON());
//       res.json(updatedApplication);
//     } else {
//       res.status(404).json({ message: "Application not found" });
//     }
//   } catch (err) {
//     console.error("Error updating status:", err);
//     res.status(500).json({ message: "Error updating status" });
//   }
// };

// export const deleteApplication = async (req, res) => {
//   try {
//     const { id } = req.params;

//     await Application.destroy({ where: { id } });

//     res.json({ message: "Deleted successfully" });
//   } catch (err) {
//     res.status(500).json({ message: "Error deleting application" });
//   }
// };

const checkApplicationOwnership = async (applicationId, userId) => {
  const application = await Application.findByPk(applicationId);
  if (!application) {
    return { error: "Application not found", exists: false };
  }
  if (application.user_id !== userId) {
    return {
      error: "You don't have permission to modify this application",
      isOwner: false,
    };
  }
  return { application, isOwner: true };
};

export const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const data = req.body;

    // Check ownership
    const { application, isOwner, error } = await checkApplicationOwnership(
      id,
      userId,
    );
    if (!isOwner) {
      return res.status(403).json({ message: error || "Permission denied" });
    }

    if (req.file) {
      data.profile_picture = `/uploads/${req.file.filename}`;
    }

    await Application.update(data, { where: { id } });
    const updated = await Application.findByPk(id);
    res.json(updated);
  } catch (err) {
    console.error("Error updating application:", err);
    res.status(500).json({ message: "Error updating application" });
  }
};

export const updateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { status } = req.body;

    // Check ownership
    const { application, isOwner, error } = await checkApplicationOwnership(
      id,
      userId,
    );
    if (!isOwner) {
      return res.status(403).json({ message: error || "Permission denied" });
    }

    const statusDateMap = {
      inquiry: "inquiry_date",
      evaluation: "evaluation_date",
      "application submitted": "application_submitted_date",
      "offer letter received": "offer_received_date",
      "offer letter not received": "offer_not_received_date",
      "visa filed": "visa_filed_date",
      approved: "approved_date",
      reject: "reject_date",
    };

    const updateData = { status };
    if (statusDateMap[status]) {
      updateData[statusDateMap[status]] = new Date();
    }

    const [updated] = await Application.update(updateData, {
      where: { id },
      individualHooks: true,
    });

    if (updated) {
      const updatedApplication = await Application.findByPk(id);
      res.json(updatedApplication);
    } else {
      res.status(404).json({ message: "Application not found" });
    }
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(500).json({ message: "Error updating status" });
  }
};

export const deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Check ownership
    const { application, isOwner, error } = await checkApplicationOwnership(
      id,
      userId,
    );
    if (!isOwner) {
      return res.status(403).json({ message: error || "Permission denied" });
    }

    await Application.destroy({ where: { id } });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("Error deleting application:", err);
    res.status(500).json({ message: "Error deleting application" });
  }
};
