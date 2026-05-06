// src/controllers/counsellor/document.controller.js
import db from '../../models/mysql/index.js';
import { deleteFile, uploadFile } from '../../services/fileUpload.service.js';
import { logActivity } from '../../services/activityLog.service.js';

const { Document, Lead, User, Application } = db;

// ─── GET ALL DOCUMENTS (Counsellor view) ───────────────────────────────────
export async function getAllDocuments(req, res) {
  try {
    const where = { is_deleted: false };

    if (req.user.role === 'counsellor') {
      const leads = await Lead.findAll({
        where: { counsellor_id: req.user.id, is_deleted: false },
        attributes: ['id'],
      });
      const leadIds = leads.map(l => l.id);
      where.student_id = { [db.Sequelize.Op.in]: leadIds };
    }

    const documents = await Document.findAll({
      where,
      include: [
        { model: Lead, as: 'student', attributes: ['id', 'name', 'email'] },
        { model: Application, as: 'application', attributes: ['id', 'target_university', 'course'] },
        { model: User, as: 'reviewer', attributes: ['id', 'name'] },
      ],
      order: [['uploaded_at', 'DESC']],
    });

    res.json(documents);   // Send full objects (frontend can format)
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── VERIFY DOCUMENT ───────────────────────────────────────────────────────
// ─── VERIFY DOCUMENT ───────────────────────────────────────────────────────
export async function verifyDocument(req, res) {
  try {
    const document = await Document.findByPk(req.params.id);

    if (!document) return res.status(404).json({ message: 'Document not found' });

    const lead = await Lead.findByPk(document.student_id);

    // TEMPORARY: Allow access even if counsellor_id is null (for existing bad data)
    if (lead && lead.counsellor_id && lead.counsellor_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied - Student not assigned to you' });
    }

    await document.update({
      status: 'verified',
      reviewed_by: req.user.id,
      reviewed_at: new Date(),
    });

    res.json({ success: true, message: 'Document verified successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── REJECT DOCUMENT ───────────────────────────────────────────────────────
export async function rejectDocument(req, res) {
  try {
    const { reason } = req.body;
    const document = await Document.findByPk(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const lead = await Lead.findByPk(document.student_id);

    // TEMPORARY: Allow access even if counsellor_id is null (for existing bad data)
    if (lead && lead.counsellor_id && lead.counsellor_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied - Student not assigned to you' });
    }

    await document.update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_by: req.user.id,
      reviewed_at: new Date(),
    });

    res.json({ success: true, message: 'Document rejected successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}


// ─── UPLOAD FOR STUDENT (Counsellor sharing) ───────────────────────────────
// ─── UPLOAD FOR STUDENT (Counsellor sharing) ───────────────────────────────
export async function uploadForStudent(req, res) {
  try {
    const { student_email, application_id, doc_type, notes } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!application_id) {
      return res.status(400).json({ message: 'Application ID is required' });
    }

    // Find Lead (Student)
    const lead = await Lead.findOne({
      where: { 
        email: student_email, 
        counsellor_id: req.user.id, 
        is_deleted: false 
      }
    });

    if (!lead) {
      return res.status(403).json({ message: 'Student not assigned to you' });
    }

    // Find Application - More flexible check
    const application = await Application.findOne({
      where: { 
        id: application_id,
        [db.Sequelize.Op.or]: [
          { user_id: lead.id },           // Counsellor created apps
          { email: student_email }
        ]
      }
    });

    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Upload File
    const { fileUrl, fileKey, originalName } = await uploadFile(file, lead.id, doc_type);

    // Create Document (Auto Verified for Counsellor)
    const document = await Document.create({
      student_id: lead.id,
      application_id: parseInt(application_id),
      doc_type: doc_type || 'other',
      file_path: fileUrl,
      original_name: originalName,
      status: 'verified',                    // Auto-verified when counsellor uploads
      uploaded_by: 'counsellor',
      uploaded_by_id: req.user.id,
      notes: notes || null,
      uploaded_at: new Date(),
    });

    await logActivity({
      leadId: lead.id,
      actionType: 'document_shared',
      note: `Counsellor uploaded ${doc_type} document`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded and shared successfully',
      document,
    });

  } catch (error) {
    console.error('Counsellor Upload Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to upload document' 
    });
  }
}