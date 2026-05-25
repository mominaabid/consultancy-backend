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
import { storeNotification } from "../../utils/notificationHelper.js";

const sendStatusUpdateEmail = async (
  application,
  newStatus,
  oldStatus = null,
) => {
  try {
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
  }
};

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
      attributes: [
        "id",
        "name",
        "email",
        "phone",
        "status",
        "created_at",
        "study_level",
        "grades_cgpa",
        "english_proficiency_test",
        "english_test_overall_score",
      ],
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
      study_level: lead.study_level || "",
      grades_cgpa: lead.grades_cgpa || "",
      english_proficiency_test: lead.english_proficiency_test || "",
      english_test_overall_score: lead.english_test_overall_score || "",

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
        study_level: app.study_level,
        grades_cgpa: app.grades_cgpa,
        english_proficiency_test: app.english_proficiency_test,
        english_test_overall_score: app.english_test_overall_score,
        year_awarded: app.year_awarded, // NEW
        board_university: app.board_university, // NEW
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
      study_level: app.study_level,
      grades_cgpa: app.grades_cgpa,
      year_awarded: app.year_awarded,
      board_university: app.board_university, // NEW
      english_proficiency_test: app.english_proficiency_test,
      english_test_overall_score: app.english_test_overall_score,
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
      attributes: [
        "id",
        "name",
        "email",
        "phone",
        "created_at",
        "study_level",
        "grades_cgpa",
        "english_proficiency_test",
        "english_test_overall_score",
      ],
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
      study_level: applicationData.study_level,
      grades_cgpa: applicationData.grades_cgpa,
      english_proficiency_test: applicationData.english_proficiency_test,
      english_test_overall_score: applicationData.english_test_overall_score,
      year_awarded: applicationData.year_awarded, // NEW
      board_university: applicationData.board_university, // NEW
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

      await storeNotification(
        student.id,
        "application_created",
        `New application created for ${application.target_university} (${application.course}).`,
        {
          applicationId: application.id,
          university: application.target_university,
          course: application.course,
          createdAt: new Date().toISOString(),
        },
      );

      const admins = await User.findAll({
        where: { role: "admin" },
        attributes: ["id"],
      });

      for (const admin of admins) {
        await storeNotification(
          admin.id,
          "counsellor_added_application",
          `Counsellor ${req.user.name} added an application for student ${lead.name} to ${application.target_university} (${application.course}).`,
          {
            applicationId: application.id,
            counsellorId: req.user.id,
            counsellorName: req.user.name,
            studentId: lead.id,
            studentName: lead.name,
            university: application.target_university,
            course: application.course,
          },
        );
      }
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

export const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user?.role === "admin";
    const application = await Application.findByPk(id);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    const updateData = { ...req.body };
    delete updateData.user_id;

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

    if (req.body.status && req.body.status !== oldStatus) {
      await sendStatusUpdateEmail(application, req.body.status, oldStatus);
    }

    await logActivity({
      leadId: application.user_id,
      actionType: "application_updated",
      note: `Application updated for ${application.target_university}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    const student = await User.findByPk(application.user_id, {
      attributes: ["id", "name", "email"],
    });
    // let message = "Your application was updated.";
    // if (
    //   req.body.target_university &&
    //   req.body.target_university !== oldUniversity
    // ) {
    //   message = `University changed to ${req.body.target_university}.`;
    // } else if (req.body.course && req.body.course !== oldCourse) {
    //   message = `Course changed to ${req.body.course}.`;
    // } else if (req.body.status && req.body.status !== oldStatus) {
    //   message = `Status changed to ${req.body.status}.`;
    // }

    // Helper to get a readable application identifier
    const getAppIdentifier = (app) => {
      if (app.target_university && app.course) {
        return `${app.target_university} (${app.course})`;
      }
      if (app.target_university) return app.target_university;
      if (app.course) return app.course;
      return `Application #${app.id}`;
    };

    let message = `Your application (${getAppIdentifier(application)}) was updated.`;

    if (
      req.body.target_university &&
      req.body.target_university !== oldUniversity
    ) {
      message = `University for ${getAppIdentifier(application)} changed to ${req.body.target_university}.`;
    } else if (req.body.course && req.body.course !== oldCourse) {
      message = `Course for ${getAppIdentifier(application)} changed to ${req.body.course}.`;
    } else if (req.body.status && req.body.status !== oldStatus) {
      // Use a user‑friendly status label
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
      const newStatusLabel =
        statusDisplayMap[req.body.status] || req.body.status;
      message = `Status of ${getAppIdentifier(application)} changed to ${newStatusLabel}.`;
    }

    if (student && student.id) {
      sseManager.sendToUser(student.id, {
        type: "application_updated",
        applicationId: application.id,
        message,
        timestamp: new Date().toISOString(),
      });

      await storeNotification(student.id, "application_updated", message, {
        applicationId: application.id,
        oldUniversity,
        newUniversity: req.body.target_university,
        oldCourse,
        newCourse: req.body.course,
        oldStatus,
        newStatus: req.body.status,
        updatedBy: req.user.name,
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

      await storeNotification(
        student.id,
        "application_deleted",
        `Your application for ${application.target_university} (${application.course}) has been deleted.`,
        {
          applicationId: application.id,
          university: application.target_university,
          course: application.course,
          deletedBy: req.user.name,
          deletedAt: new Date().toISOString(),
        },
      );
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

      await storeNotification(
        student.id,
        "status_change",
        notificationMessage,
        {
          applicationId: application.id,
          oldStatus,
          newStatus: status,
          university: application.target_university,
          course: application.course,
          updatedBy: req.user.name,
          counselorNotes: counsellor_notes || null,
        },
      );
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
