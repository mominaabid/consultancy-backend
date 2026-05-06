// src/controllers/student/document.controller.js
import db from '../../models/mysql/index.js';
import { uploadFile, deleteFile } from '../../services/fileUpload.service.js';
import { logActivity } from '../../services/activityLog.service.js';

const { Document, Lead, Application } = db;

const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const MAX_SIZE = 5 * 1024 * 1024;
const VALID_DOC_TYPES = ['passport', 'transcript', 'offer_letter', 'visa', 'sop', 'ielts', 'photo', 'recommendation', 'financial', 'cv', 'other'];

// ─── GET MY DOCUMENTS ──────────────────────────────────────────────────────
export async function getMyDocuments(req, res) {
  try {
    const studentEmail = req.user.email;
    
    console.log('Fetching documents for email:', studentEmail);
    
    // Find all applications for this student by email
    const applications = await Application.findAll({
      where: { email: studentEmail },
      attributes: ['id']
    });
    
    const applicationIds = applications.map(app => app.id);
    
    // Get ALL documents where either:
    // - student_id matches lead id, OR
    // - application_id matches any of the student's applications
    const lead = await Lead.findOne({
      where: { email: studentEmail, is_deleted: false }
    });
    
    const whereCondition = {};
    
    if (lead) {
      whereCondition[db.Sequelize.Op.or] = [
        { student_id: lead.id },
        { application_id: { [db.Sequelize.Op.in]: applicationIds } }
      ];
    } else {
      whereCondition.application_id = { [db.Sequelize.Op.in]: applicationIds };
    }
    
    const documents = await Document.findAll({
      where: { 
        ...whereCondition,
        is_deleted: false 
      },
      include: [{
        model: Application,
        as: 'application'
      }],
      order: [['uploaded_at', 'DESC']],
    });
    
    console.log('Documents found:', documents.length);
    
    res.json(documents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── UPLOAD DOCUMENT ────────────────────────────────────────────────────────
// src/controllers/student/document.controller.js

export async function uploadDocument(req, res) {
  try {
    let { doc_type, application_id } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Validate file
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return res.status(400).json({ message: 'Invalid file type. Allowed: PDF, DOC, DOCX, JPG, PNG, WEBP' });
    }
    if (file.size > MAX_SIZE) {
      return res.status(400).json({ message: 'File size must be less than 5MB' });
    }

    // Find lead
    const lead = await Lead.findOne({
      where: { email: req.user.email, is_deleted: false },
    });

    if (!lead) {
      return res.status(404).json({ message: 'Student lead not found' });
    }

    // Find application - More flexible matching
    const application = await Application.findOne({
      where: {
        id: application_id,
        [db.Sequelize.Op.or]: [
          { user_id: req.user.id },        // Old student-created apps
          { user_id: lead.id },            // Counsellor-created apps (user_id = lead.id)
          { email: req.user.email }        // Match by email as backup
        ]
      }
    });

    if (!application) {
      return res.status(404).json({ message: 'Application not found or access denied' });
    }

    // Handle doc_type
    let finalDocType = 'other';
    if (typeof doc_type === 'string') {
      const lower = doc_type.toLowerCase();
      for (const valid of VALID_DOC_TYPES) {
        if (lower.includes(valid) || valid.includes(lower)) {
          finalDocType = valid;
          break;
        }
      }
    }

    const { fileUrl, fileKey, originalName } = await uploadFile(file, lead.id, finalDocType);

    // Check if document already exists
    const existingDoc = await Document.findOne({
      where: {
        student_id: lead.id,
        application_id: application_id,
        doc_type: finalDocType,
        is_deleted: false,
      },
    });

    let document;
    const newStatus = existingDoc && existingDoc.status === 'rejected' ? 'review' : 'pending';

    if (existingDoc) {
      if (existingDoc.file_path) {
        await deleteFile(existingDoc.file_path.split('/').pop());
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
        uploaded_by: 'student',
        uploaded_by_id: req.user.id,
        uploaded_at: new Date(),
      });
    }

    await logActivity({
      leadId: lead.id,
      actionType: 'document_uploaded',
      note: `${finalDocType} document uploaded by student`,
      performedBy: req.user.id,
      performedByRole: 'student',
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully and sent for review',
      document,
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: error.message });
  }
}

// ─── DELETE DOCUMENT ────────────────────────────────────────────────────────
export async function deleteDocument(req, res) {
  try {
    const document = await Document.findByPk(req.params.id);

    if (!document || document.is_deleted) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const lead = await Lead.findOne({
      where: { email: req.user.email, is_deleted: false },
    });

    if (!lead || document.student_id !== lead.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (!['pending', 'rejected'].includes(document.status)) {
      return res.status(400).json({
        message: 'Cannot delete document that is under review or verified',
      });
    }

    if (document.file_path) {
      const fileKey = document.file_path.split('/').pop();
      await deleteFile(fileKey);
    }

    await document.update({ is_deleted: true });

    await logActivity({
      leadId: lead.id,
      actionType: 'document_deleted',
      note: `${document.doc_type} document deleted`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}