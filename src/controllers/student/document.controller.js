// src/controllers/student/document.controller.js
import db from '../../models/mysql/index.js';
import { uploadFile, deleteFile } from '../../services/fileUpload.service.js';
import { logActivity } from '../../services/activityLog.service.js';

const { Document, Lead } = db;

const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

// ─── GET /student/documents ─────────────────────────────────────────────────
export async function getMyDocuments(req, res) {
  try {
    const lead = await Lead.findOne({
      where: { email: req.user.email, is_deleted: false },
    });

    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const documents = await Document.findAll({
      where: { student_id: lead.id },
      order: [['uploaded_at', 'DESC']],
    });

    // Format response for frontend
    const formattedDocs = documents.map(doc => ({
      id: doc.id,
      doc_type: doc.doc_type,
      status: doc.status,
      rejection_reason: doc.rejection_reason,
      file_url: doc.file_path,
      submitted_at: doc.uploaded_at,
      reviewed_at: doc.reviewed_at,
      original_name: doc.file_path ? doc.file_path.split('/').pop() : 'document',
      file_size: 0,
      file_mime: 'application/octet-stream',
    }));

    res.json(formattedDocs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── POST /student/documents/upload ────────────────────────────────────────
export async function uploadDocument(req, res) {
  try {
    const { doc_type } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return res.status(400).json({
        message: 'Invalid file type. Allowed: PDF, DOC, DOCX, JPG, PNG, WEBP',
      });
    }

    if (file.size > MAX_SIZE) {
      return res.status(400).json({ message: 'File size must be less than 5MB' });
    }

    const lead = await Lead.findOne({
      where: { email: req.user.email, is_deleted: false },
    });

    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // All supported document types
    const validTypes = [
      'passport', 'transcript', 'offer_letter', 'visa',
      'sop', 'ielts', 'photo', 'recommendation', 
      'financial', 'cv', 'other'
    ];
    
    if (!validTypes.includes(doc_type)) {
      return res.status(400).json({ message: 'Invalid document type' });
    }

    // Check if document already exists for this specific type
    const existingDoc = await Document.findOne({
      where: {
        student_id: lead.id,
        doc_type: doc_type,
      },
    });

    if (existingDoc && existingDoc.status === 'verified') {
      return res.status(400).json({
        message: 'Document already verified. Cannot upload again.',
      });
    }

    // Upload file
    const { fileUrl, fileKey, originalName } = await uploadFile(file, lead.id, doc_type);

    // Determine status
    let newStatus = 'pending';
    let historyUpdate = null;
    
    if (existingDoc && existingDoc.status === 'rejected') {
      newStatus = 'review';
      
      // Get existing history or initialize empty array
      let history = existingDoc.status_history || [];
      
      // Add re-upload event to history (preserve all previous history)
      history.push({
        id: Date.now(),
        status: existingDoc.status,
        action: 'reupload',
        performed_by: req.user.id,
        performed_by_name: req.user.name,
        performed_by_role: req.user.role,
        performed_at: new Date(),
        note: `Document re-uploaded after rejection. Previous rejection reason: ${existingDoc.rejection_reason || 'No reason provided'}`,
        previous_rejection_reason: existingDoc.rejection_reason,
        old_file_path: existingDoc.file_path,
        new_file_path: fileUrl
      });
      
      historyUpdate = history;
      
      console.log('📝 Re-upload history entry added');
      console.log('📚 Total history entries:', history.length);
    }

    let document;
    if (existingDoc) {
      // Delete old file if exists
      if (existingDoc.file_path) {
        const oldFileKey = existingDoc.file_path.split('/').pop();
        await deleteFile(oldFileKey);
      }

      // Prepare update data
      const updateData = {
        file_path: fileUrl,
        status: newStatus,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: new Date(),
        uploaded_at: new Date(),
      };
      
      // Add history and review count if this is a re-upload
      if (historyUpdate) {
        updateData.status_history = historyUpdate;
        updateData.review_count = (existingDoc.review_count || 0) + 1;
      }
      
      // Update existing document
      await existingDoc.update(updateData);
      document = existingDoc;
    } else {
      // Create new document with empty history
      document = await Document.create({
        student_id: lead.id,
        doc_type: doc_type,
        file_path: fileUrl,
        status: newStatus,
        uploaded_at: new Date(),
        status_history: [], // Initialize empty history array
        review_count: 0
      });
    }

    // Log activity
    await logActivity({
      leadId: lead.id,
      actionType: newStatus === 'review' ? 'document_reuploaded' : 'document_uploaded',
      note: `${doc_type} document uploaded: ${originalName}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: document.id,
        doc_type: document.doc_type,
        status: document.status,
        file_url: document.file_path,
        submitted_at: document.uploaded_at,
        status_history: document.status_history || [],
        review_count: document.review_count || 0
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── DELETE /student/documents/:id ──────────────────────────────────────────
export async function deleteDocument(req, res) {
  try {
    const document = await Document.findByPk(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const lead = await Lead.findOne({
      where: { email: req.user.email, is_deleted: false },
    });

    if (!lead || document.student_id !== lead.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Only allow deletion of pending or rejected documents
    if (!['pending', 'rejected'].includes(document.status)) {
      return res.status(400).json({
        message: 'Cannot delete document that is under review or verified',
      });
    }

    // Delete file from storage
    if (document.file_path) {
      const fileKey = document.file_path.split('/').pop();
      await deleteFile(fileKey);
    }

    // Delete document from database
    await document.destroy();

    // Log activity
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