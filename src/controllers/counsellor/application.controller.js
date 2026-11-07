// src/controllers/counsellor/application.controller.js
import jwt from "jsonwebtoken";
import db from "../../models/mysql/index.js";
import { logActivity } from "../../services/activityLog.service.js";
import { logApplicationActivity } from "../../services/applicationActivityLog.service.js";
import { Op } from "sequelize";
import rawDb from "../../config/db.js";
import sseManager from "../../utils/sseManager.js";
import {
  sendApplicationSubmittedEmail,
  sendOfferReceivedEmail,
  sendFeeSubmittedEmail,
  sendVisaFiledEmail,
  sendVisaApprovedEmail,
  sendApplicationRejectedEmail,
  sendDebitNotificationEmail,
  sendNoteAddedEmail,
  sendPasswordSetupEmail,
} from "../../services/email.service.js";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_DATE_MAP,
  APPLICATION_STATUS_DISPLAY_MAP,
} from "../../constants/applicationStatus.js";
import { sendApplicationAssignmentEmail } from "../../services/processingOfficerEmail.service.js";

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
  const [rows] = await rawDb.query(
    'SELECT name FROM config_values WHERE id = ? AND type = ?',
    [id, type]
  );
  return rows?.[0]?.name || '';
}

// Resolves a free-typed name to a config_values row for the given type,
// creating one on the fly if it doesn't exist yet (e.g. a new course name).
async function resolveOrCreateConfigValue(name, type, userId) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;

  const [existing] = await rawDb.query(
    "SELECT id FROM config_values WHERE type = ? AND LOWER(name) = LOWER(?) AND is_deleted = 0 LIMIT 1",
    [type, trimmed]
  );
  if (existing?.[0]?.id) return existing[0].id;

  const [result] = await rawDb.query(
    "INSERT INTO config_values (name, type, is_active, is_deleted, sort_order, user_id) VALUES (?, ?, 1, 0, 0, ?)",
    [trimmed, type, userId || null]
  );
  return result?.insertId || null;
}

// A processing officer (or admin) acting on an application — status change,
// note, edit — should also reach the lead's assigned counsellor, who has
// view-only access to the application but otherwise has no visibility into
// what the officer is doing with their lead.
async function notifyLeadCounsellorOfApplicationEvent(applicationId, actor, { type, message }) {
  try {
    const [rows] = await rawDb.query(
      `SELECT u.id AS user_id
       FROM applications a
       INNER JOIN leads l ON l.id = a.lead_id
       INNER JOIN counsellors c ON c.id = l.counsellor_id AND c.is_deleted = 0
       INNER JOIN users u ON u.id = c.user_id
       WHERE a.id = ?`,
      [applicationId],
    );
    const counsellorUserId = rows?.[0]?.user_id;
    if (!counsellorUserId || counsellorUserId === actor.id) return;

    await storeNotification(counsellorUserId, type, message, { applicationId });
    sseManager.sendToUser(counsellorUserId.toString(), {
      type,
      message,
      applicationId,
    });
  } catch (err) {
    console.error("⚠️ Failed to notify lead's counsellor of application event:", err);
  }
}

// Notify every admin of an application event — skips the acting user if
// they're themselves an admin, so an admin's own action doesn't notify them.
async function notifyAllAdmins(actor, { type, message, applicationId }) {
  try {
    const admins = await User.findAll({
      where: { role: "admin", is_active: true },
      attributes: ["id"],
    });
    for (const admin of admins) {
      if (admin.id === actor.id) continue;
      await storeNotification(admin.id, type, message, { applicationId });
      sseManager.sendToUser(admin.id.toString(), { type, message, applicationId });
    }
  } catch (err) {
    console.error("⚠️ Failed to notify admins of application event:", err);
  }
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
      case "application submitted":
        await sendApplicationSubmittedEmail({ name, email, university, course, applicationId: appId });
        break;
      case "offer letter":
        await sendOfferReceivedEmail({ name, email, university, course, applicationId: appId });
        break;
      case "fee submitted":
        await sendFeeSubmittedEmail({ name, email, university, course, applicationId: appId });
        break;
      case "visa filed":
        await sendVisaFiledEmail({ name, email, university, course, applicationId: appId, visaCenter: null });
        break;
      case "approved":
        await sendVisaApprovedEmail({ name, email, university, course, applicationId: appId });
        break;
      case "rejected":
        const reason = application.counsellor_notes || "The application did not meet the requirements.";
        await sendApplicationRejectedEmail({ name, email, university, course, applicationId: appId, reason });
        break;
      default:
        return;
    }
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
              'processing_officer_id', a.processing_officer_id,
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
// ✅ getOfficerApplications - applications assigned to the logged-in processing officer
export const getOfficerApplications = async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    let officerId = null;

    if (!isAdmin) {
      const [officerRows] = await rawDb.query(
        "SELECT id FROM processing_officers WHERE user_id = ? AND is_deleted = 0",
        [req.user.id],
      );
      if (!officerRows || officerRows.length === 0) {
        return res.json({ success: true, applications: [], count: 0 });
      }
      officerId = officerRows[0].id;
    }

    const baseQuery = `
      SELECT
        a.id, a.lead_id, a.user_id, a.status, a.deadline, a.consultancy_fee,
        a.counsellor_notes, a.created_at,
        a.country_id, a.city_id, a.university_id, a.course_id, a.processing_officer_id,
        l.name AS student_name, l.email AS student_email, l.phone AS student_phone,
        u.name AS university_name,
        cv.name AS course_name,
        c.name AS country_name
      FROM applications a
      LEFT JOIN leads l ON a.lead_id = l.id
      LEFT JOIN universities u ON a.university_id = u.id
      LEFT JOIN config_values cv ON a.course_id = cv.id
      LEFT JOIN countries c ON a.country_id = c.id
      WHERE a.is_deleted = 0
        ${isAdmin ? "" : "AND a.processing_officer_id = ?"}
      ORDER BY a.created_at DESC
    `;
    const queryParams = isAdmin ? [] : [officerId];
    const [applications] = await rawDb.query(baseQuery, queryParams);

    res.json({ success: true, applications: applications || [], count: applications?.length || 0 });
  } catch (error) {
    console.error("Error fetching officer applications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch applications",
      error: error.message,
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
      counsellor_notes: app.counsellor_notes,
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
    const { user_id, consultancy_fee, new_student, ...applicationData } = req.body;

    const requesterId = req.user?.id;
    const isAdmin = req.user?.role === "admin";

    const leadAttributes = [
      "id",
      "user_id",
      "name",
      "email",
      "phone",
      "status",
      "counsellor_id",
      "is_ready_for_application",
      "assigned_processing_officer_id",
    ];

    let lead;

    if (!user_id) {
      // Admin-only: create an application with no pre-existing lead — the
      // system creates a bare Lead + student User account together.
      if (!isAdmin) {
        return res
          .status(400)
          .json({ success: false, message: "user_id is required" });
      }
      if (!new_student?.name || !new_student?.email) {
        return res.status(400).json({
          success: false,
          message: "new_student.name and new_student.email are required when creating an application without a lead.",
        });
      }

      let student = await User.findOne({
        where: { email: new_student.email, role: "student" },
      });
      if (!student) {
        student = await User.create({
          name: new_student.name,
          email: new_student.email,
          password_hash: "PENDING_SETUP",
          role: "student",
          is_active: false,
        });
      }

      const created = await Lead.create({
        name: new_student.name,
        email: new_student.email,
        phone: new_student.phone || null,
        preferred_country: new_student.preferred_country || null,
        status: "converted",
        is_ready_for_application: 1,
        user_id: student.id,
        has_entered_counseling: 1,
        is_deleted: 0,
      });

      lead = await Lead.findOne({ where: { id: created.id }, attributes: leadAttributes });

      await logActivity({
        leadId: lead.id,
        actionType: "lead_created",
        note: `Lead auto-created by admin while creating a direct application (no pre-existing lead)`,
        performedBy: requesterId,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });

      try {
        // JWT, not a random token — matches what /setup-password's verify
        // endpoint (verifySetupToken/setupPassword in auth.controller.js)
        // actually checks via jwt.verify(). A random hex string always
        // failed that (it isn't a JWT at all), reporting "Invalid or
        // expired token" on the very first click every time.
        const token = jwt.sign(
          { id: student.id, email: student.email, role: "student", purpose: "setup" },
          process.env.JWT_SECRET,
          { expiresIn: "24h" },
        );
        const setupLink = `${process.env.FRONTEND_URL}/setup-password?token=${token}`;
        await sendPasswordSetupEmail({
          name: new_student.name,
          email: new_student.email,
          setupLink,
        });
      } catch (setupErr) {
        console.error("⚠️ Failed to send password setup email for direct application:", setupErr);
      }
    } else {
      lead = await Lead.findOne({
        where: { id: user_id, is_deleted: false },
        attributes: leadAttributes,
      });
    }

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
    let creatingOfficerId = null;
    if (!isAdmin) {
      // Only a processing officer (never a counsellor) can create an application,
      // and only for a lead that's converted, ready, and assigned to them.
      const [officerRows] = await rawDb.query(
        "SELECT id FROM processing_officers WHERE user_id = ? AND is_deleted = 0 LIMIT 1",
        [requesterId]
      );
      creatingOfficerId = officerRows?.[0]?.id || null;

      if (lead.status !== "converted") {
        return res.status(400).json({
          success: false,
          message: "Lead must be converted before an application can be created.",
        });
      }
      if (!lead.is_ready_for_application) {
        return res.status(400).json({
          success: false,
          message: "Lead has not been marked ready for application.",
        });
      }
      if (!creatingOfficerId || lead.assigned_processing_officer_id !== creatingOfficerId) {
        return res
          .status(403)
          .json({ success: false, message: "This lead is not assigned to you." });
      }
    } else {
      creatingOfficerId = lead.assigned_processing_officer_id || null;
    }

    let resolvedCourseId = req.body.course_id ? parseInt(req.body.course_id) : null;
    if (req.body.course_name && !Number.isInteger(resolvedCourseId)) {
      resolvedCourseId = await resolveOrCreateConfigValue(
        req.body.course_name,
        "course",
        requesterId
      );
    }
    if (!resolvedCourseId) {
      return res.status(400).json({
        success: false,
        message: "Course is required.",
      });
    }

    const application = await Application.create({
      lead_id: lead.id,
      user_id: lead.user_id,
      country_id: parseInt(req.body.country_id),
      city_id: parseInt(req.body.city_id),
      university_id: parseInt(req.body.university_id),
      course_id: resolvedCourseId,
      deadline: applicationData.deadline || null,
      status: applicationData.status || "application submitted",
      counsellor_notes: applicationData.counsellor_notes || null,
      consultancy_fee: feeNum,
      processing_officer_id: creatingOfficerId,
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

    await sendStatusUpdateEmail(application, "application submitted");

    await logApplicationActivity({
      applicationId: application.id,
      studentId: application.user_id,
      actionType: "application_created",
      note: `Application created for ${lead.name} → ${universityName} (${finalCourseName})`,
      performedBy: requesterId,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    const student = await User.findByPk(lead.user_id, {
      attributes: ["id", "name", "email"],
    });
    try {
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
        where: { role: "admin", is_active: true },
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
    } catch (notifErr) {
      // Never fail the application creation because a notification could not be stored
      console.error(
        "⚠️ Failed to send application_created notifications:",
        notifErr,
      );
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
    const isAdmin = req.user?.role === "admin";
    const {
      user_id,
      country_id,
      city_id,
      university_id,
      course_id: rawCourseId,
      course_name,
      deadline,
      status,
      counsellor_notes,
      consultancy_fee,
    } = req.body;

    if (status !== undefined && !APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${APPLICATION_STATUSES.join(", ")}`,
      });
    }

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

    if (
      ["approved", "rejected"].includes(application.status) &&
      status !== undefined &&
      status !== application.status
    ) {
      return res.status(400).json({
        success: false,
        message: `This application is already "${application.status}" — a final decision has been made and it can no longer be changed.`,
      });
    }

    // Check permissions — counsellor is view-only on applications; only the
    // assigned processing officer (or admin) may edit.
    if (!isAdmin) {
      if (req.user.role === "counsellor") {
        return res.status(403).json({
          success: false,
          message: "Counsellors have view-only access to applications.",
        });
      }

      const [officerRows] = await rawDb.query(
        "SELECT id FROM processing_officers WHERE user_id = ? AND is_deleted = 0 LIMIT 1",
        [req.user.id]
      );
      const officerRecordId = officerRows?.[0]?.id;

      if (!officerRecordId || application.processing_officer_id !== officerRecordId) {
        return res.status(403).json({
          success: false,
          message: "Access denied - Application not assigned to you",
        });
      }
    }

    let course_id = rawCourseId !== undefined ? parseInt(rawCourseId) : undefined;
    if (course_name && !Number.isInteger(course_id)) {
      course_id = await resolveOrCreateConfigValue(
        course_name,
        "course",
        req.user?.id
      );
    }

    const oldStatus = application.status;

    // Build a per-field diff (same convention as updateLead) so the log shows
    // what actually changed — not just a status transition that may not have
    // even happened if only e.g. the fee or deadline was edited.
    const editableFields = {
      country_id, city_id, university_id, course_id,
      deadline, status, counsellor_notes, consultancy_fee,
    };
    const changes = [];
    Object.entries(editableFields).forEach(([field, newVal]) => {
      if (newVal === undefined) return;
      const oldVal = application[field];
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        changes.push(`${field}: "${oldVal ?? "—"}" → "${newVal ?? "—"}"`);
      }
    });

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

    // Notify the student too — this endpoint previously only emailed them on
    // a status change and said nothing at all for any other field edit.
    if (application.user_id) {
      const studentMessage =
        status && status !== oldStatus
          ? `Your application status changed from "${APPLICATION_STATUS_DISPLAY_MAP[oldStatus] || oldStatus}" to "${APPLICATION_STATUS_DISPLAY_MAP[status] || status}".`
          : `Your application details were updated.`;
      const studentNotifType = status && status !== oldStatus ? "status_change" : "application_updated";

      await storeNotification(application.user_id, studentNotifType, studentMessage, {
        applicationId: application.id,
        oldStatus,
        newStatus: status ?? oldStatus,
      });
      sseManager.sendToUser(application.user_id, {
        type: studentNotifType,
        applicationId: application.id,
        message: studentMessage,
        timestamp: new Date().toISOString(),
      });
    }

    // Log activity
    const updateNote = changes.length > 0 ? `Updated — ${changes.join(" · ")}` : "Application details updated";
    await logApplicationActivity({
      applicationId: id,
      studentId: application.user_id,
      actionType: "application_updated",
      fromValue: oldStatus,
      toValue: status ?? oldStatus,
      note: updateNote,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    const editStudentRow = await User.findByPk(application.user_id, { attributes: ["name"] });
    const editSubjectLabel = `${editStudentRow?.name || "Student"}'s application`;

    await notifyLeadCounsellorOfApplicationEvent(id, req.user, {
      type: "application_updated",
      message: `${req.user.name || "Someone"} edited ${editSubjectLabel} — ${updateNote}`,
    });

    // Notify the assigned processing officer too (e.g. when admin edits an
    // application that's actually assigned to an officer) — skip when the
    // officer is the one who made the edit themselves.
    if (application.processing_officer_id) {
      try {
        const [officerRows] = await rawDb.query(
          `SELECT u.id AS user_id
           FROM processing_officers p
           INNER JOIN users u ON u.id = p.user_id
           WHERE p.id = ? AND p.is_deleted = 0`,
          [application.processing_officer_id],
        );
        const officerUserId = officerRows?.[0]?.user_id;
        if (officerUserId && officerUserId !== req.user.id) {
          const officerMessage = `${req.user.name || "Someone"} edited ${editSubjectLabel} — ${updateNote}`;
          await storeNotification(officerUserId, "application_updated", officerMessage, {
            applicationId: application.id,
          });
          sseManager.sendToUser(officerUserId.toString(), {
            type: "application_updated",
            message: officerMessage,
            applicationId: application.id,
          });
        }
      } catch (notifErr) {
        console.error("⚠️ Failed to notify officer of application update:", notifErr);
      }
    }

    await notifyAllAdmins(req.user, {
      type: "application_updated",
      message: `${req.user.name || "Someone"} edited ${editSubjectLabel} — ${updateNote}`,
      applicationId: application.id,
    });

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
// ──────────────────────────────────────────────────────────────────────────────
// ASSIGN / REASSIGN AN APPLICATION TO A PROCESSING OFFICER (admin-only)
// ──────────────────────────────────────────────────────────────────────────────
export const assignApplicationOfficer = async (req, res) => {
  try {
    const { id } = req.params;
    const newOfficerId = req.body.processing_officer_id
      ? Number(req.body.processing_officer_id)
      : null;

    const application = await Application.findByPk(id);
    if (!application) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

    const [previousRows] = await rawDb.query(
      `SELECT u.name, u.email
       FROM processing_officers p
       INNER JOIN users u ON u.id = p.user_id
       WHERE p.id = ? AND p.is_deleted = 0`,
      [application.processing_officer_id],
    );

    const [officerRows] = newOfficerId
      ? await rawDb.query(
          `SELECT p.id AS officer_id, u.id AS user_id, u.name, u.email
           FROM processing_officers p
           INNER JOIN users u ON u.id = p.user_id
           WHERE p.id = ? AND p.is_deleted = 0`,
          [newOfficerId],
        )
      : [[]];

    const officer = officerRows[0];
    if (newOfficerId && !officer) {
      return res.status(404).json({ success: false, message: "Processing officer not found." });
    }

    await Application.update(
      { processing_officer_id: newOfficerId },
      { where: { id: application.id } },
    );

    await logApplicationActivity({
      applicationId: application.id,
      studentId: application.user_id,
      actionType: "processing_officer_assigned",
      fromValue: previousRows[0]?.name || "Unassigned",
      toValue: officer?.name || "Unassigned",
      note: newOfficerId
        ? `Application #${application.id} assigned to processing officer: ${officer?.name || "Unknown"}`
        : `Application #${application.id} unassigned from processing officer`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    if (officer?.user_id) {
      const universityRow = await db.University.findByPk(application.university_id, {
        attributes: ["name"],
      });
      const courseNameResolved = await getConfigNameById(application.course_id, "course");
      const studentRow = await User.findByPk(application.user_id, { attributes: ["name"] });
      const studentName = studentRow?.name || "Student";

      await storeNotification(
        officer.user_id,
        "application_assigned",
        `${studentName}'s application has been assigned to you.`,
        { applicationId: application.id, studentName },
      );
      sseManager.sendToUser(officer.user_id.toString(), {
        type: "application_assigned",
        message: `${studentName}'s application has been assigned to you.`,
        applicationId: application.id,
      });

      if (officer.email) {
        await sendApplicationAssignmentEmail({
          officerEmail: officer.email,
          officerName: officer.name,
          application,
          studentName,
          universityName: universityRow?.name,
          courseName: courseNameResolved,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Processing officer assignment updated.",
      data: {
        application_id: application.id,
        processing_officer_id: newOfficerId,
        previous_officer: previousRows[0]?.name || null,
        new_officer: officer?.name || null,
      },
    });
  } catch (error) {
    console.error("❌ Application officer assignment error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// ADD APPLICATION NOTE — independent of status, multiple notes allowed
// ──────────────────────────────────────────────────────────────────────────────
export const addApplicationNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, message: "Note is required." });
    }

    const application = await Application.findByPk(id);
    if (!application) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

    if (req.user.role !== "admin") {
      if (req.user.role === "processing_officer") {
        const [officerRows] = await rawDb.query(
          "SELECT id FROM processing_officers WHERE user_id = ? AND is_deleted = 0 LIMIT 1",
          [req.user.id],
        );
        const officerRecordId = officerRows?.[0]?.id;
        if (!officerRecordId || application.processing_officer_id !== officerRecordId) {
          return res.status(403).json({ success: false, message: "This application is not assigned to you." });
        }
      } else if (req.user.role === "counsellor") {
        // Counsellors may add notes (view-only otherwise), but only on
        // applications belonging to their own leads.
        const [counsellorRows] = await rawDb.query(
          "SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0 LIMIT 1",
          [req.user.id],
        );
        const counsellorRecordId = counsellorRows?.[0]?.id;
        const [leadRows] = await rawDb.query(
          "SELECT id FROM leads WHERE user_id = ? AND counsellor_id = ? AND is_deleted = 0",
          [application.user_id, counsellorRecordId],
        );
        if (!counsellorRecordId || !leadRows || leadRows.length === 0) {
          return res.status(403).json({ success: false, message: "Application not yours" });
        }
      }
    }

    await logApplicationActivity({
      applicationId: application.id,
      studentId: application.user_id,
      actionType: "note_added",
      note,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    const noteStudentRow = await User.findByPk(application.user_id, { attributes: ["name"] });
    const noteStudentName = noteStudentRow?.name || "Student";
    const subjectLabel = `${noteStudentName}'s application`;

    // Notify the assigned processing officer, skipping self-notification.
    if (application.processing_officer_id) {
      try {
        const [rows] = await rawDb.query(
          `SELECT u.id AS user_id, u.name, u.email
           FROM processing_officers p
           INNER JOIN users u ON u.id = p.user_id
           WHERE p.id = ? AND p.is_deleted = 0`,
          [application.processing_officer_id],
        );
        const officer = rows[0];
        if (officer && officer.user_id && officer.user_id !== req.user.id) {
          const message = `${req.user.name || "Someone"} added a note on ${subjectLabel}.`;
          await storeNotification(officer.user_id, "application_note_added", message, {
            applicationId: application.id,
            studentName: noteStudentName,
            note,
          });
          sseManager.sendToUser(officer.user_id.toString(), {
            type: "application_note_added",
            message,
            applicationId: application.id,
          });
          if (officer.email) {
            await sendNoteAddedEmail({
              recipientName: officer.name,
              recipientEmail: officer.email,
              addedByName: req.user.name,
              subjectLabel,
              notePreview: note,
              portalLink: `${process.env.FRONTEND_URL}/processingOfficer/applications`,
            });
          }
        }
      } catch (notifErr) {
        console.error("⚠️ Failed to notify officer of application note:", notifErr);
      }
    }

    await notifyLeadCounsellorOfApplicationEvent(application.id, req.user, {
      type: "application_note_added",
      message: `${req.user.name || "Someone"} added a note on ${subjectLabel}.`,
    });

    await notifyAllAdmins(req.user, {
      type: "application_note_added",
      message: `${req.user.name || "Someone"} added a note on ${subjectLabel}.`,
      applicationId: application.id,
    });

    res.json({ success: true, message: "Note added successfully" });
  } catch (error) {
    console.error("❌ addApplicationNote error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

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
      if (req.user.role === "counsellor") {
        return res.status(403).json({
          success: false,
          message: "Counsellors have view-only access to applications.",
        });
      }

      const [officerRows] = await rawDb.query(
        "SELECT id FROM processing_officers WHERE user_id = ? AND is_deleted = 0 LIMIT 1",
        [req.user.id]
      );
      const officerRecordId = officerRows?.[0]?.id;

      if (!officerRecordId || application.processing_officer_id !== officerRecordId) {
        return res.status(403).json({
          success: false,
          message: "Access denied - Application not assigned to you",
        });
      }
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

    await logApplicationActivity({
      applicationId: id,
      studentId: application.user_id,
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

    if (!APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${APPLICATION_STATUSES.join(", ")}`,
      });
    }

    const application = await Application.findByPk(applicationId);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    if (["approved", "rejected"].includes(application.status)) {
      return res.status(400).json({
        success: false,
        message: `This application is already "${application.status}" — a final decision has been made and it can no longer be changed.`,
      });
    }

    if (req.user.role !== "admin") {
      if (req.user.role === "counsellor") {
        return res.status(403).json({
          success: false,
          message: "Counsellors have view-only access to applications.",
        });
      }

      const [officerRows] = await rawDb.query(
        "SELECT id FROM processing_officers WHERE user_id = ? AND is_deleted = 0 LIMIT 1",
        [req.user.id]
      );
      const officerRecordId = officerRows?.[0]?.id;

      if (!officerRecordId || application.processing_officer_id !== officerRecordId) {
        return res.status(403).json({
          success: false,
          message: "Access denied - Application not assigned to you",
        });
      }
    }

 const universityRow = await db.University.findByPk(application.university_id, {
      attributes: ["name"],
    });
    const courseNameResolved = await getConfigNameById(application.course_id, "course");
    const universityName = universityRow?.name || "N/A";
    const finalCourseName = courseNameResolved || "N/A";
    const oldStatus = application.status;

    const updateData = {
      status: status,
      counsellor_notes: counsellor_notes || application.counsellor_notes,
    };

    if (APPLICATION_STATUS_DATE_MAP[status]) {
      updateData[APPLICATION_STATUS_DATE_MAP[status]] = new Date();
    }

    await Application.update(updateData, { where: { id: applicationId } });
    const updatedApplication = await Application.findByPk(applicationId);

    if (status !== oldStatus) {
      await sendStatusUpdateEmail(updatedApplication, status, oldStatus);
    }

    const student = await User.findByPk(application.user_id, {
      attributes: ["id", "name", "email"],
    });

   const notificationMessage = `Your application for ${universityName} (${finalCourseName}) status changed from "${APPLICATION_STATUS_DISPLAY_MAP[oldStatus] || oldStatus}" to "${APPLICATION_STATUS_DISPLAY_MAP[status] || status}".`;

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

    await logApplicationActivity({
      applicationId: application.id,
      studentId: application.user_id,
      actionType: "application_status_changed",
      fromValue: oldStatus,
      toValue: status,
      note: `Application status changed from ${oldStatus} to ${status}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    const statusSubjectLabel = `${student?.name || "Student"}'s application`;

    await notifyLeadCounsellorOfApplicationEvent(application.id, req.user, {
      type: "application_status_changed",
      message: `${req.user.name || "Someone"} changed ${statusSubjectLabel}'s status from "${APPLICATION_STATUS_DISPLAY_MAP[oldStatus] || oldStatus}" to "${APPLICATION_STATUS_DISPLAY_MAP[status] || status}".`,
    });

    if (application.processing_officer_id) {
      try {
        const [officerRows] = await rawDb.query(
          `SELECT u.id AS user_id
           FROM processing_officers p
           INNER JOIN users u ON u.id = p.user_id
           WHERE p.id = ? AND p.is_deleted = 0`,
          [application.processing_officer_id],
        );
        const officerUserId = officerRows?.[0]?.user_id;
        if (officerUserId && officerUserId !== req.user.id) {
          const officerMessage = `${req.user.name || "Someone"} changed ${statusSubjectLabel}'s status from "${APPLICATION_STATUS_DISPLAY_MAP[oldStatus] || oldStatus}" to "${APPLICATION_STATUS_DISPLAY_MAP[status] || status}".`;
          await storeNotification(officerUserId, "application_status_changed", officerMessage, {
            applicationId: application.id,
            oldStatus,
            newStatus: status,
          });
          sseManager.sendToUser(officerUserId.toString(), {
            type: "application_status_changed",
            message: officerMessage,
            applicationId: application.id,
          });
        }
      } catch (notifErr) {
        console.error("⚠️ Failed to notify officer of status change:", notifErr);
      }
    }

    await notifyAllAdmins(req.user, {
      type: "application_status_changed",
      message: `${req.user.name || "Someone"} changed ${statusSubjectLabel}'s status from "${APPLICATION_STATUS_DISPLAY_MAP[oldStatus] || oldStatus}" to "${APPLICATION_STATUS_DISPLAY_MAP[status] || status}".`,
      applicationId: application.id,
    });

    res.json({
      success: true,
      message: `Application status updated to ${status}.`,
      application: updatedApplication,
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
      applicationSubmitted: 0,
      offerLetter: 0,
      feeSubmitted: 0,
      visaFiled: 0,
      approved: 0,
      rejected: 0,
    };

    stats.forEach((stat) => {
      const count = parseInt(stat.dataValues.count);
      result.total += count;

      switch (stat.status) {
        case "application submitted":
          result.applicationSubmitted = count;
          break;
        case "offer letter":
          result.offerLetter = count;
          break;
        case "fee submitted":
          result.feeSubmitted = count;
          break;
        case "visa filed":
          result.visaFiled = count;
          break;
        case "approved":
          result.approved = count;
          break;
        case "rejected":
          result.rejected = count;
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