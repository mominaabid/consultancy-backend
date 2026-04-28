// src/controllers/student/payment.controller.js
import db from '../../models/mysql/index.js';
import { uploadPaymentProof } from '../../services/fileUpload.service.js';

const { Payment, Application, User } = db;

// ─── GET MY PAYMENTS ──────────────────────────────────────────────────────
export async function getMyPayments(req, res) {
  try {
    const payments = await Payment.findAll({
      where: { user_id: req.user.id, is_deleted: false },
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'target_university', 'course', 'status'], // NO total_fees here
        }
      ],
      order: [['paid_at', 'DESC']],
    });

    // Calculate totals from payments table only
    const totalPaid = payments
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    
    const totalPending = payments
      .filter(p => p.status === 'awaiting_verification')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    const summary = {
      total_paid: totalPaid,
      total_pending: totalPending,
      completed_count: payments.filter(p => p.status === 'completed').length,
      pending_count: payments.filter(p => p.status === 'awaiting_verification').length,
      rejected_count: payments.filter(p => p.status === 'rejected').length,
    };

    res.json({ success: true, payments, summary });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── REQUEST/MAKE PAYMENT ─────────────────────────────────────────────────
export async function makePayment(req, res) {
  try {
    const { application_id, amount, mode, payment_date, notes } = req.body;
    const proofFile = req.file;

    if (!application_id || !amount || !mode) {
      return res.status(400).json({ message: 'Missing required fields: application_id, amount, mode' });
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