// src/controllers/admin/payment.controller.js
import db from '../../models/mysql/index.js';
import { logActivity } from '../../services/activityLog.service.js';

const { Payment, Application, User, Lead } = db;

// ─── SET TOTAL FEES FOR APPLICATION (Store in payments table) ──────────────
export async function setTotalFees(req, res) {
  try {
    const { application_id, total_fees } = req.body;

    const application = await Application.findByPk(application_id);
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Check if there's an existing payment record for this application
    let existingPayment = await Payment.findOne({
      where: { application_id, is_deleted: false }
    });

    if (existingPayment) {
      // Update existing payment's total_fees
      await existingPayment.update({ total_fees: total_fees });
    } else {
      // Create a payment record to store total_fees
      await Payment.create({
        user_id: application.user_id,
        application_id: application_id,
        total_fees: total_fees,
        amount: 0,
        mode: 'cash',
        status: 'pending',
        recorded_by: req.user.id,
        paid_at: new Date(),
        notes: 'Total fees set by admin'
      });
    }

    await logActivity({
      leadId: application.user_id,
      actionType: 'fees_set',
      note: `Total fees set to ${total_fees} for application ${application_id}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    res.json({
      success: true,
      message: 'Total fees set successfully',
      data: { id: application.id, total_fees: total_fees }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── GET OFFER LETTER STUDENTS ────────────────────────────────────────────
export async function getOfferLetterStudents(req, res) {
  try {
    const applications = await Application.findAll({
      where: { status: 'offer letter received' },
      order: [['created_at', 'DESC']],
    });

    const studentsWithPayments = await Promise.all(applications.map(async (app) => {
      const user = await User.findByPk(app.user_id, {
        attributes: ['id', 'name', 'email'],
      });
      
      // Get the payment record that contains total_fees
      const feeRecord = await Payment.findOne({
        where: { application_id: app.id, is_deleted: false },
        order: [['created_at', 'ASC']]
      });
      
      // Get all completed payments for this application
      const payments = await Payment.findAll({
        where: { application_id: app.id, is_deleted: false, status: 'completed' },
      });
      
      const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const totalFees = feeRecord?.total_fees || 0;

      return {
        id: app.id,
        user_id: app.user_id,
        student_name: user?.name || app.full_name,
        student_email: user?.email || app.email,
        university_name: app.target_university,
        course: app.course,
        total_fees: totalFees,
        total_paid: totalPaid,
        remaining_amount: totalFees - totalPaid,
        payments_count: payments.length,
        status: app.status,
      };
    }));

    res.json(studentsWithPayments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── ADD/MAKE PAYMENT (ADMIN) ─────────────────────────────────────────────
export async function addPayment(req, res) {
  try {
    const {
      user_id,
      application_id,
      amount,
      payment_type,
      mode,
      reference_no,
      transaction_id,
      notes,
    } = req.body;

    console.log('Adding payment:', { user_id, application_id, amount, mode });

    if (!application_id || !amount || !mode) {
      return res.status(400).json({ 
        message: 'Missing required fields: application_id, amount, mode' 
      });
    }

    // Check if application exists
    const application = await Application.findByPk(application_id);
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Create payment record
    const payment = await Payment.create({
      user_id: user_id || application.user_id,
      application_id: parseInt(application_id),
      amount: parseFloat(amount),
      payment_type: payment_type || 'consultancy_fee',
      mode: mode,
      status: 'completed', // Admin added payments are automatically completed
      reference_no: reference_no || null,
      transaction_id: transaction_id || null,
      recorded_by: req.user.id,
      paid_at: new Date(),
      notes: notes || null,
      is_deleted: false,
    });

    console.log('Payment created:', payment.id);

    // Log activity
    await logActivity({
      leadId: user_id || application.user_id,
      actionType: 'payment_added',
      note: `Payment of ${amount} added for application ${application_id}`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    res.status(201).json({
      success: true,
      message: 'Payment added successfully',
      payment: payment,
    });
  } catch (error) {
    console.error('Error in addPayment:', error);
    res.status(500).json({ message: error.message });
  }
}

// ─── GET PENDING PAYMENTS FOR VERIFICATION ────────────────────────────────
export async function getPendingVerifications(req, res) {
  try {
    const payments = await Payment.findAll({
      where: { status: 'awaiting_verification', is_deleted: false },
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'target_university', 'course'],
        },
        {
          model: User,
          as: 'student',
          attributes: ['id', 'name', 'email'],
        }
      ],
      order: [['paid_at', 'DESC']],
    });

    res.json({ success: true, payments });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── VERIFY PAYMENT (ADMIN ACTION) ────────────────────────────────────────
export async function verifyPayment(req, res) {
  try {
    const { id } = req.params;
    const { action, rejection_reason } = req.body;

    const payment = await Payment.findByPk(id);
    
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (action === 'approve') {
      await payment.update({
        status: 'completed',
        verified_by: req.user.id,
        verified_at: new Date(),
      });

      await logActivity({
        leadId: payment.user_id,
        actionType: 'payment_approved',
        note: `Payment of ${payment.amount} approved`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });

      res.json({ 
        success: true, 
        message: 'Payment approved successfully',
        payment 
      });
    } 
    else if (action === 'reject') {
      await payment.update({
        status: 'rejected',
        rejection_reason: rejection_reason,
        verified_by: req.user.id,
        verified_at: new Date(),
      });

      await logActivity({
        leadId: payment.user_id,
        actionType: 'payment_rejected',
        note: `Payment of ${payment.amount} rejected. Reason: ${rejection_reason}`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });

      res.json({ 
        success: true, 
        message: 'Payment rejected successfully',
        payment 
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── GET ALL PAYMENTS ─────────────────────────────────────────────────────
export async function getAllPayments(req, res) {
  try {
    const payments = await Payment.findAll({
      where: { is_deleted: false },
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'target_university', 'course', 'status'],
        },
        {
          model: User,
          as: 'student',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: User,
          as: 'recordedBy',
          attributes: ['id', 'name'],
        }
      ],
      order: [['paid_at', 'DESC']],
    });

    // Filter out the fee record (amount = 0) for display
    const actualPayments = payments.filter(p => p.amount > 0);

    const summary = {
      total_amount: actualPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0),
      completed_count: actualPayments.filter(p => p.status === 'completed').length,
      pending_count: actualPayments.filter(p => p.status === 'awaiting_verification').length,
      rejected_count: actualPayments.filter(p => p.status === 'rejected').length,
    };

    res.json({ success: true, payments: actualPayments, summary });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── DELETE PAYMENT ───────────────────────────────────────────────────────
export async function deletePayment(req, res) {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    await payment.update({ is_deleted: true });

    res.json({ success: true, message: 'Payment deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── GET PAYMENT PROOF ─────────────────────────────────────────────────────
export async function getPaymentProof(req, res) {
  try {
    const { id } = req.params;
    const payment = await Payment.findByPk(id);
    
    if (!payment || !payment.payment_proof) {
      return res.status(404).json({ message: 'Payment proof not found' });
    }
    
    res.json({ success: true, proof_url: payment.payment_proof });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}