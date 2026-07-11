// src/controllers/student/document.controller.js

import rawDb from "../../config/db.js";
import { uploadFile, deleteFile } from "../../services/fileUpload.service.js";
import { logActivity } from "../../services/activityLog.service.js";

const ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_SIZE = 5 * 1024 * 1024;

async function getLeadForUser(userId, userEmail) {
  const [leadRows] = await rawDb.query(
    "SELECT * FROM leads WHERE (user_id = ? OR email = ?) AND is_deleted = 0 LIMIT 1",
    [userId, userEmail],
  );
  return leadRows?.[0] || null;
}

// ============================================
// ✅ 1. GET DOCUMENT TYPES (For Dynamic Dropdown)
// ============================================
export async function getDocumentTypes(req, res) {
  try {
    const [types] = await rawDb.query(
      `SELECT 
        id, 
        name, 
        type, 
        value, 
        is_active 
       FROM config_values 
       WHERE type = 'document_type' 
       AND is_deleted = 0 
       ORDER BY name ASC`
    );

    // Format for frontend
    const formattedTypes = types.map((t) => ({
      id: t.id,
      name: t.name,
      label: t.name,
      key: t.name.toLowerCase().replace(/\s+/g, "_"),
      is_active: t.is_active !== 0,
    }));

    res.json({
      success: true,
      data: formattedTypes,
    });
  } catch (error) {
    console.error("Get document types error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

// ============================================
// ✅ 2. GET STUDENTS WITH APPLICATIONS & DOCUMENTS
// ============================================
export async function getStudentsWithApplications(req, res) {
  try {
    const role = req.user.role;

    let students = [];

    // If admin, get all students
    if (role === "admin") {
      const [allStudents] = await rawDb.query(
        `SELECT 
          l.id,
          l.user_id,
          l.name,
          l.email,
          l.phone,
          l.status,
          l.created_at
         FROM leads l
         WHERE l.is_deleted = 0
         ORDER BY l.created_at DESC`
      );
      students = allStudents;
    } else {
      // ✅ Resolve counsellor's own record ID from their logged-in user ID
      const [counsellorRows] = await rawDb.query(
        "SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0 LIMIT 1",
        [req.user.id]
      );
      const counsellorId = counsellorRows?.[0]?.id;

      if (!counsellorId) {
        return res.json({ success: true, students: [] });
      }

      // Counsellor gets assigned students
      const [assignedStudents] = await rawDb.query(
        `SELECT 
          l.id,
          l.user_id,
          l.name,
          l.email,
          l.phone,
          l.status,
          l.created_at
         FROM leads l
         WHERE l.counsellor_id = ? 
         AND l.is_deleted = 0
         ORDER BY l.created_at DESC`,
        [counsellorId]
      );
      students = assignedStudents;
    }

   

    // For each student, get their applications and documents
    const result = [];
    for (const student of students) {
      const [applications] = await rawDb.query(
        `SELECT 
          a.id,
          a.target_university,
          a.course,
          a.target_country,
          a.deadline,
          a.status,
          a.created_at,
          a.consultancy_fee,
          a.study_level,
          a.grades_cgpa,
          a.english_proficiency_test,
          a.english_test_overall_score,
          a.counselor_notes,
          a.full_name,
          a.email,
          a.phone
         FROM applications a
         WHERE a.lead_id = ? 
         AND a.is_deleted = 0
         ORDER BY a.created_at DESC`,
        [student.id]
      );

      // For each application, get documents
      for (const app of applications) {
        const [documents] = await rawDb.query(
          `SELECT 
            d.id,
            d.doc_value,
            cv.name as doc_type,
            cv.name as doc_type_name,
            d.file_path,
            d.file_path as file_url,
            d.status,
            d.is_received,
            d.is_collective,
            d.collective_doc_ids,
            d.created_at as submitted_at,
            d.created_at,
            d.rejection_reason,
            d.notes,
            d.uploaded_by,
            d.uploaded_by_id,
            d.reviewed_at,
            d.reviewed_by
           FROM student_documents d
           LEFT JOIN config_values cv ON d.doc_value = cv.id
           WHERE d.application_id = ? 
           AND d.is_deleted = 0
           ORDER BY d.created_at DESC`,
          [app.id]
        );

        app.documents = documents || [];
      }

      result.push({
        ...student,
        applications: applications || [],
      });
    }

    res.json({
      success: true,
      students: result,
    });
  } catch (error) {
    console.error("Get students with applications error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

// ============================================
// ✅ 3. VERIFY DOCUMENT
// ============================================
export async function verifyDocument(req, res) {
  try {
    const { id } = req.params;

    const [docRows] = await rawDb.query(
      "SELECT * FROM student_documents WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [id]
    );

    if (!docRows || docRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    await rawDb.query(
      `UPDATE student_documents 
       SET status = 'verified', 
           reviewed_by = ?, 
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [req.user.id, id]
    );

    res.json({
      success: true,
      message: "Document verified successfully",
    });
  } catch (error) {
    console.error("Verify document error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

// ============================================
// ✅ 4. REJECT DOCUMENT
// ============================================
export async function rejectDocument(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    const [docRows] = await rawDb.query(
      "SELECT * FROM student_documents WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [id]
    );

    if (!docRows || docRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    await rawDb.query(
      `UPDATE student_documents 
       SET status = 'rejected', 
           rejection_reason = ?, 
           reviewed_by = ?, 
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [reason, req.user.id, id]
    );

    res.json({
      success: true,
      message: "Document rejected successfully",
    });
  } catch (error) {
    console.error("Reject document error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

// ============================================
// ✅ 5. TOGGLE RECEIVED STATUS (Admin Only)
// ============================================
export async function toggleReceivedStatus(req, res) {
  try {
    const { id } = req.params;
    const { is_received } = req.body;

    if (typeof is_received !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "is_received must be a boolean value",
      });
    }

    // Check if document exists
    const [docRows] = await rawDb.query(
      "SELECT * FROM student_documents WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [id]
    );

    if (!docRows || docRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Update received status
    await rawDb.query(
      `UPDATE student_documents 
       SET is_received = ?, 
           status = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [is_received ? 1 : 0, is_received ? "verified" : "pending", id]
    );

    // Get updated document with doc_type name
    const [updatedDoc] = await rawDb.query(
      `SELECT 
        d.*,
        cv.name as doc_type,
        cv.name as doc_type_name
       FROM student_documents d
       LEFT JOIN config_values cv ON d.doc_value = cv.id
       WHERE d.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: `Document ${
        is_received ? "marked as received" : "marked as not received"
      }`,
      document: updatedDoc[0],
    });
  } catch (error) {
    console.error("Toggle received status error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

// ============================================
// ✅ 6. UPLOAD DOCUMENT (Updated with Dynamic Support)
// ============================================
export async function uploadDocument(req, res) {
  try {
    const {
      student_email,
      application_id,
      doc_type,
      notes,
      is_received,
      is_collective,
      collective_doc_ids, // This comes as JSON string: ["passport", "transcript"]
    } = req.body;
    const file = req.file;

    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }
    if (!application_id) {
      return res
        .status(400)
        .json({ success: false, message: "application_id is required" });
    }

    // Get lead by email or user ID
    let lead;
    if (student_email) {
      const [leadRows] = await rawDb.query(
        "SELECT * FROM leads WHERE email = ? AND is_deleted = 0 LIMIT 1",
        [student_email]
      );
      lead = leadRows?.[0] || null;
    } else {
      const [leadRows] = await rawDb.query(
        "SELECT * FROM leads WHERE user_id = ? AND is_deleted = 0 LIMIT 1",
        [req.user.id]
      );
      lead = leadRows?.[0] || null;
    }

    if (!lead) {
      return res
        .status(404)
        .json({ success: false, message: "Student lead not found" });
    }

    // Verify application belongs to this student
    const [appRows] = await rawDb.query(
      `SELECT id, lead_id, user_id 
       FROM applications 
       WHERE id = ? AND is_deleted = 0`,
      [parseInt(application_id)]
    );

    if (!appRows || appRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    const app = appRows[0];
    if (app.lead_id !== lead.id && app.user_id !== lead.user_id) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied to this application" });
    }

    // Get document type ID for the main document
    let docValueId;
    if (isNaN(doc_type)) {
      const [configRows] = await rawDb.query(
        `SELECT id FROM config_values 
         WHERE type = 'document_type' 
         AND LOWER(name) = LOWER(?) 
         AND is_deleted = 0 
         LIMIT 1`,
        [doc_type]
      );
      if (!configRows || configRows.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid document type" });
      }
      docValueId = configRows[0].id;
    } else {
      docValueId = parseInt(doc_type);
    }

    // ✅ FIX: Process collective_doc_ids - Convert keys to actual config_values IDs
    let processedCollectiveIds = null;
    if (is_collective === "true" || is_collective === true) {
      try {
        // Parse the JSON string from frontend
        let ids = typeof collective_doc_ids === 'string' 
          ? JSON.parse(collective_doc_ids) 
          : collective_doc_ids;
        
        if (Array.isArray(ids) && ids.length > 0) {
          console.log('📄 Raw collective IDs from frontend:', ids);
          
          // Convert each ID/key to the actual config_values ID
          const convertedIds = [];
          for (const id of ids) {
            // Check if it's already a number (config_values ID)
            if (!isNaN(id)) {
              convertedIds.push(parseInt(id));
            } else {
              // It's a key/name, find the config_values ID
              const [configRow] = await rawDb.query(
                `SELECT id FROM config_values 
                 WHERE type = 'document_type' 
                 AND (LOWER(name) = LOWER(?) OR LOWER(name) = LOWER(?))
                 AND is_deleted = 0 
                 LIMIT 1`,
                [id, id.replace(/_/g, ' ')] // Try both "passport" and "pass port"
              );
              
              if (configRow && configRow.length > 0) {
                convertedIds.push(configRow[0].id);
                console.log(`✅ Converted "${id}" to config ID: ${configRow[0].id}`);
              } else {
                console.warn(`⚠️ Could not find config ID for: ${id}`);
              }
            }
          }
          
          // Store as JSON string of IDs
          processedCollectiveIds = convertedIds;
          console.log('📄 Stored collective IDs (config IDs):', processedCollectiveIds);
        }
      } catch (error) {
        console.error('Error processing collective_doc_ids:', error);
      }
    }

    // Upload file
    const docTypeName = await getDocTypeName(docValueId);
    const { fileUrl } = await uploadFile(file, lead.id, docTypeName || "document");

    // Check if document already exists
    const [existingDocs] = await rawDb.query(
      `SELECT * FROM student_documents 
       WHERE student_id = ? 
       AND application_id = ? 
       AND doc_value = ? 
       AND is_deleted = 0 
       LIMIT 1`,
      [lead.id, parseInt(application_id), docValueId]
    );

    const existingDoc = existingDocs?.[0];

    // Determine status
    let status = "pending";
    if (is_received === "true" || is_received === true) {
      status = "verified";
    } else if (existingDoc && existingDoc.status === "rejected") {
      status = "review";
    }

    let documentId;

    if (existingDoc) {
      if (existingDoc.file_path) {
        await deleteFile(existingDoc.file_path.split("/").pop());
      }

      await rawDb.query(
        `UPDATE student_documents 
         SET file_path = ?, 
             status = ?, 
             is_received = ?,
             is_collective = ?,
             collective_doc_ids = ?,
             rejection_reason = NULL, 
             reviewed_by = NULL, 
             reviewed_at = NULL, 
             notes = ?,
             uploaded_by = ?,
             uploaded_by_id = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          fileUrl,
          status,
          is_received === "true" || is_received === true ? 1 : 0,
          is_collective === "true" || is_collective === true ? 1 : 0,
          processedCollectiveIds ? JSON.stringify(processedCollectiveIds) : null,
          notes || null,
          req.user.role || "student",
          req.user.id,
          existingDoc.id,
        ]
      );
      documentId = existingDoc.id;
    } else {
      const [result] = await rawDb.query(
        `INSERT INTO student_documents 
          (student_id, application_id, doc_value, file_path, status, 
           is_received, is_collective, collective_doc_ids,
           uploaded_by, uploaded_by_id, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          lead.id,
          parseInt(application_id),
          docValueId,
          fileUrl,
          status,
          is_received === "true" || is_received === true ? 1 : 0,
          is_collective === "true" || is_collective === true ? 1 : 0,
          processedCollectiveIds ? JSON.stringify(processedCollectiveIds) : null,
          req.user.role || "student",
          req.user.id,
          notes || null,
        ]
      );
      documentId = result.insertId;
    }

    // Get the inserted/updated document
    const [docRows] = await rawDb.query(
      `SELECT 
        d.*,
        cv.name as doc_type,
        cv.name as doc_type_name
       FROM student_documents d
       LEFT JOIN config_values cv ON d.doc_value = cv.id
       WHERE d.id = ?`,
      [documentId]
    );

    await logActivity({
      leadId: lead.id,
      actionType: "document_uploaded",
      note: `${docTypeName || "Document"} uploaded for application ${application_id}`,
      performedBy: req.user.id,
      performedByRole: req.user.role || "student",
    });

    res.status(201).json({
      success: true,
      message:
        status === "verified"
          ? "Document uploaded and verified successfully"
          : "Document uploaded successfully and sent for review",
      document: docRows[0],
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// Helper function
async function getDocTypeName(docValueId) {
  const [rows] = await rawDb.query(
    "SELECT name FROM config_values WHERE id = ? AND is_deleted = 0 LIMIT 1",
    [docValueId]
  );
  return rows?.[0]?.name || null;
}

// ============================================
// ✅ 7. GET MY DOCUMENTS (Student View)
// ============================================
export async function getMyDocuments(req, res) {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const { application_id } = req.query;

    const lead = await getLeadForUser(userId, userEmail);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Student profile not found" });
    }

    if (application_id) {
      const [appRows] = await rawDb.query(
        "SELECT id FROM applications WHERE id = ? AND is_deleted = 0 AND (user_id = ? OR lead_id = ?) LIMIT 1",
        [parseInt(application_id), userId, lead.id],
      );

      if (!appRows || appRows.length === 0) {
        return res.status(403).json({ success: false, message: "Access denied to this application" });
      }
    }

    const query = `
      SELECT
        d.id,
        d.application_id,
        d.doc_value AS doc_type_id,
        dcv.name AS doc_type,
        dcv.name AS doc_type_label,
        d.file_path,
        d.file_path AS file_url,
        d.status,
        d.is_received,
        d.is_collective,
        d.collective_doc_ids,
        d.created_at AS submitted_at,
        d.created_at,
        d.reviewed_at,
        d.rejection_reason,
        d.notes,
        d.uploaded_by,
        d.uploaded_by_id,
        d.reviewed_by,
        d.updated_at
      FROM student_documents d
      LEFT JOIN config_values dcv ON d.doc_value = dcv.id
      WHERE d.student_id = ? AND d.is_deleted = 0
      ${application_id ? "AND d.application_id = ?" : ""}
      ORDER BY d.created_at DESC
    `;

    const params = [lead.id];
    if (application_id) {
      params.push(parseInt(application_id));
    }

    const [rows] = await rawDb.query(query, params);

    res.json({ success: true, documents: rows || [] });
  } catch (error) {
    console.error("Get student documents error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// ============================================
// ✅ 8. DELETE DOCUMENT
// ============================================
export async function deleteDocument(req, res) {
  try {
    const [docRows] = await rawDb.query(
      "SELECT * FROM student_documents WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [req.params.id]
    );
    const document = docRows?.[0];

    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    const lead = await getLeadForUser(req.user.id, req.user.email);
    if (!lead || document.student_id !== lead.id) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (!["pending", "rejected"].includes(document.status)) {
      return res.status(400).json({ success: false, message: "Cannot delete document that is under review or verified" });
    }

    if (document.file_path) {
      const fileKey = document.file_path.split("/").pop();
      await deleteFile(fileKey);
    }

    await rawDb.query(
      "UPDATE student_documents SET is_deleted = 1, updated_at = NOW() WHERE id = ?",
      [document.id]
    );

    await logActivity({
      leadId: lead.id,
      actionType: "document_deleted",
      note: `Document deleted`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
    });

    res.json({ success: true, message: "Document deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// ============================================
// ✅ 9. GET MOBILE DOCS
// ============================================
export async function getMobileDocs(req, res) {
  try {
    const [mobileDocs] = await rawDb.query(
      "SELECT id, name, type, value FROM config_values WHERE type = 'document_type' AND is_deleted = 0 ORDER BY name ASC"
    );

    res.status(200).json({
      success: true,
      count: mobileDocs.length,
      data: mobileDocs,
    });
  } catch (error) {
    console.error("Get Mobile Docs Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// ============================================
// ✅ 10. GET DOCUMENT STATS
// ============================================
export const getDocumentStats = async (req, res) => {
  try {
    const [docs] = await rawDb.query("SELECT status FROM student_documents WHERE is_deleted = 0");
    const [mobileDocs] = await rawDb.query(
      "SELECT id FROM config_values WHERE type = 'document_type' AND is_deleted = 0"
    );
    const [applications] = await rawDb.query("SELECT id FROM applications WHERE is_deleted = 0");

    const stats = {
      totalUploaded: docs.length,
      verified: 0,
      pending: 0,
      review: 0,
      rejected: 0,
      totalRequired: applications.length * mobileDocs.length,
      applications: applications.length,
      docTypes: mobileDocs.length,
    };

    docs.forEach((doc) => {
      const status = doc.status;
      if (stats.hasOwnProperty(status)) {
        stats[status] += 1;
      }
    });

    return res.status(200).json(stats);
  } catch (error) {
    console.error("getDocumentStats error:", error);
    return res.status(500).json({ message: "Failed to fetch document stats" });
  }
};