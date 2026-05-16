import db from "../../models/mysql/index.js";
import { uploadFile, deleteFile } from "../../services/fileUpload.service.js";
import { logActivity } from "../../services/activityLog.service.js";

const { Document, Lead, Application, MobileDoc } = db;

const ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_SIZE = 5 * 1024 * 1024;
const VALID_DOC_TYPES = [
  "passport",
  "transcript",
  "offer_letter",
  "visa",
  "sop",
  "ielts",
  "photo",
  "recommendation",
  "financial",
  "cv",
  "other",
];

export async function getMyDocuments(req, res) {
  try {
    const studentEmail = req.user.email;
    const { application_id } = req.query; // ← new query param

    // Find the student's lead record
    const lead = await Lead.findOne({
      where: { email: studentEmail, is_deleted: false },
    });

    if (!lead) {
      return res.status(404).json({ message: "Student profile not found" });
    }

    // Helper to verify application ownership (if an id is given)
    const verifyApplicationOwnership = async (appId) => {
      const app = await Application.findOne({
        where: {
          id: appId,
          [db.Sequelize.Op.or]: [{ user_id: lead.id }, { email: studentEmail }],
        },
      });
      return app !== null;
    };

    let whereCondition = {
      student_id: lead.id,
      is_deleted: false,
    };

    if (application_id) {
      // Validate that the application belongs to this student
      const isOwner = await verifyApplicationOwnership(application_id);
      if (!isOwner) {
        return res
          .status(403)
          .json({ message: "Access denied to this application" });
      }
      whereCondition.application_id = application_id;
    }

    const documents = await Document.findAll({
      where: whereCondition,
      include: [{ model: Application, as: "application" }],
      order: [["uploaded_at", "DESC"]],
    });

    res.json(documents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────
// GET ALL MOBILE DOC TYPES
// ─────────────────────────────────────────────────────────────
export async function getMobileDocs(req, res) {
  try {
    const mobileDocs = await MobileDoc.findAll({
      order: [["id", "ASC"]],
    });

    console.log("Docs found:", mobileDocs);

    res.status(200).json({
      success: true,
      count: mobileDocs.length,
      data: mobileDocs,
    });
  } catch (error) {
    console.error("Get Mobile Docs Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

// export const getDocumentStats = async (req, res) => {
//   try {
//     const docs = await Document.findAll({
//       attributes: ["status"],
//     });

//     const stats = {
//       total: docs.length,
//       verified: 0,
//       pending: 0,
//       review: 0,
//       rejected: 0,
//     };

//     docs.forEach((doc) => {
//       const status = doc.status;

//       if (stats.hasOwnProperty(status)) {
//         stats[status] += 1;
//       }
//     });

//     return res.status(200).json(stats);
//   } catch (error) {
//     console.error("getDocumentStats error:", error);
//     return res.status(500).json({
//       message: "Failed to fetch document stats",
//     });
//   }
// };

export const getDocumentStats = async (req, res) => {
  try {
    const [docs, mobileDocs, applications] = await Promise.all([
      Document.findAll({ attributes: ["status"] }),
      MobileDoc.findAll(),
      Application.findAll({ where: {} }),
    ]);

    const stats = {
      totalUploaded: docs.length,
      verified: 0,
      pending: 0,
      review: 0,
      rejected: 0,
      totalRequired: applications.length * mobileDocs.length, // 👈 dynamic magic
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
    return res.status(500).json({
      message: "Failed to fetch document stats",
    });
  }
};

export async function uploadDocument(req, res) {
  try {
    let { doc_type, application_id } = req.body;
    const file = req.file;

    // ── validation ─────────────────────────────────────────
    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    if (!application_id) {
      return res.status(400).json({ message: "application_id is required" });
    }
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return res.status(400).json({ message: "Invalid file type" });
    }
    if (file.size > MAX_SIZE) {
      return res.status(400).json({ message: "File too large (max 5MB)" });
    }

    // ── find student lead ──────────────────────────────────
    const lead = await Lead.findOne({
      where: { email: req.user.email, is_deleted: false },
    });
    if (!lead) {
      return res.status(404).json({ message: "Student lead not found" });
    }

    // ── verify application ownership ───────────────────────
    const application = await Application.findOne({
      where: {
        id: application_id,
        [db.Sequelize.Op.or]: [{ user_id: lead.id }, { email: req.user.email }],
      },
    });
    if (!application) {
      return res
        .status(404)
        .json({ message: "Application not found or access denied" });
    }

    // ── determine doc_type (sanitise) ──────────────────────
    let finalDocType = "other";
    if (typeof doc_type === "string") {
      const lower = doc_type.toLowerCase();
      for (const valid of VALID_DOC_TYPES) {
        if (lower.includes(valid) || valid.includes(lower)) {
          finalDocType = valid;
          break;
        }
      }
    }

    // ── upload file ────────────────────────────────────────
    const { fileUrl, fileKey, originalName } = await uploadFile(
      file,
      lead.id,
      finalDocType,
    );

    // ── create or update document (per application) ────────
    const existingDoc = await Document.findOne({
      where: {
        student_id: lead.id,
        application_id: application_id, // now linked to this specific app
        doc_type: finalDocType,
        is_deleted: false,
      },
    });

    let document;
    const newStatus =
      existingDoc && existingDoc.status === "rejected" ? "review" : "pending";

    if (existingDoc) {
      if (existingDoc.file_path) {
        await deleteFile(existingDoc.file_path.split("/").pop());
      }
      await existingDoc.update({
        file_path: fileUrl,
        status: newStatus,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        uploaded_at: new Date(),
      });
      document = existingDoc;
    } else {
      document = await Document.create({
        student_id: lead.id,
        application_id: parseInt(application_id),
        doc_type: finalDocType,
        file_path: fileUrl,
        status: newStatus,
        uploaded_by: "student",
        uploaded_by_id: req.user.id,
        uploaded_at: new Date(),
      });
    }

    await logActivity({
      leadId: lead.id,
      actionType: "document_uploaded",
      note: `${finalDocType} document uploaded for application ${application_id}`,
      performedBy: req.user.id,
      performedByRole: "student",
    });

    res.status(201).json({
      success: true,
      message: "Document uploaded successfully and sent for review",
      document,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: error.message });
  }
}

// ─── DELETE DOCUMENT ────────────────────────────────────────────────────────
export async function deleteDocument(req, res) {
  try {
    const document = await Document.findByPk(req.params.id);

    if (!document || document.is_deleted) {
      return res.status(404).json({ message: "Document not found" });
    }

    const lead = await Lead.findOne({
      where: { email: req.user.email, is_deleted: false },
    });

    if (!lead || document.student_id !== lead.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (!["pending", "rejected"].includes(document.status)) {
      return res.status(400).json({
        message: "Cannot delete document that is under review or verified",
      });
    }

    if (document.file_path) {
      const fileKey = document.file_path.split("/").pop();
      await deleteFile(fileKey);
    }

    await document.update({ is_deleted: true });

    await logActivity({
      leadId: lead.id,
      actionType: "document_deleted",
      note: `${document.doc_type} document deleted`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}
