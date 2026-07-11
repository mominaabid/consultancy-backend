import db from "../../models/mysql/index.js";
import { deleteFile, uploadFile } from "../../services/fileUpload.service.js";
import { logActivity } from "../../services/activityLog.service.js";
import sseManager from "../../utils/sseManager.js";
import { storeNotification } from "../../utils/notificationHelper.js";
import rawDb from "../../config/db.js";
const { Document, Lead, User, Application } = db;

export async function getAllDocuments(req, res) {
  try {
    const where = { is_deleted: false };

    if (req.user.role === "counsellor") {
      const leads = await Lead.findAll({
        where: { counsellor_id: req.user.id, is_deleted: false },
        attributes: ["id"],
      });
      const leadIds = leads.map((l) => l.id);
      where.student_id = { [db.Sequelize.Op.in]: leadIds };
    }

    const documents = await Document.findAll({
      where,
      include: [
        { model: Lead, as: "student", attributes: ["id", "name", "email"] },
        {
          model: Application,
          as: "application",
          attributes: ["id", "target_university", "course"],
        },
        { model: User, as: "reviewer", attributes: ["id", "name"] },
      ],
      order: [["created_at", "DESC"]],
    });

    res.json(documents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function verifyDocument(req, res) {
  try {
    const documentId = req.params.id;

    // ✅ Get document
    const [docRows] = await rawDb.query(
      'SELECT * FROM student_documents WHERE id = ? AND is_deleted = 0',
      [documentId]
    );

    if (!docRows || docRows.length === 0) {
      return res.status(404).json({ message: "Document not found" });
    }

    const document = docRows[0];

    // ✅ Check permission
    const [leadRows] = await rawDb.query(
      'SELECT * FROM leads WHERE id = ? AND is_deleted = 0',
      [document.student_id]
    );

    const lead = leadRows?.[0];
    const isAdmin = req.user.role === "admin";
if (!isAdmin && lead && lead.counsellor_id && lead.counsellor_id !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Access denied - Student not assigned to you" });
    }

    // ✅ Update document status
    await rawDb.query(
      `UPDATE student_documents 
       SET status = 'verified', reviewed_by = ?, reviewed_at = NOW(), updated_at = NOW() 
       WHERE id = ?`,
      [req.user.id, documentId]
    );

    // ✅ Send notification
    if (lead && lead.user_id) {
      const [docTypeRows] = await rawDb.query(
        'SELECT name FROM config_values WHERE id = ? AND type = "document_type" AND is_deleted = 0 LIMIT 1',
        [document.doc_value]
      );
      const docTypeName = docTypeRows?.[0]?.name || "document";
      const docTypeLabel = String(docTypeName)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());

      sseManager.sendToUser(lead.user_id, {
        type: "document_verified",
        documentId: parseInt(documentId),
        applicationId: document.application_id,
        message: `Your document (${docTypeLabel}) has been verified.`,
        timestamp: new Date().toISOString(),
      });

      await storeNotification(
        lead.user_id,
        "document_verified",
        `Your document (${docTypeLabel}) has been verified.`,
        {
          documentId: parseInt(documentId),
          applicationId: document.application_id,
          docType: docTypeName,
          reviewerId: req.user.id,
        }
      );
    }

    res.json({ success: true, message: "Document verified successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function rejectDocument(req, res) {
  try {
    const documentId = req.params.id;
    const { reason } = req.body;

    // ✅ Get document
    const [docRows] = await rawDb.query(
      'SELECT * FROM student_documents WHERE id = ? AND is_deleted = 0',
      [documentId]
    );

    if (!docRows || docRows.length === 0) {
      return res.status(404).json({ message: "Document not found" });
    }

    const document = docRows[0];

    // ✅ Check permission
    const [leadRows] = await rawDb.query(
      'SELECT * FROM leads WHERE id = ? AND is_deleted = 0',
      [document.student_id]
    );

    const lead = leadRows?.[0];
    const isAdmin = req.user.role === "admin";

    if (!isAdmin && lead && lead.counsellor_id && lead.counsellor_id !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Access denied - Student not assigned to you" });
    }

    // ✅ Update document status
    await rawDb.query(
      `UPDATE student_documents 
       SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW(), updated_at = NOW() 
       WHERE id = ?`,
      [reason || null, req.user.id, documentId]
    );

    // ✅ Send notification
    if (lead && lead.user_id) {
      const [docTypeRows] = await rawDb.query(
        'SELECT name FROM config_values WHERE id = ? AND type = "document_type" AND is_deleted = 0 LIMIT 1',
        [document.doc_value]
      );
      const docTypeName = docTypeRows?.[0]?.name || "document";
      const docTypeLabel = String(docTypeName)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());

      sseManager.sendToUser(lead.user_id, {
        type: "document_rejected",
        documentId: parseInt(documentId),
        applicationId: document.application_id,
        message: `Your document (${docTypeLabel}) was rejected. Reason: ${reason || "No reason provided"}`,
        timestamp: new Date().toISOString(),
      });

      await storeNotification(
        lead.user_id,
        "document_rejected",
        `Your document (${docTypeLabel}) was rejected. Reason: ${reason || "No reason provided"}`,
        {
          documentId: parseInt(documentId),
          applicationId: document.application_id,
          docType: docTypeName,
          rejectionReason: reason || null,
          reviewerId: req.user.id,
        }
      );
    }

    res.json({ success: true, message: "Document rejected successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}
export async function uploadForStudent(req, res) {
  try {
    const { 
      student_email, 
      application_id, 
      doc_type, 
      notes,
      is_received,
      is_collective,
      collective_doc_ids
    } = req.body;
    const file = req.file;
    const userRole = req.user.role;
    const userId = req.user.id;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    if (!application_id) {
      return res.status(400).json({ message: "Application ID is required" });
    }
    if (!doc_type) {
      return res.status(400).json({ message: "Document type is required" });
    }

    // ✅ Get lead using raw SQL
    let lead;
    if (userRole === "admin") {
      const [leadRows] = await rawDb.query(
        'SELECT * FROM leads WHERE email = ? AND is_deleted = 0',
        [student_email]
      );
      lead = leadRows?.[0];
    } else {
      // Resolve counsellor's own record ID from their logged-in user ID
      const [counsellorRows] = await rawDb.query(
        'SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0 LIMIT 1',
        [userId]
      );
      const counsellorRecordId = counsellorRows?.[0]?.id;

      if (!counsellorRecordId) {
        return res.status(403).json({ message: "Student not found or not accessible" });
      }

      const [leadRows] = await rawDb.query(
        'SELECT * FROM leads WHERE email = ? AND counsellor_id = ? AND is_deleted = 0',
        [student_email, counsellorRecordId]
      );
      lead = leadRows?.[0];
    }

    if (!lead) {
      return res
        .status(403)
        .json({ message: "Student not found or not accessible" });
    }

   

    // ✅ Get doc_type ID from config_values
 // ✅ Get doc_type ID from config_values
const [configRows] = await rawDb.query(
  `SELECT id FROM config_values 
   WHERE type = "document_type" 
   AND (LOWER(name) = LOWER(?) OR LOWER(REPLACE(name, ' ', '_')) = LOWER(?))
   AND is_deleted = 0`,
  [doc_type, doc_type]
);

if (!configRows || configRows.length === 0) {
  return res.status(400).json({ message: "Invalid document type" });
}

const docValueId = configRows[0].id;

    // ✅ Check application exists using raw SQL
    const [appRows] = await rawDb.query(
      'SELECT * FROM applications WHERE id = ? AND lead_id = ? AND is_deleted = 0',
      [parseInt(application_id), lead.id]
    );

    if (!appRows || appRows.length === 0) {
      return res
        .status(404)
        .json({ message: "Application not found for this student" });
    }

    const application = appRows[0];

    // Upload file
    const { fileUrl } = await uploadFile(file, lead.id, doc_type);

    // ✅ Determine status: if admin/counsellor AND is_received is true → verified
    let status = 'pending';
    const isAdminOrCounsellor = userRole === "admin" || userRole === "counsellor";
    
    if (isAdminOrCounsellor && is_received === 'true') {
      status = 'verified';
    } else if (isAdminOrCounsellor) {
      status = 'pending'; // Admin uploaded but didn't mark as received
    }

    // ✅ Handle collective vs single document
    let isCollective = 0;
    let collectiveDocIds = null;
    
    if (is_collective === 'true' && collective_doc_ids) {
      isCollective = 1;
      collectiveDocIds = collective_doc_ids; // JSON array
    }

    // ✅ Insert document
  // ✅ Insert document
    const [docResult] = await rawDb.query(
      `INSERT INTO student_documents 
        (student_id, application_id, doc_value, file_path, status, 
         uploaded_by, uploaded_by_id, notes, 
         is_collective, collective_doc_ids, is_received,
         created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        lead.id,
        parseInt(application_id),
        docValueId,
        fileUrl,
        status,
        userRole === "admin" ? "admin" : "counsellor",
        userId,
        notes || null,
        isCollective,
        collectiveDocIds,
        isAdminOrCounsellor && is_received === 'true' ? 1 : 0,
      ]
    );

    const documentId = docResult.insertId;

    // ✅ Log activity
    await rawDb.query(
      `INSERT INTO lead_activity_logs 
        (lead_id, action_type, note, user_id, created_at, updated_at) 
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [
        lead.id,
        'document_shared',
        `${userRole} uploaded ${doc_type} document for ${lead.name}`,
        userId,
      ]
    );

    // ✅ Get the created document with doc_type_name
    const [docRows] = await rawDb.query(
      `SELECT d.*, cv.name as doc_type_name 
       FROM student_documents d
       LEFT JOIN config_values cv ON d.doc_value = cv.id
       WHERE d.id = ?`,
      [documentId]
    );

    // ✅ Send notifications if student has user account
    if (lead.user_id) {
      const docTypeLabel = doc_type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());

      const statusMessage = status === 'verified' 
        ? ` (marked as received and verified)` 
        : ` (pending review)`;

      sseManager.sendToUser(lead.user_id, {
        type: "document_shared",
        documentId: documentId,
        applicationId: parseInt(application_id),
        message: `A new document (${docTypeLabel}) has been shared with you by your ${userRole === "admin" ? "administrator" : "counsellor"}.${statusMessage}`,
        timestamp: new Date().toISOString(),
      });

      await storeNotification(
        lead.user_id,
        "document_shared",
        `A new document (${docTypeLabel}) has been shared with you by your ${userRole === "admin" ? "administrator" : "counsellor"}.${statusMessage}`,
        {
          documentId: documentId,
          applicationId: parseInt(application_id),
          docType: doc_type || "other",
          status: status,
          sharedByRole: userRole,
          sharedByName: req.user.name,
        }
      );
    }

    res.status(201).json({
      success: true,
      message: "Document uploaded and shared successfully",
      document: docRows[0],
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload document",
    });
  }
}
