// src/controllers/counsellor/application.controller.js
import db from "../../models/mysql/index.js";
import { logActivity } from "../../services/activityLog.service.js";
import { Op } from "sequelize";
import rawDb from "../../config/db.js";
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
  sendDebitNotificationEmail,
} from "../../services/email.service.js";

const { Application, Lead, User, Document, AccountTransaction } = db;
import { storeNotification } from "../../utils/notificationHelper.js";

// ---------- Helper functions ----------
const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

async function getStudentAndAppDetails(applicationId) {
  const application = await Application.findByPk(applicationId, {
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "name"],
      },
    ],
  });
  if (!application) {
    throw new Error(`Application with id ${applicationId} not found`);
  }
  const student = application.user;
  if (!student || !student.id) {
    throw new Error(`No associated user for application ${applicationId}`);
  }
  return {
    studentName: student.name || "Student",
    appReference: application.id.toString(),
    userId: student.id,
  };
}

async function getConfigNameById(id, type) {
  if (!id) return '';
  const [result] = await rawDb.query(
    'SELECT name FROM config_values WHERE id = ? AND type = ?',
    [id, type]
  );
  return result?.name || '';
}

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
const universityRow = await db.University.findByPk(application.university_id, {
      attributes: ["name"],
    });
    const courseNameResolved = await getConfigNameById(application.course_id, "course");

    const name = student.name || "Student";
    const email = student.email;
    const university = universityRow?.name || "the university";
    const course = courseNameResolved || "your course";
    const appId = application.id;
   

    switch (newStatus) {
      case "inquiry":
        await sendApplicationInquiryEmail({ name, email, university, course, applicationId: appId });
        break;
      case "evaluation":
        await sendApplicationEvaluationEmail({ name, email, university, course, applicationId: appId });
        break;
      case "application submitted":
        await sendApplicationSubmittedEmail({ name, email, university, course, applicationId: appId });
        break;
      case "offer letter received":
        await sendOfferReceivedEmail({ name, email, university, course, applicationId: appId });
        break;
      case "offer letter not received":
        await sendOfferNotReceivedEmail({ name, email, university, course, applicationId: appId });
        break;
      case "visa filed":
        await sendVisaFiledEmail({ name, email, university, course, applicationId: appId, visaCenter: null });
        break;
      case "approved":
        await sendVisaApprovedEmail({ name, email, university, course, applicationId: appId });
        break;
      case "reject":
        const reason = application.counselor_notes || "The application did not meet the requirements.";
        await sendApplicationRejectedEmail({ name, email, university, course, applicationId: appId, reason });
        break;
      default:
        console.log(`No email template defined for status: ${newStatus}`);
        return;
    }
    console.log(`✅ Status email sent for ${newStatus} to ${email}`);
  } catch (err) {
    console.error(`❌ Failed to send status email for status ${newStatus}:`, err.message);
  }
};

// ✅ getStudentsWithApplications - Using correct table names from your DB
export const getStudentsWithApplications = async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    let counsellorId = null;

    if (!isAdmin) {
      const [counsellorRows] = await rawDb.query(
        'SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0',
        [req.user.id]
      );

      if (!counsellorRows || counsellorRows.length === 0) {
        return res.json({
          success: true,
          students: [],
          count: 0,
          message: "No counsellor record found for this user"
        });
      }

      counsellorId = counsellorRows[0].id;
    }

    console.log(
      isAdmin
        ? "📊 Fetching students for ADMIN (all)"
        : `📊 Fetching students for counsellor: ${counsellorId}`
    );

    const baseQuery = `
      SELECT 
        l.id,
        l.user_id,
        l.name,
        l.email,
        l.phone,
        l.status,
        l.dob,
        l.father_name,
        l.father_contact,
        l.home_address,
        l.preferred_country,
        l.english_test_id,
        l.english_test_overall_score,
        l.created_at,
        COALESCE(
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', a.id,
              'lead_id', a.lead_id,
              'country_id', a.country_id,
              'city_id', a.city_id,
              'university_id', a.university_id,
              'course_id', a.course_id,
              'target_university', u.name,
              'course', cv.name,
              'target_country', c.name,
              'deadline', a.deadline,
              'status', a.status,
              'consultancy_fee', a.consultancy_fee,
              'created_at', a.created_at,
              'documents', (
                SELECT COALESCE(
                  JSON_ARRAYAGG(
                    JSON_OBJECT(
                      'id', d.id,
                      'doc_type_id', d.doc_value,
                      'doc_type_name', dcv.name,
                      'is_collective', d.is_collective,
                      'collective_doc_ids', d.collective_doc_ids,
                      'file_path', d.file_path,
                      'file_url', d.file_path,
                      'original_name', d.file_path,
                      'status', d.status,
                      'submitted_at', d.created_at,
                      'created_at', d.created_at,
                      'reviewed_at', d.reviewed_at,
                      'rejection_reason', d.rejection_reason,
                      'notes', d.notes,
                      'uploaded_by', d.uploaded_by,
                      'uploaded_by_id', d.uploaded_by_id
                    )
                  ), JSON_ARRAY()
                ) FROM student_documents d 
                LEFT JOIN config_values dcv ON d.doc_value = dcv.id
                WHERE d.application_id = a.id AND d.is_deleted = 0
              )
            )
          ), JSON_ARRAY()
        ) as applications
      FROM leads l
      LEFT JOIN applications a ON l.id = a.lead_id AND a.is_deleted = 0
      LEFT JOIN universities u ON a.university_id = u.id
      LEFT JOIN countries c ON a.country_id = c.id
      LEFT JOIN config_values cv ON a.course_id = cv.id
      WHERE l.is_deleted = 0 
        AND l.user_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM applications a2 
          WHERE a2.lead_id = l.id 
          AND a2.is_deleted = 0
        )
        ${isAdmin ? '' : 'AND l.counsellor_id = ?'}
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `;

    const queryParams = isAdmin ? [] : [counsellorId];
    const [results] = await rawDb.query(baseQuery, queryParams);

    console.log("📊 Found students:", results?.length || 0);

    if (!results || results.length === 0) {
      return res.json({
        success: true,
        students: [],
        count: 0,
        message: isAdmin ? "No students found" : "No students found for this counsellor"
      });
    }

    const students = results.map(student => {
      let applications = [];
      
      if (student.applications) {
        if (typeof student.applications === 'string') {
          try {
            applications = JSON.parse(student.applications);
          } catch (e) {
            console.error("Error parsing applications:", e);
            applications = [];
          }
        } else if (Array.isArray(student.applications)) {
          applications = student.applications;
        }
        applications = applications.filter(app => app && app.id);
      }

      return {
        id: student.id,
        user_id: student.user_id || student.id,
        name: student.name || 'Unnamed Student',
        email: student.email || '',
        phone: student.phone || '',
        status: student.status || 'new',
        dob: student.dob || null,
        father_name: student.father_name || '',
        father_contact: student.father_contact || '',
        home_address: student.home_address || '',
        preferred_country: student.preferred_country || '',
        english_test_id: student.english_test_id || null,
        english_proficiency_test: student.english_test_id || '',
        english_test_overall_score: student.english_test_overall_score || '',
        created_at: student.created_at,
        applications: applications
      };
    });

    console.log("✅ Returning", students.length, "students with applications");

    res.json({
      success: true,
      students: students,
      count: students.length
    });

  } catch (error) {
    console.error("Error fetching students with applications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch students",
      error: error.message
    });
  }
};
export const getLeadEducation = async (req, res) => {
    try {
        const { leadId } = req.params;
        
        // Get education for this lead
        const [education] = await rawDb.query(
            'SELECT * FROM lead_educations WHERE lead_id = ?',
            [leadId]
        );
        
        res.json({
            success: true,
            education: education || []
        });
    } catch (error) {
        console.error("Error fetching education:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch education"
        });
    }
};

// ✅ getAssignedStudents - Using correct table names
export const getAssignedStudents = async (req, res) => {
  try {
    const [counsellorRows] = await rawDb.query(
      'SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0',
      [req.user.id]
    );

    if (!counsellorRows || counsellorRows.length === 0) {
      return res.json({
        success: true,
        students: [],
        count: 0
      });
    }

    const counsellorId = counsellorRows[0].id;

  const [students] = await rawDb.query(
      `SELECT 
        l.id, 
        l.user_id,
        l.name, 
        l.email, 
        l.phone,
        l.dob,
        l.father_name,
        l.father_contact,
        l.home_address,
        l.preferred_country,
        l.status,
        l.english_test_id,
        l.english_test_overall_score,
        l.created_at
       FROM leads l
       WHERE l.counsellor_id = ? AND l.is_deleted = 0
       ORDER BY l.created_at DESC`,
      [counsellorId]
    );

    const formattedStudents = students.map((s) => ({
      ...s,
      english_proficiency_test: s.english_test_id || '',
    }));

    res.json({
      success: true,
      students: formattedStudents,
    });
  } catch (err) {
    console.error("Error fetching assigned students:", err);
    res.status(500).json({ 
      success: false,
      message: "Error fetching assigned students", 
      error: err.message 
    });
  }
};

// ✅ getStudentApplications
export const getStudentApplications = async (req, res) => {
  try {
    const { studentId } = req.params;

    const applications = await Application.findAll({
      where: { lead_id: studentId },
      order: [["created_at", "DESC"]],
    });

    const formattedApplications = applications.map((app) => ({
      id: app.id,
      _id: app.id,
      target_university: app.target_university,
      course: app.course,
      target_country: app.target_country,
      deadline: app.deadline,
      status: app.status,
      counselor_notes: app.counselor_notes,
      consultancy_fee: app.consultancy_fee,
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

// ✅ createApplication - Fixed with correct fields
export const createApplication = async (req, res) => {
  try {
    const { user_id, consultancy_fee, ...applicationData } = req.body;

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

    if (
      consultancy_fee === undefined ||
      consultancy_fee === null ||
      consultancy_fee === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Consultancy fee is required.",
      });
    }
    const feeNum = parseFloat(consultancy_fee);
    if (isNaN(feeNum) || feeNum < 0) {
      return res.status(400).json({
        success: false,
        message: "Consultancy fee must be a positive number.",
      });
    }
  console.log("🔍 counsellor check:", {
      lead_counsellor_id: lead.counsellor_id,
      lead_counsellor_id_type: typeof lead.counsellor_id,
      req_user_id: counsellorId,
      req_user_id_type: typeof counsellorId,
      strictEqual: lead.counsellor_id === counsellorId,
    });
if (!isAdmin) {
      // Resolve the counsellor's own record ID from their logged-in user ID
      const [counsellorRows] = await rawDb.query(
        "SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0 LIMIT 1",
        [counsellorId]
      );
      const counsellorRecordId = counsellorRows?.[0]?.id;

      if (!counsellorRecordId || lead.counsellor_id !== counsellorRecordId) {
        return res
          .status(403)
          .json({ success: false, message: "Student not assigned to you" });
      }

      const blockedLeadStatuses = ["new", "contacted"];
      if (blockedLeadStatuses.includes(lead.status)) {
        return res.status(400).json({
          success: false,
          message: `Lead status "${lead.status}" not allowed for creating an application`,
        });
      }
    }

    const application = await Application.create({
      lead_id: lead.id,
      user_id: lead.user_id,
      country_id: parseInt(req.body.country_id),
      city_id: parseInt(req.body.city_id),
      university_id: parseInt(req.body.university_id),
      course_id: parseInt(req.body.course_id),
      deadline: applicationData.deadline || null,
      status: applicationData.status || "inquiry",
      counsellor_notes: applicationData.counsellor_notes || null,
      consultancy_fee: feeNum,
    });
const universityRow = await db.University.findByPk(application.university_id, {
      attributes: ["name"],
    });
    const courseNameResolved = await getConfigNameById(application.course_id, "course");
    const universityName = universityRow?.name || "N/A";
    const finalCourseName = courseNameResolved || "N/A";
    await AccountTransaction.create({
      invoice_no: `FEE-${application.id}`,
      user_id: application.user_id,
      application_id: application.id,
      debit: feeNum,
      credit: 0,
      balance: feeNum,
      date: new Date(),
      description: "Initial consultancy fee",
    });

    // Notification logic...
    (async () => {
      try {
        const { studentName, appReference, userId } =
          await getStudentAndAppDetails(application.id);
        const transactionDate = new Date().toISOString();
        const feeAmount = feeNum;

        const message = `Consultancy Fee Added: ${formatCurrency(feeAmount)} for application ${appReference}. Date: ${new Date(transactionDate).toLocaleString()}`;

        await storeNotification(userId, "consultancy_fee_added", message, {
          studentName,
          applicationId: application.id,
          applicationReference: appReference,
          amount: feeAmount,
          transactionType: "Consultancy Fee Added",
          transactionDate: transactionDate,
        });

        sseManager.sendToUser(userId, {
          type: "consultancy_fee_added",
          message,
          metadata: {
            applicationId: application.id,
            amount: feeAmount,
            transactionDate,
          },
        });
      } catch (err) {
        console.error(
          "Failed to store consultancy fee notification or send SSE:",
          err,
        );
      }
    })();

    // Email notification
    (async () => {
      try {
        const student = await db.User.findByPk(lead.user_id, {
          attributes: ["id", "name", "email"],
        });
        const studentName = student?.name || lead.name;
        const studentEmail = student?.email || lead.email;

      const applicationDetails = `${universityName} (${finalCourseName})`;

        const createdTx = await db.AccountTransaction.findOne({
          where: { application_id: application.id, debit: feeNum },
          order: [["id", "DESC"]],
        });

        if (createdTx) {
          await sendDebitNotificationEmail({
            studentName,
            studentEmail,
            applicationDetails,
            invoiceNumber: createdTx.invoice_no,
            debitedAmount: feeNum,
            outstandingBalance: feeNum,
            transactionDate: new Date(),
            description: "Initial consultancy fee",
          });
        }
      } catch (emailErr) {
        console.error("Failed to send initial debit email:", emailErr);
      }
    })();

    await sendStatusUpdateEmail(application, "inquiry");

    await logActivity({
      leadId: lead.id,
      actionType: "application_created",
note: `Application created for ${lead.name} → ${universityName} (${finalCourseName})`,
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
  message: `New application created for ${universityName} (${finalCourseName}).`,
        timestamp: new Date().toISOString(),
      });

      await storeNotification(
        student.id,
        "application_created",
        `New application created for ${universityName} (${finalCourseName}).`,
        {
          applicationId: application.id,
          university: universityName,
          course: finalCourseName,
          created_at: new Date().toISOString(),
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
          `${req.user.name} added an application for student ${lead.name} to ${universityName} (${finalCourseName}).`,
          {
            applicationId: application.id,
            counsellorId: req.user.id,
            counsellorName: req.user.name,
            studentId: lead.id,
            studentName: lead.name,
            university: universityName,
            course: finalCourseName,
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
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to create application",
      });
    }
  }
};

// ✅ updateApplication
// ✅ updateApplication - Using rawDb
// ✅ updateApplication - Full update with all fields
export const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("🔍 UPDATE APPLICATION ID:", id);
    console.log("🔍 REQUEST BODY:", req.body);
    const isAdmin = req.user?.role === "admin";
    const {
      user_id,
      country_id,
      city_id,
      university_id,
      course_id,
      deadline,
      status,
      counsellor_notes,
      consultancy_fee,
    } = req.body;

    // Check if application exists
    const [appRows] = await rawDb.query(
      'SELECT * FROM applications WHERE id = ? AND is_deleted = 0',
      [id]
    );

    if (!appRows || appRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Application not found"
      });
    }

    const application = appRows[0];

    // Check permissions
 // Check permissions
if (!isAdmin) {
  const [counsellorRows] = await rawDb.query(
    "SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0 LIMIT 1",
    [req.user.id]
  );
  const counsellorRecordId = counsellorRows?.[0]?.id;

  const [leadRows] = await rawDb.query(
    'SELECT * FROM leads WHERE user_id = ? AND counsellor_id = ? AND is_deleted = 0',
    [application.user_id, counsellorRecordId]
  );

  if (!counsellorRecordId || !leadRows || leadRows.length === 0) {
    return res.status(403).json({
      success: false,
      message: "Access denied - Application not yours"
    });
  }
}

    const oldStatus = application.status;

    // ✅ UPDATE ALL FIELDS
// ✅ UPDATE ALL FIELDS — preserve existing value if field not sent
    await rawDb.query(
      `UPDATE applications SET 
        country_id = ?,
        city_id = ?,
        university_id = ?,
        course_id = ?,
        deadline = ?,
        status = ?,
        counsellor_notes = ?,
        consultancy_fee = ?,
        updated_at = NOW()
      WHERE id = ?`,
      [
        country_id ?? application.country_id,
        city_id ?? application.city_id,
        university_id ?? application.university_id,
        course_id ?? application.course_id,
        deadline ?? application.deadline,
        status ?? application.status,
        counsellor_notes ?? application.counsellor_notes,
        consultancy_fee ?? application.consultancy_fee,
        id
      ]
    );

    // Get updated application
    const [updatedAppRows] = await rawDb.query(
      'SELECT * FROM applications WHERE id = ?',
      [id]
    );
    const updatedApplication = updatedAppRows[0];

    // Send email if status changed
    if (status && status !== oldStatus) {
      await sendStatusUpdateEmail(updatedApplication, status, oldStatus);
    }

    // Log activity
    const [leadRows] = await rawDb.query(
      'SELECT * FROM leads WHERE user_id = ?',
      [application.user_id]
    );
    
    if (leadRows && leadRows.length > 0) {
      await logActivity({
        leadId: leadRows[0].id,
        actionType: "application_updated",
        note: `Application updated from ${oldStatus} to ${status}`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    res.json({
      success: true,
      message: "Application updated successfully",
      data: updatedApplication,
    });
  } catch (err) {
    console.error("Error updating application:", err);
    res.status(500).json({
      success: false,
      message: "Error updating application",
      error: err.message
    });
  }
};
// ✅ UPDATE ONLY STATUS - For ApplicationStatusModal
export const updateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const isAdmin = req.user?.role === "admin";

    // Check if application exists
    const [appRows] = await rawDb.query(
      'SELECT * FROM applications WHERE id = ? AND is_deleted = 0',
      [id]
    );

    if (!appRows || appRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Application not found"
      });
    }

    const application = appRows[0];

    // Check permissions
// Check permissions
if (!isAdmin) {
  const [counsellorRows] = await rawDb.query(
    "SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0 LIMIT 1",
    [req.user.id]
  );
  const counsellorRecordId = counsellorRows?.[0]?.id;

  const [leadRows] = await rawDb.query(
    'SELECT * FROM leads WHERE user_id = ? AND counsellor_id = ? AND is_deleted = 0',
    [application.user_id, counsellorRecordId]
  );

  if (!counsellorRecordId || !leadRows || leadRows.length === 0) {
    return res.status(403).json({
      success: false,
      message: "Access denied - Application not yours"
    });
  }
}

    const oldStatus = application.status;

    // ✅ UPDATE ONLY STATUS
    await rawDb.query(
      'UPDATE applications SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );

    // Get updated application
    const [updatedAppRows] = await rawDb.query(
      'SELECT * FROM applications WHERE id = ?',
      [id]
    );
    const updatedApplication = updatedAppRows[0];

    // Send email if status changed
    if (status && status !== oldStatus) {
      await sendStatusUpdateEmail(updatedApplication, status, oldStatus);
    }

    res.json({
      success: true,
      message: "Application status updated successfully",
      data: updatedApplication,
    });
  } catch (err) {
    console.error("Error updating application status:", err);
    res.status(500).json({
      success: false,
      message: "Error updating application status",
      error: err.message
    });
  }
};

// ✅ UPDATE ALL FIELDS - For EditApplicationModal


// ✅ deleteApplication
export const deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user?.role === "admin";
    const application = await Application.findByPk(id);
    if (!application)
      return res.status(404).json({ message: "Application not found" });
 const universityRow = await db.University.findByPk(application.university_id, {
      attributes: ["name"],
    });
    const courseNameResolved = await getConfigNameById(application.course_id, "course");
    const universityName = universityRow?.name || "N/A";
    const finalCourseName = courseNameResolved || "N/A";
    if (!isAdmin) {
      const [counsellorRows] = await rawDb.query(
        "SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0 LIMIT 1",
        [req.user.id]
      );
      const counsellorRecordId = counsellorRows?.[0]?.id;

      const lead = await Lead.findOne({
        where: { user_id: application.user_id, counsellor_id: counsellorRecordId },
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
message: `Your application for ${universityName} (${finalCourseName}) has been deleted.`,
        timestamp: new Date().toISOString(),
      });

      await storeNotification(
        student.id,
        "application_deleted",
        `Your application for ${universityName} (${finalCourseName}) has been deleted.`,
        {
          applicationId: application.id,
          university: universityName,
          course: finalCourseName,
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

    const lead = await Lead.findOne({
      where: { user_id: application.user_id },
    });
    await logActivity({
      leadId: lead.id,
      actionType: "application_deleted",
    note: `Application deleted for ${universityName}`,
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

// ✅ updateApplicationStatusAsCounsellor
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
 const universityRow = await db.University.findByPk(application.university_id, {
      attributes: ["name"],
    });
    const courseNameResolved = await getConfigNameById(application.course_id, "course");
    const universityName = universityRow?.name || "N/A";
    const finalCourseName = courseNameResolved || "N/A";
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

   const notificationMessage = `Your application for ${universityName} (${finalCourseName}) status changed from "${statusDisplayMap[oldStatus] || oldStatus}" to "${statusDisplayMap[status] || status}".`;

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
          university: universityName,
          course: finalCourseName,
          updatedBy: req.user.name,
          counselorNotes: counsellor_notes || null,
        },
      );
    }

    const lead = await Lead.findOne({
      where: { user_id: application.user_id },
    });
    if (lead) {
      await logActivity({
        leadId: lead.id,
        actionType: "application_status_changed",
        fromValue: oldStatus,
        toValue: status,
        note: `Application status changed from ${oldStatus} to ${status}`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
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

// ✅ getApplicationStats
export const getApplicationStats = async (req, res) => {
  try {
    const stats = await Application.findAll({
      attributes: [
        "status",
        [db.sequelize.fn("COUNT", db.sequelize.col("status")), "count"],
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