import rawDb from "../../config/db.js";
import { uploadFile } from "../../services/fileUpload.service.js";
import { storeNotification } from "../../utils/notificationHelper.js";
import sseManager from "../../utils/sseManager.js";

// ✅ Helper: resolve the logged-in student's lead record
async function getLeadForUser(userId) {
  const [leadRows] = await rawDb.query(
    "SELECT * FROM leads WHERE user_id = ? AND is_deleted = 0",
    [userId]
  );
  return leadRows?.[0] || null;
}

async function getLeadIdsForUser(userId, userName, userEmail) {
  const values = [userId];
  const conditions = ["user_id = ?"];

  if (userName) {
    conditions.push("LOWER(name) = LOWER(?)");
    values.push(userName);
  }

  if (userEmail) {
    conditions.push("email = ?");
    values.push(userEmail);
  }

  const [leadRows] = await rawDb.query(
    `SELECT id FROM leads WHERE is_deleted = 0 AND (${conditions.join(" OR ")})`,
    values
  );

  return (leadRows || []).map((row) => row.id);
}

// ✅ GET /student/applications - student sees their own applications
// ✅ GET /student/applications - student sees their own applications
export const getMyApplications = async (req, res) => {
  try {
    const userId = req.user.id;
    const lead = await getLeadForUser(userId);
    const leadId = lead?.id || null;
    const leadIds = await getLeadIdsForUser(userId, req.user?.name, req.user?.email);
    const leadIdList = [...new Set([leadId, ...leadIds].filter(Boolean))];

    const query = `
      SELECT
        a.id,
        a.lead_id,
        a.user_id,
        a.country_id,
        a.city_id,
        a.university_id,
        a.course_id,
        u.name AS target_university,
        cv.name AS course,
        c.name AS target_country,
        a.deadline,
        a.status,
        a.consultancy_fee,
        a.counsellor_notes,
        a.created_at,
        COALESCE(
          (SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', d.id,
              'application_id', d.application_id,
              'doc_type', dcv.name,
              'doc_type_id', d.doc_value,
              'file_path', d.file_path,
              'file_url', d.file_path,
              'status', d.status,
              'submitted_at', d.created_at,
              'created_at', d.created_at,
              'reviewed_at', d.reviewed_at,
              'rejection_reason', d.rejection_reason,
              'notes', d.notes,
              'uploaded_by', d.uploaded_by
            )
          )
          FROM student_documents d
          LEFT JOIN config_values dcv ON d.doc_value = dcv.id
          WHERE d.application_id = a.id AND d.is_deleted = 0
          ), JSON_ARRAY()
        ) AS documents
      FROM applications a
      LEFT JOIN universities u ON a.university_id = u.id
      LEFT JOIN countries c ON a.country_id = c.id
      LEFT JOIN config_values cv ON a.course_id = cv.id
      WHERE a.is_deleted = 0 AND (
        a.user_id = ? OR ${leadIdList.length > 0 ? `a.lead_id IN (${leadIdList.map(() => '?').join(',')})` : '0'}
      )
      ORDER BY a.created_at DESC
    `;

    const [rows] = await rawDb.query(query, [userId, ...leadIdList]);

    const applications = rows.map((app) => {
      let documents = [];
      if (app.documents) {
        documents =
          typeof app.documents === "string"
            ? JSON.parse(app.documents)
            : app.documents;
        documents = Array.isArray(documents)
          ? documents.filter((d) => d && d.id)
          : [];
      }
      return { ...app, documents };
    });

    res.json({ success: true, applications });
  } catch (error) {
    console.error("Error fetching student applications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch applications",
      error: error.message,
    });
  }
};

// ✅ GET /student/documents?application_id=X - student sees docs for one application
export const getMyDocuments = async (req, res) => {
  try {
    const { application_id } = req.query;

    if (!application_id) {
      return res.status(400).json({
        success: false,
        message: "application_id is required",
      });
    }

    const lead = await getLeadForUser(req.user.id);
    if (!lead) {
      return res.json({ success: true, documents: [] });
    }

    // ✅ Ownership check - application must belong to this student
    const [appRows] = await rawDb.query(
      "SELECT id FROM applications WHERE id = ? AND lead_id = ? AND is_deleted = 0",
      [application_id, lead.id]
    );

    if (!appRows || appRows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Application not found or not yours",
      });
    }

    const [docs] = await rawDb.query(
      `SELECT
         d.id,
         d.application_id,
         dcv.name AS doc_type,
         d.doc_value AS doc_type_id,
         d.file_path,
         d.file_path AS file_url,
         d.status,
         d.created_at AS submitted_at,
         d.created_at,
         d.reviewed_at,
         d.rejection_reason,
         d.notes,
         d.uploaded_by
       FROM student_documents d
       LEFT JOIN config_values dcv ON d.doc_value = dcv.id
       WHERE d.application_id = ? AND d.is_deleted = 0
       ORDER BY d.created_at DESC`,
      [application_id]
    );

    res.json({ success: true, documents: docs || [] });
  } catch (error) {
    console.error("Error fetching student documents:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch documents",
      error: error.message,
    });
  }
};

// ✅ POST /student/documents/upload - student uploads for their OWN application
export const uploadDocument = async (req, res) => {
  try {
    const { application_id, doc_type, notes } = req.body;
    const file = req.file;
    const userId = req.user.id;

    if (!file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    if (!application_id) {
      return res.status(400).json({ success: false, message: "application_id is required" });
    }
    if (!doc_type) {
      return res.status(400).json({ success: false, message: "Document type is required" });
    }

    const lead = await getLeadForUser(userId);
    if (!lead) {
      return res.status(403).json({
        success: false,
        message: "Student record not found for this account",
      });
    }

    // ✅ Ownership check - application must be theirs
    const [appRows] = await rawDb.query(
      "SELECT * FROM applications WHERE id = ? AND lead_id = ? AND is_deleted = 0",
      [parseInt(application_id), lead.id]
    );

    if (!appRows || appRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Application not found or not yours",
      });
    }

    // ✅ Resolve doc_type name -> config_values id (same lookup as counsellor upload)
    const [configRows] = await rawDb.query(
      'SELECT id FROM config_values WHERE type = "document_type" AND LOWER(name) = LOWER(?) AND is_deleted = 0',
      [doc_type]
    );

    if (!configRows || configRows.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid document type" });
    }

    const docValueId = configRows[0].id;

    const { fileUrl } = await uploadFile(file, lead.id, doc_type);

    // ✅ Student uploads go in as 'pending' — NOT auto-verified like counsellor uploads
    const [result] = await rawDb.query(
      `INSERT INTO student_documents
        (student_id, application_id, doc_value, file_path, status, uploaded_by, uploaded_by_id, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', 'student', ?, ?, NOW(), NOW())`,
      [lead.id, parseInt(application_id), docValueId, fileUrl, userId, notes || null]
    );

    const documentId = result.insertId;

    await rawDb.query(
      `INSERT INTO lead_activity_logs
        (lead_id, action_type, note, user_id, created_at, updated_at)
       VALUES (?, 'document_uploaded', ?, ?, NOW(), NOW())`,
      [lead.id, `Student uploaded ${doc_type} document`, userId]
    );

    // ✅ Notify assigned counsellor (best-effort)
    if (lead.counsellor_id) {
      try {
        const [counsellorRows] = await rawDb.query(
          "SELECT user_id FROM counsellors WHERE id = ? AND is_deleted = 0",
          [lead.counsellor_id]
        );
        const counsellorUserId = counsellorRows?.[0]?.user_id;
        if (counsellorUserId) {
          const message = `${lead.name} uploaded a new document (${doc_type}) for review.`;
          sseManager.sendToUser(counsellorUserId, {
            type: "document_uploaded_by_student",
            documentId,
            applicationId: parseInt(application_id),
            message,
            timestamp: new Date().toISOString(),
          });
          await storeNotification(counsellorUserId, "document_uploaded_by_student", message, {
            documentId,
            applicationId: parseInt(application_id),
            docType: doc_type,
            studentId: lead.id,
            studentName: lead.name,
          });
        }
      } catch (notifyErr) {
        console.error("Failed to notify counsellor of student upload:", notifyErr);
      }
    }

    const [docRows] = await rawDb.query(
      "SELECT * FROM student_documents WHERE id = ?",
      [documentId]
    );

    res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      document: docRows[0],
    });
  } catch (error) {
    console.error("Student upload error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload document",
    });
  }
};