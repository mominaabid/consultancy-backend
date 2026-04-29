// src/controllers/student/payment.controller.js
import db from '../../models/mysql/index.js';
import { uploadPaymentProof } from '../../services/fileUpload.service.js';

const { Payment, Application, User, Lead } = db;

// ─── GET MY PAYMENTS ──────────────────────────────────────────────────────
// src/controllers/student/payment.controller.js - Update getMyPayments
export async function getMyPayments(req, res) {
  try {
    const lead = await Lead.findOne({
      where: { email: req.user.email, is_deleted: false },
    });

    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Get all payments
    const payments = await Payment.findAll({
      where: { user_id: req.user.id, is_deleted: false },
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'target_university', 'target_country', 'course', 'status'],
        }
      ],
      order: [['paid_at', 'DESC']],
    });

    // Get fee records (amount = 0)
    const feeRecords = await Payment.findAll({
      where: { 
        user_id: req.user.id, 
        amount: 0,
        is_deleted: false 
      },
      attributes: ['application_id', 'total_fees', 'scholarship_amount', 'scholarship_type', 'scholarship_remarks', 'final_fees'],
    });

    // Build feeInfo object
    const feeInfo = {};
    feeRecords.forEach(record => {
      feeInfo[record.application_id] = {
        total_fees: parseFloat(record.total_fees) || 0,
        scholarship_amount: parseFloat(record.scholarship_amount) || 0,
        scholarship_type: record.scholarship_type,
        scholarship_remarks: record.scholarship_remarks,
        final_fees: parseFloat(record.final_fees) || parseFloat(record.total_fees) || 0,
      };
    });

    console.log('Fee Info being sent:', JSON.stringify(feeInfo, null, 2));

    const totalPaid = payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalPending = payments.filter(p => p.status === 'awaiting_verification').reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    res.json({
      success: true,
      payments: payments.filter(p => p.amount > 0),
      feeInfo: feeInfo,
      summary: {
        total_paid: totalPaid,
        total_pending: totalPending,
        completed_count: payments.filter(p => p.status === 'completed').length,
        pending_count: payments.filter(p => p.status === 'awaiting_verification').length,
        rejected_count: payments.filter(p => p.status === 'rejected').length,
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── MAKE PAYMENT ──────────────────────────────────────────────────────────
export async function makePayment(req, res) {
  try {
    const { application_id, amount, mode, payment_date, notes } = req.body;
    const proofFile = req.file;

    if (!application_id || !amount || !mode) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const application = await Application.findByPk(application_id);
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    let proofUrl = null;
    if (proofFile && mode === 'online') {
      const uploadResult = await uploadPaymentProof(proofFile, req.user.id, 'proof');
      proofUrl = uploadResult.fileUrl;
    }

    const payment = await Payment.create({
      user_id: req.user.id,
      application_id,
      amount: parseFloat(amount),
      mode,
      payment_date: payment_date || new Date(),
      notes: notes || null,
      payment_proof: proofUrl,
      status: mode === 'cash' ? 'pending' : 'awaiting_verification',
      recorded_by: req.user.id,
      paid_at: new Date(),
    });

    res.status(201).json({
      success: true,
      message: mode === 'cash' 
        ? 'Payment recorded successfully! Admin will verify it soon.' 
        : 'Payment submitted successfully! Please wait for admin verification.',
      payment
    });
  } catch (error) {
    console.error('Error in makePayment:', error);
    res.status(500).json({ message: error.message });
  }
}