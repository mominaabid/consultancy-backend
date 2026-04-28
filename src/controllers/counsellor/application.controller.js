import Application from "../../models/mysql/Application.js";
import User from "../../models/mysql/User.js";
import { Op } from "sequelize";
import sequelize from "../../config/db.js";

export const getStudentsWithApplications = async (req, res) => {
  try {
    const students = await User.findAll({
      where: {
        role: "student",
        is_deleted: false,
        is_active: true,
      },
      attributes: ["id", "name", "email", "created_at"],
      include: [
        {
          model: Application,
          as: "applications",
          required: false,
          order: [["created_at", "DESC"]],
        },
      ],
    });

    const formattedStudents = students.map((student) => ({
      _id: student.id,
      id: student.id,
      name: student.name,
      email: student.email,
      applications:
        student.applications?.map((app) => ({
          _id: app.id,
          id: app.id,
          target_university: app.target_university,
          course: app.course,
          status: app.status,
          deadline: app.deadline,
          created_at: app.created_at,
          documents: [],
        })) || [],
    }));

    res.json({
      success: true,
      students: formattedStudents,
    });
  } catch (err) {
    console.error("Error fetching students applications:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching students applications",
    });
  }
};

// Get specific student's applications
export const getStudentApplications = async (req, res) => {
  try {
    const { studentId } = req.params;

    const applications = await Application.findAll({
      where: { user_id: studentId },
      order: [["created_at", "DESC"]],
    });

    // Format applications to match frontend expected structure
    const formattedApplications = applications.map((app) => ({
      id: app.id,
      _id: app.id,
      full_name: app.full_name,
      email: app.email,
      phone: app.phone,
      cnic: app.cnic,
      last_degree: app.last_degree,
      cgpa: app.cgpa,
      passing_year: app.passing_year,
      english_test: app.english_test,
      test_score: app.test_score,
      target_university: app.target_university,
      course: app.course,
      target_country: app.target_country,
      status: app.status,
      deadline: app.deadline,
      round: app.round,
      counselor_notes: app.counselor_notes,
      created_at: app.created_at,
    }));

    res.json({
      success: true,
      applications: formattedApplications,
      documents: [],
    });
  } catch (err) {
    console.error("Error fetching student applications:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching student applications",
    });
  }
};

// Update application status (counsellor action)
export const updateApplicationStatusAsCounsellor = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status, counsellor_notes } = req.body;

    // Validate status against new enum values
    const validStatuses = [
      "inquiry",
      "evaluation",
      "application submitted",
      "offer letter received",
      "offer letter not received",
      "visa filed",
      "approved",
      "reject",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const application = await Application.findByPk(applicationId);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    await application.update({
      status: status,
      counselor_notes: counsellor_notes || application.counselor_notes,
    });

    res.json({
      success: true,
      message: "Application status updated successfully",
      application: application,
    });
  } catch (err) {
    console.error("Error updating application status:", err);
    res.status(500).json({
      success: false,
      message: "Error updating application status",
    });
  }
};

// Get application statistics for counsellor dashboard
export const getApplicationStats = async (req, res) => {
  try {
    const stats = await Application.findAll({
      attributes: [
        "status",
        [sequelize.fn("COUNT", sequelize.col("status")), "count"],
      ],
      group: ["status"],
    });

    const result = {
      total: 0,
      inquiry: 0,
      evaluation: 0,
      applicationSubmitted: 0,
      offerLetterReceived: 0,
      offerLetterNotReceived: 0,
      visaFiled: 0,
      approved: 0,
      reject: 0,
    };

    stats.forEach((stat) => {
      const count = parseInt(stat.dataValues.count);
      result.total += count;

      switch (stat.status) {
        case "inquiry":
          result.inquiry = count;
          break;
        case "evaluation":
          result.evaluation = count;
          break;
        case "application submitted":
          result.applicationSubmitted = count;
          break;
        case "offer letter received":
          result.offerLetterReceived = count;
          break;
        case "offer letter not received":
          result.offerLetterNotReceived = count;
          break;
        case "visa filed":
          result.visaFiled = count;
          break;
        case "approved":
          result.approved = count;
          break;
        case "reject":
          result.reject = count;
          break;
      }
    });

    res.json({
      success: true,
      stats: result,
    });
  } catch (err) {
    console.error("Error getting application stats:", err);
    res.status(500).json({
      success: false,
      message: "Error getting application statistics",
    });
  }
};
