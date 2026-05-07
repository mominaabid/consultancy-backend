// src/controllers/counsellor/application.controller.js
import db from '../../models/mysql/index.js';
import { logActivity } from '../../services/activityLog.service.js';
import { Op } from "sequelize";
import sequelize from "../../config/db.js";
import sseManager from '../../utils/sseManager.js';

const { Application, Lead, User, Document } = db;

// ─── GET STUDENTS WITH APPLICATIONS ─────────────────────────────────────────
// src/controllers/counsellor/application.controller.js

export const getStudentsWithApplications = async (req, res) => {
  try {
    const counsellorId = req.user?.id;

    if (!counsellorId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Fetch Leads + their Applications
    const leads = await Lead.findAll({
      where: { 
        counsellor_id: counsellorId,
        is_deleted: false 
      },
      attributes: ['id', 'name', 'email', 'phone', 'created_at'],
      include: [
        {
          model: Application,
          as: 'applications',           // Make sure this association exists
          required: false,
          where: {                      // Optional: only show non-deleted apps
            // You can add soft delete later
          },
          include: [
            {
              model: Document,
              as: 'documents',
              required: false,
              where: { is_deleted: false }
            }
          ],
          order: [['created_at', 'DESC']]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    const formattedStudents = leads.map((lead) => ({
      id: lead.id,
      user_id: lead.id,
      name: lead.name,
      email: lead.email,
      applications: lead.applications?.map((app) => ({
        id: app.id,
        target_university: app.target_university,
        course: app.course,
        status: app.status,
        created_at: app.created_at,
        student_id: lead.id,
        student_name: lead.name,
        student_email: lead.email,
        full_name: app.full_name,
        counselor_notes: app.counselor_notes,
        documents: app.documents || [],
      })) || [],
    }));

    res.json({
      success: true,
      students: formattedStudents,
    });

  } catch (err) {
    console.error("Error in getStudentsWithApplications:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching students applications"
    });
  }
};

// ─── GET STUDENT APPLICATIONS ───────────────────────────────────────────────
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

// ─── GET ASSIGNED STUDENTS FOR COUNSELLOR ───────────────────────────────────
export const getAssignedStudents = async (req, res) => {
  try {
    const students = await Lead.findAll({
      where: { 
        counsellor_id: req.user.id,
        is_deleted: false 
      },
      attributes: ['id', 'name', 'email', 'phone', 'created_at'],
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

// src/controllers/counsellor/application.controller.js

export const createApplication = async (req, res) => {
  try {
    const { 
      user_id,           // This is Lead.id from frontend
      target_university, 
      course, 
      target_country,
      deadline,
      status = "inquiry",
      full_name,
      email,
      phone,
      last_degree,
      cgpa,
      english_test,
      test_score,
      counselor_notes = "",
    } = req.body;

    if (!user_id || !target_university || !course) {
      return res.status(400).json({ 
        success: false, 
        message: 'Lead ID, University and Course are required' 
      });
    }

    // Find Lead
    const lead = await Lead.findOne({
      where: { 
        id: user_id,
        counsellor_id: req.user.id,
        is_deleted: false 
      },
      attributes: ['id', 'name', 'email', 'phone']
    });

    if (!lead) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student lead not found or not assigned to you' 
      });
    }

    // Create Application - Using Lead.id as user_id (temporary solution)
    const application = await Application.create({
      user_id: lead.id,                    // ← Using Lead ID here
      full_name: full_name || lead.name,
      email: email || lead.email,
      phone: phone || lead.phone,
      target_country,
      target_university,
      course,
      last_degree,
      cgpa,
      english_test,
      test_score,
      counselor_notes,
      status,
      deadline,
      counsellor_id: req.user.id,          // Optional: if you add this column later
    });

    console.log("✅ Application Created! ID:", application.id);

    res.status(201).json({
      success: true,
      message: 'Application created successfully',
      data: application,
    });

  } catch (err) {
    console.error("❌ Create Application Error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.name === 'SequelizeValidationError' 
        ? err.errors[0].message 
        : "Failed to create application" 
    });
  }
};

// ─── UPDATE APPLICATION (COUNSELLOR) ────────────────────────────────────────
// ─── UPDATE APPLICATION (COUNSELLOR) ────────────────────────────────────────
export const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    
    const application = await Application.findByPk(id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Find the lead using user_id (since we store lead.id in user_id)
    const lead = await Lead.findOne({
      where: { 
        id: application.user_id,           // This is the key fix
        counsellor_id: req.user.id 
      }
    });

    if (!lead && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied - Application not yours' });
    }

    await application.update(req.body);

    await logActivity({
      leadId: lead?.id || application.user_id,
      actionType: 'application_updated',
      note: `Application updated for ${application.target_university}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    res.json({
      success: true,
      message: 'Application updated successfully',
      data: application,
    });
  } catch (err) {
    console.error("Error updating application:", err);
    res.status(500).json({ message: "Error updating application" });
  }
};

// ─── DELETE APPLICATION (COUNSELLOR) ────────────────────────────────────────
// ─── DELETE APPLICATION (COUNSELLOR) ────────────────────────────────────────
export const deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;
    
    const application = await Application.findByPk(id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check ownership
    const lead = await Lead.findOne({
      where: { 
        id: application.user_id,
        counsellor_id: req.user.id 
      }
    });

    if (!lead && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // First soft delete all related documents
    await Document.update(
      { is_deleted: true }, 
      { where: { application_id: id } }
    );

    // Then delete the application
    await application.destroy();

    await logActivity({
      leadId: lead?.id || application.user_id,
      actionType: 'application_deleted',
      note: `Application deleted for ${application.target_university}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    res.json({
      success: true,
      message: 'Application and related documents deleted successfully',
    });
  } catch (err) {
    console.error("Error deleting application:", err);
    
    if (err.name === 'SequelizeForeignKeyConstraintError' || err.original?.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({
        message: "Cannot delete application because it has linked documents. Please try again."
      });
    }

    res.status(500).json({ 
      message: "Error deleting application",
      error: err.message 
    });
  }
};

// ─── UPDATE APPLICATION STATUS (COUNSELLOR) ─────────────────────────────────
export const updateApplicationStatusAsCounsellor = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status, counsellor_notes } = req.body;

    const validStatuses = [
      "inquiry", "evaluation", "application submitted", "offer letter received",
      "offer letter not received", "visa filed", "approved", "reject",
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
      attributes: ['id', 'name', 'email']
    });

    const statusDisplayMap = {
      "inquiry": "Inquiry",
      "evaluation": "Evaluation",
      "application submitted": "Application Submitted",
      "offer letter received": "Offer Letter Received",
      "offer letter not received": "Offer Letter Not Received",
      "visa filed": "Visa Filed",
      "approved": "Approved",
      "reject": "Rejected"
    };

    const notificationMessage = `Your application for ${application.target_university || 'university'} (${application.course || 'course'}) status changed from "${statusDisplayMap[oldStatus] || oldStatus}" to "${statusDisplayMap[status] || status}".`;

    if (student && student.id) {
      sseManager.sendToUser(student.id, {
        type: 'status_change',
        applicationId: application.id,
        oldStatus: oldStatus,
        newStatus: status,
        message: notificationMessage,
        timestamp: new Date().toISOString()
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

// ─── GET APPLICATION STATS ─────────────────────────────────────────────────
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