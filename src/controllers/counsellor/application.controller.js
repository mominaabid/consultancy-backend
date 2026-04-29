import Application from "../../models/mysql/Application.js";
import User from "../../models/mysql/User.js";
import { Op } from "sequelize";
import sequelize from "../../config/db.js";
import {
  sendApplicationInquiryEmail,
  sendApplicationEvaluationEmail,
  sendApplicationSubmittedEmail,
  sendOfferReceivedEmail,
  sendOfferNotReceivedEmail,
  sendVisaFiledEmail,
  sendVisaApprovedEmail,
  sendApplicationRejectedEmail,
} from "../../services/email.service.js";

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

// Helper function to send status-specific emails
async function sendStatusUpdateEmail(application, oldStatus, newStatus) {
  const studentEmail = application.email;
  const studentName = application.full_name || "Student";
  const university = application.target_university || "the university";
  const course = application.course || "your selected course";
  const applicationId = application.id;

  console.log(
    `📧 Preparing to send email for status change: ${oldStatus} -> ${newStatus}`,
  );

  try {
    switch (newStatus) {
      case "inquiry":
        await sendApplicationInquiryEmail({
          name: studentName,
          email: studentEmail,
          university,
          course,
          applicationId,
        });
        break;

      case "evaluation":
        await sendApplicationEvaluationEmail({
          name: studentName,
          email: studentEmail,
          university,
          course,
          applicationId,
        });
        break;

      case "application submitted":
        await sendApplicationSubmittedEmail({
          name: studentName,
          email: studentEmail,
          university,
          course,
          applicationId,
          deadline: application.deadline,
        });
        break;

      case "offer letter received":
        await sendOfferReceivedEmail({
          name: studentName,
          email: studentEmail,
          university,
          course,
          applicationId,
        });
        break;

      case "offer letter not received":
        await sendOfferNotReceivedEmail({
          name: studentName,
          email: studentEmail,
          university,
          course,
          applicationId,
          reason:
            application.counselor_notes ||
            "The university is still processing applications",
        });
        break;

      case "visa filed":
        await sendVisaFiledEmail({
          name: studentName,
          email: studentEmail,
          university,
          course,
          applicationId,
          visaCenter:
            application.visa_center || "local visa application center",
        });
        break;

      case "approved":
        await sendVisaApprovedEmail({
          name: studentName,
          email: studentEmail,
          university,
          course,
          applicationId,
        });
        break;

      case "reject":
        await sendApplicationRejectedEmail({
          name: studentName,
          email: studentEmail,
          university,
          course,
          applicationId,
          reason:
            application.counselor_notes ||
            "The application did not meet requirements",
        });
        break;

      default:
        console.log(`No email template defined for status: ${newStatus}`);
        break;
    }
  } catch (emailError) {
    console.error(`Failed to send ${newStatus} email:`, emailError);
    // Don't throw - application update already succeeded
  }
}

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

    // Store old status for comparison
    const oldStatus = application.status;

    // Map status to corresponding date field
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

    // Prepare update data
    const updateData = {
      status: status,
      counselor_notes: counsellor_notes || application.counselor_notes,
    };

    // Add timestamp if status has a corresponding date field
    if (statusDateMap[status]) {
      updateData[statusDateMap[status]] = new Date();
      console.log(`Setting ${statusDateMap[status]} to:`, new Date());
    }

    await application.update(updateData);

    // ✅ SEND EMAIL NOTIFICATION (Don't await to avoid blocking response)
    if (oldStatus !== status && application.email) {
      // Fetch fresh application data with updated notes
      const updatedApplication = await Application.findByPk(applicationId);
      sendStatusUpdateEmail(updatedApplication, oldStatus, status).catch(
        (error) => {
          console.error("Email notification failed but status updated:", error);
        },
      );
    }

    res.json({
      success: true,
      message: `Application status updated to ${status}. A notification email has been sent to the student.`,
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
