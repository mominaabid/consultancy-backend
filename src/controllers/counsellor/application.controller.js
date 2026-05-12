import db from "../../models/mysql/index.js";
import { logActivity } from "../../services/activityLog.service.js";
import { Op } from "sequelize";
import sequelize from "../../config/db.js";
import sseManager from "../../utils/sseManager.js";
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

const { Application, Lead, User, Document } = db;

// ─── EMAIL NOTIFICATION HELPER ──────────────────────────────────────────────
const sendStatusUpdateEmail = async (
  application,
  newStatus,
  oldStatus = null,
) => {
  try {
    // Fetch student user details
    const student = await db.User.findByPk(application.user_id, {
      attributes: ["id", "name", "email"],
    });

    if (!student || !student.email) {
      console.warn(
        `No valid email for user ${application.user_id}, skipping status email`,
      );
      return;
    }

    const name = student.name || "Student";
    const email = student.email;
    const university = application.target_university || "the university";
    const course = application.course || "your course";
    const appId = application.id;

    // Map status to email function
    switch (newStatus) {
      case "inquiry":
        await sendApplicationInquiryEmail({
          name,
          email,
          university,
          course,
          applicationId: appId,
        });
        break;
      case "evaluation":
        await sendApplicationEvaluationEmail({
          name,
          email,
          university,
          course,
          applicationId: appId,
        });
        break;
      case "application submitted":
        await sendApplicationSubmittedEmail({
          name,
          email,
          university,
          course,
          applicationId: appId,
        });
        break;
      case "offer letter received":
        await sendOfferReceivedEmail({
          name,
          email,
          university,
          course,
          applicationId: appId,
        });
        break;
      case "offer letter not received":
        // Optionally pass reason from counsellor_notes or a default
        await sendOfferNotReceivedEmail({
          name,
          email,
          university,
          course,
          applicationId: appId,
        });
        break;
      case "visa filed":
        await sendVisaFiledEmail({
          name,
          email,
          university,
          course,
          applicationId: appId,
          visaCenter: null,
        });
        break;
      case "approved":
        await sendVisaApprovedEmail({
          name,
          email,
          university,
          course,
          applicationId: appId,
        });
        break;
      case "reject":
        // Use counsellor_notes as reason if available
        const reason =
          application.counselor_notes ||
          "The application did not meet the requirements.";
        await sendApplicationRejectedEmail({
          name,
          email,
          university,
          course,
          applicationId: appId,
          reason,
        });
        break;
      default:
        console.log(`No email template defined for status: ${newStatus}`);
        return;
    }
    console.log(`✅ Status email sent for ${newStatus} to ${email}`);
  } catch (err) {
    console.error(
      `❌ Failed to send status email for status ${newStatus}:`,
      err.message,
    );
    // Do not throw – email failure should not break the main operation
  }
};

// ─── GET STUDENTS WITH APPLICATIONS (admin gets ALL leads) ─────────────────
export const getStudentsWithApplications = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const isAdmin = userRole === "admin";

    let leadWhere = { is_deleted: false };
    if (!isAdmin) {
      leadWhere.counsellor_id = userId;
    }

    const leads = await Lead.findAll({
      where: leadWhere,
      attributes: ["id", "name", "email", "phone", "status", "created_at"],
      include: [
        {
          model: Application,
          as: "applications",
          required: false,
          include: [
            {
              model: Document,
              as: "documents",
              required: false,
              where: { is_deleted: false },
            },
          ],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    const formattedStudents = leads.map((lead) => ({
      id: lead.id,
      user_id: lead.user_id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      status: lead.status,
      // applications:
      //   lead.applications?.map((app) => ({
      //     id: app.id,
      //     target_university: app.target_university,
      //     course: app.course,
      //     status: app.status,
      //     created_at: app.created_at,
      //     student_id: lead.id,
      //     user_id: lead.user_id,
      //     student_name: lead.name,
      //     student_email: lead.email,
      //     full_name: app.full_name,
      //     counselor_notes: app.counselor_notes,
      //     documents: app.documents || [],
      //   })) || [],

      applications: lead.applications?.map((app) => ({
        id: app.id,
        target_university: app.target_university,
        course: app.course,
        target_country: app.target_country,
        deadline: app.deadline,
        status: app.status,
        full_name: app.full_name,
        email: app.email,
        phone: app.phone,
        last_degree: app.last_degree,
        cgpa: app.cgpa,
        english_test: app.english_test,
        test_score: app.test_score,
        counselor_notes: app.counselor_notes,
        created_at: app.created_at,
        student_id: lead.id,
        user_id: lead.user_id,
        student_name: lead.name,
        student_email: lead.email,
        documents: app.documents || [],
      })),
    }));

    res.json({ success: true, students: formattedStudents });
  } catch (err) {
    console.error("Error in getStudentsWithApplications:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching students applications",
    });
  }
};

export const getStudentApplications = async (req, res) => {
  try {
    const { studentId } = req.params;

    const applications = await Application.findAll({
      where: { user_id: studentId },
      order: [["created_at", "DESC"]],
    });

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

export const getAssignedStudents = async (req, res) => {
  try {
    const students = await Lead.findAll({
      where: {
        counsellor_id: req.user.id,
        is_deleted: false,
      },
      attributes: ["id", "name", "email", "phone", "created_at"],
    });

    res.json({
      success: true,
      students,
    });
  } catch (err) {
    console.error("Error fetching assigned students:", err);
    res.status(500).json({ message: "Error fetching assigned students" });
  }
};

export const createApplication = async (req, res) => {
  try {
    const { user_id, ...applicationData } = req.body;
    const counsellorId = req.user?.id;
    const isAdmin = req.user?.role === "admin";

    if (!user_id) {
      return res
        .status(400)
        .json({ success: false, message: "user_id is required" });
    }

    const lead = await Lead.findOne({
      where: { id: user_id, is_deleted: false },
      attributes: [
        "id",
        "user_id",
        "name",
        "email",
        "phone",
        "status",
        "counsellor_id",
      ],
    });

    if (!lead) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }

    if (!lead.user_id) {
      return res.status(400).json({
        success: false,
        message: "Student record does not have an associated user account.",
      });
    }

    if (!isAdmin) {
      const allowedLeadStatuses = ["new", "contacted", "counseling"];
      if (lead.counsellor_id !== counsellorId) {
        return res
          .status(403)
          .json({ success: false, message: "Student not assigned to you" });
      }
      if (!allowedLeadStatuses.includes(lead.status)) {
        return res.status(400).json({
          success: false,
          message: `Lead status "${lead.status}" not allowed for creating an application`,
        });
      }
    }

    const application = await Application.create({
      user_id: lead.user_id,
      full_name: applicationData.full_name || lead.name,
      email: applicationData.email || lead.email,
      phone: applicationData.phone || lead.phone,
      target_university: applicationData.target_university,
      course: applicationData.course,
      target_country: applicationData.target_country,
      deadline: applicationData.deadline,
      status: applicationData.status || "inquiry",
      last_degree: applicationData.last_degree,
      cgpa: applicationData.cgpa,
      english_test: applicationData.english_test,
      test_score: applicationData.test_score,
      counselor_notes: applicationData.counselor_notes,
    });

    await sendStatusUpdateEmail(application, "inquiry");

    await logActivity({
      leadId: lead.id,
      actionType: "application_created",
      note: `Application created for ${lead.name} → ${applicationData.target_university || "—"} (${applicationData.course || "—"})`,
      performedBy: counsellorId,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    // ✅ Send SSE notification to student
    const student = await User.findByPk(lead.user_id, {
      attributes: ["id", "name", "email"],
    });
    if (student && student.id) {
      sseManager.sendToUser(student.id, {
        type: "application_created",
        applicationId: application.id,
        message: `New application created for ${application.target_university} (${application.course}).`,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({
      success: true,
      message: "Application created successfully",
      application,
    });
  } catch (error) {
    console.error("❌ Error creating application:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create application",
    });
  }
};

// export const updateApplication = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const isAdmin = req.user?.role === "admin";
//     const application = await Application.findByPk(id);
//     if (!application)
//       return res.status(404).json({ message: "Application not found" });

//     if (!isAdmin) {
//       const lead = await Lead.findOne({
//         where: { id: application.user_id, counsellor_id: req.user.id },
//       });
//       if (!lead)
//         return res
//           .status(403)
//           .json({ message: "Access denied - Application not yours" });
//     }

//     // Store old values for comparison
//     const oldStatus = application.status;
//     const oldUniversity = application.target_university;
//     const oldCourse = application.course;

//     await application.update(req.body);

//     // Send email if status changed
//     if (req.body.status && req.body.status !== oldStatus) {
//       await sendStatusUpdateEmail(application, req.body.status, oldStatus);
//     }

//     await logActivity({
//       leadId: application.user_id,
//       actionType: "application_updated",
//       note: `Application updated for ${application.target_university}`,
//       performedBy: req.user.id,
//       performedByRole: req.user.role,
//       performedByName: req.user.name,
//     });

//     // Build meaningful notification message
//     let changes = [];
//     if (
//       req.body.target_university &&
//       req.body.target_university !== oldUniversity
//     ) {
//       changes.push(`university changed to ${req.body.target_university}`);
//     }
//     if (req.body.course && req.body.course !== oldCourse) {
//       changes.push(`course changed to ${req.body.course}`);
//     }
//     if (req.body.status && req.body.status !== oldStatus) {
//       changes.push(`status changed to ${req.body.status}`);
//     }
//     let message = `Your application was updated. ${changes.join(", ")}`;
//     if (changes.length === 0) message = "Your application was updated.";

//     // ✅ Send SSE notification to student
//     const student = await User.findByPk(application.user_id, {
//       attributes: ["id", "name", "email"],
//     });
//     if (student && student.id) {
//       sseManager.sendToUser(student.id, {
//         type: "application_updated",
//         applicationId: application.id,
//         message: message,
//         timestamp: new Date().toISOString(),
//       });
//     }

//     res.json({
//       success: true,
//       message: "Application updated successfully",
//       data: application,
//     });
//   } catch (err) {
//     console.error("Error updating application:", err);
//     res.status(500).json({ message: "Error updating application" });
//   }
// };

export const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user?.role === "admin";
    const application = await Application.findByPk(id);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    // 🛡️ Prevent user_id update – it should never change
    const updateData = { ...req.body };
    delete updateData.user_id; // remove user_id from update payload

    if (!isAdmin) {
      const lead = await Lead.findOne({
        where: { user_id: application.user_id, counsellor_id: req.user.id },
      });
      if (!lead) {
        return res
          .status(403)
          .json({ message: "Access denied - Application not yours" });
      }
    }

    const oldStatus = application.status;
    const oldUniversity = application.target_university;
    const oldCourse = application.course;

    await application.update(updateData);

    // Send email if status changed
    if (req.body.status && req.body.status !== oldStatus) {
      await sendStatusUpdateEmail(application, req.body.status, oldStatus);
    }

    // Log activity
    await logActivity({
      leadId: application.user_id, // still using the correct user_id
      actionType: "application_updated",
      note: `Application updated for ${application.target_university}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    // Send SSE notification
    const student = await User.findByPk(application.user_id, {
      attributes: ["id", "name", "email"],
    });
    let message = "Your application was updated.";
    if (
      req.body.target_university &&
      req.body.target_university !== oldUniversity
    ) {
      message = `University changed to ${req.body.target_university}.`;
    } else if (req.body.course && req.body.course !== oldCourse) {
      message = `Course changed to ${req.body.course}.`;
    } else if (req.body.status && req.body.status !== oldStatus) {
      message = `Status changed to ${req.body.status}.`;
    }
    if (student && student.id) {
      sseManager.sendToUser(student.id, {
        type: "application_updated",
        applicationId: application.id,
        message,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: "Application updated successfully",
      data: application,
    });
  } catch (err) {
    console.error("Error updating application:", err);
    res.status(500).json({ message: "Error updating application" });
  }
};

export const deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user?.role === "admin";
    const application = await Application.findByPk(id);
    if (!application)
      return res.status(404).json({ message: "Application not found" });

    if (!isAdmin) {
      const lead = await Lead.findOne({
        where: { id: application.user_id, counsellor_id: req.user.id },
      });
      if (!lead) return res.status(403).json({ message: "Access denied" });
    }

    // ✅ Send SSE notification BEFORE deletion (so we have the data)
    const student = await User.findByPk(application.user_id, {
      attributes: ["id", "name", "email"],
    });
    if (student && student.id) {
      sseManager.sendToUser(student.id, {
        type: "application_deleted",
        applicationId: application.id,
        message: `Your application for ${application.target_university} (${application.course}) has been deleted.`,
        timestamp: new Date().toISOString(),
      });
    }

    await Document.update(
      { is_deleted: true },
      { where: { application_id: id } },
    );
    await application.destroy();

    await logActivity({
      leadId: application.user_id,
      actionType: "application_deleted",
      note: `Application deleted for ${application.target_university}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    res.json({
      success: true,
      message: "Application and related documents deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting application:", err);
    res
      .status(500)
      .json({ message: "Error deleting application", error: err.message });
  }
};

export const updateApplicationStatusAsCounsellor = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status, counsellor_notes } = req.body;

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

    const oldStatus = application.status;

    if (status !== oldStatus) {
      await sendStatusUpdateEmail(application, status, oldStatus);
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

    const updateData = {
      status: status,
      counselor_notes: counsellor_notes || application.counselor_notes,
    };

    if (statusDateMap[status]) {
      updateData[statusDateMap[status]] = new Date();
    }

    await application.update(updateData);

    const student = await User.findByPk(application.user_id, {
      attributes: ["id", "name", "email"],
    });

    const statusDisplayMap = {
      inquiry: "Inquiry",
      evaluation: "Evaluation",
      "application submitted": "Application Submitted",
      "offer letter received": "Offer Letter Received",
      "offer letter not received": "Offer Letter Not Received",
      "visa filed": "Visa Filed",
      approved: "Approved",
      reject: "Rejected",
    };

    const notificationMessage = `Your application for ${application.target_university || "university"} (${application.course || "course"}) status changed from "${statusDisplayMap[oldStatus] || oldStatus}" to "${statusDisplayMap[status] || status}".`;

    if (student && student.id) {
      sseManager.sendToUser(student.id, {
        type: "status_change",
        applicationId: application.id,
        oldStatus: oldStatus,
        newStatus: status,
        message: notificationMessage,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: `Application status updated to ${status}.`,
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
