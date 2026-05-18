import db from "../../models/mysql/index.js";
import { deleteFile, uploadFile } from "../../services/fileUpload.service.js";
import { logActivity } from "../../services/activityLog.service.js";
import sseManager from "../../utils/sseManager.js";

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
      order: [["uploaded_at", "DESC"]],
    });

    res.json(documents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function verifyDocument(req, res) {
  try {
    const document = await Document.findByPk(req.params.id);
    if (!document)
      return res.status(404).json({ message: "Document not found" });

    const lead = await Lead.findByPk(document.student_id);
    const isAdmin = req.user.role === "admin";

    if (
      !isAdmin &&
      lead &&
      lead.counsellor_id &&
      lead.counsellor_id !== req.user.id
    ) {
      return res
        .status(403)
        .json({ message: "Access denied - Student not assigned to you" });
    }

    await document.update({
      status: "verified",
      reviewed_by: req.user.id,
      reviewed_at: new Date(),
    });

    if (lead && lead.user_id) {
      const docTypeLabel = document.doc_type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      sseManager.sendToUser(lead.user_id, {
        type: "document_verified",
        documentId: document.id,
        applicationId: document.application_id,
        message: `Your document (${docTypeLabel}) has been verified.`,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ success: true, message: "Document verified successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function rejectDocument(req, res) {
  try {
    const { reason } = req.body;
    const document = await Document.findByPk(req.params.id);
    if (!document)
      return res.status(404).json({ message: "Document not found" });

    const lead = await Lead.findByPk(document.student_id);
    const isAdmin = req.user.role === "admin";

    if (
      !isAdmin &&
      lead &&
      lead.counsellor_id &&
      lead.counsellor_id !== req.user.id
    ) {
      return res
        .status(403)
        .json({ message: "Access denied - Student not assigned to you" });
    }

    await document.update({
      status: "rejected",
      rejection_reason: reason,
      reviewed_by: req.user.id,
      reviewed_at: new Date(),
    });

    if (lead && lead.user_id) {
      const docTypeLabel = document.doc_type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      sseManager.sendToUser(lead.user_id, {
        type: "document_rejected",
        documentId: document.id,
        applicationId: document.application_id,
        message: `Your document (${docTypeLabel}) was rejected. Reason: ${reason || "No reason provided"}`,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ success: true, message: "Document rejected successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function uploadForStudent(req, res) {
  try {
    const { student_email, application_id, doc_type, notes } = req.body;
    const file = req.file;
    const userRole = req.user.role;
    const userId = req.user.id;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    if (!application_id) {
      return res.status(400).json({ message: "Application ID is required" });
    }

    let lead;
    if (userRole === "admin") {
      lead = await Lead.findOne({
        where: { email: student_email, is_deleted: false },
      });
    } else {
      lead = await Lead.findOne({
        where: {
          email: student_email,
          counsellor_id: userId,
          is_deleted: false,
        },
      });
    }

    if (!lead) {
      return res
        .status(403)
        .json({ message: "Student not found or not accessible" });
    }

    const application = await Application.findOne({
      where: {
        id: application_id,
        [db.Sequelize.Op.or]: [{ user_id: lead.id }, { email: student_email }],
      },
    });

    if (!application) {
      return res
        .status(404)
        .json({ message: "Application not found for this student" });
    }

    const { fileUrl, fileKey, originalName } = await uploadFile(
      file,
      lead.id,
      doc_type,
    );

    const document = await Document.create({
      student_id: lead.id,
      application_id: parseInt(application_id),
      doc_type: doc_type || "other",
      file_path: fileUrl,
      original_name: originalName,
      status: "verified",
      uploaded_by: req.user.role === "admin" ? "admin" : "counsellor",
      uploaded_by_id: userId,
      notes: notes || null,
      uploaded_at: new Date(),
    });

    await logActivity({
      leadId: lead.id,
      actionType: "document_shared",
      note: `${userRole} uploaded ${doc_type} document`,
      performedBy: userId,
      performedByRole: userRole,
      performedByName: req.user.name,
    });

    if (lead.user_id) {
      const docTypeLabel = doc_type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      sseManager.sendToUser(lead.user_id, {
        type: "document_shared",
        documentId: document.id,
        applicationId: application.id,
        message: `A new document (${docTypeLabel}) has been shared with you by your ${userRole === "admin" ? "administrator" : "counsellor"}.`,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({
      success: true,
      message: "Document uploaded and shared successfully",
      document,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload document",
    });
  }
}
