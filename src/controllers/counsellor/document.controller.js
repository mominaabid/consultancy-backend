// src/controllers/counsellor/document.controller.js
import db from '../../models/mysql/index.js';
import { deleteFile } from '../../services/fileUpload.service.js';
import { logActivity } from '../../services/activityLog.service.js';

const { Document, Lead, User } = db;

// ─── GET /counsellor/documents/all ─────────────────────────────────────────
export async function getAllDocuments(req, res) {
  try {
    const where = {};

    if (req.user.role === 'counsellor') {
      const leads = await Lead.findAll({
        where: { counsellor_id: req.user.id, is_deleted: false },
        attributes: ['id'],
      });
      const leadIds = leads.map(l => l.id);
      where.student_id = leadIds;
    }

    const documents = await Document.findAll({
      where,
      include: [
        {
          model: Lead,
          as: 'student',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      order: [['uploaded_at', 'DESC']],
    });

    // Format response for frontend
    const formattedDocs = documents.map(doc => ({
      id: doc.id,
      doc_type: doc.doc_type,
      original_name: doc.file_path ? doc.file_path.split('/').pop() : 'document',
      file_url: doc.file_path,
      status: doc.status,
      rejection_reason: doc.rejection_reason,
      submitted_at: doc.uploaded_at,
      reviewed_at: doc.reviewed_at,
      student_name: doc.student?.name || 'Unknown',
      student_email: doc.student?.email,
      reviewer_name: doc.reviewer?.name,
    }));

    res.json(formattedDocs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── PUT /counsellor/documents/:id/verify ───────────────────────────────────
export async function verifyDocument(req, res) {
  try {
    const document = await Document.findByPk(req.params.id, {
      include: [{ model: Lead, as: 'student' }],
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check if counsellor has access
    if (req.user.role === 'counsellor') {
      const lead = await Lead.findByPk(document.student_id);
      if (!lead || lead.counsellor_id !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const previousStatus = document.status;

    await document.update({
      status: 'verified',
      reviewed_by: req.user.id,
      reviewed_at: new Date(),
      updated_at: new Date(),
    });

    // Log activity
    await logActivity({
      leadId: document.student_id,
      actionType: 'document_verified',
      fromValue: previousStatus,
      toValue: 'verified',
      note: `${document.doc_type} document verified`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    res.json({ message: 'Document verified successfully', document });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── PUT /counsellor/documents/:id/reject ───────────────────────────────────
export async function rejectDocument(req, res) {
  try {
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const document = await Document.findByPk(req.params.id, {
      include: [{ model: Lead, as: 'student' }],
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check if counsellor has access
    if (req.user.role === 'counsellor') {
      const lead = await Lead.findByPk(document.student_id);
      if (!lead || lead.counsellor_id !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const previousStatus = document.status;

    await document.update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_by: req.user.id,
      reviewed_at: new Date(),
      updated_at: new Date(),
    });

    // Log activity
    await logActivity({
      leadId: document.student_id,
      actionType: 'document_rejected',
      fromValue: previousStatus,
      toValue: 'rejected',
      note: `${document.doc_type} document rejected. Reason: ${reason}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    res.json({ message: 'Document rejected successfully', document });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}