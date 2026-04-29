// src/controllers/admin/payment.controller.js
import db from '../../models/mysql/index.js';
import { logActivity } from '../../services/activityLog.service.js';

const { Payment, Application, User, Lead } = db;

// ─── SET TOTAL FEES FOR APPLICATION ───────────────────────────────────────
// src/controllers/admin/payment.controller.js
export async function setTotalFees(req, res) {
  try {
    const { 
      application_id, 
      total_fees, 
      scholarship, 
      scholarship_type, 
      scholarship_remarks,
      final_fees 
    } = req.body;

    console.log('=== SETTING FEES ===');
    console.log('Application ID:', application_id);
    console.log('Total Fees:', total_fees);
    console.log('Scholarship:', scholarship);
    console.log('Scholarship Type:', scholarship_type);
    console.log('Final Fees:', final_fees);

    const application = await Application.findByPk(application_id);
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    // Find or create fee record
    let feeRecord = await Payment.findOne({
      where: { 
        application_id: application_id, 
        amount: 0 
      }
    });

    const scholarshipAmount = parseFloat(scholarship) || 0;
    const totalFeesAmount = parseFloat(total_fees) || 0;
    const finalFeesAmount = parseFloat(final_fees) || (totalFeesAmount - scholarshipAmount);

    if (feeRecord) {
      await feeRecord.update({
        total_fees: totalFeesAmount,
        scholarship_amount: scholarshipAmount,
        scholarship_type: scholarship_type || null,
        scholarship_remarks: scholarship_remarks || null,
        final_fees: finalFeesAmount
      });
      console.log('Updated existing fee record');
    } else {
      feeRecord = await Payment.create({
        user_id: application.user_id,
        application_id: application_id,
        total_fees: totalFeesAmount,
        scholarship_amount: scholarshipAmount,
        scholarship_type: scholarship_type || null,
        scholarship_remarks: scholarship_remarks || null,
        final_fees: finalFeesAmount,
        amount: 0,
        mode: 'cash',
        status: 'pending',
        recorded_by: req.user.id,
        paid_at: new Date(),
        notes: `Total: ${total_fees}, Scholarship: ${scholarship || 0}`
      });
      console.log('Created new fee record');
    }

    res.json({
      success: true,
      message: "Fees updated successfully",
      data: {
        total_fees: feeRecord.total_fees,
        scholarship_amount: feeRecord.scholarship_amount,
        scholarship_type: feeRecord.scholarship_type,
        final_fees: feeRecord.final_fees
      }
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
      
      // Get fee record from payments table
      const feeRecord = await Payment.findOne({
        where: { application_id: app.id, is_deleted: false }
      });
      
      // Get all completed payments for this application
      const payments = await Payment.findAll({
        where: { application_id: app.id, is_deleted: false, status: 'completed', amount: { [db.Sequelize.Op.gt]: 0 } },
      });
      
      const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const totalFees = feeRecord?.total_fees || 0;
      const scholarshipAmount = feeRecord?.scholarship_amount || 0;
      const finalFees = feeRecord?.final_fees || totalFees;
      const remaining = finalFees - totalPaid;

      return {
        id: app.id,
        user_id: app.user_id,
        student_name: user?.name || app.full_name,
        student_email: user?.email || app.email,
        university_name: app.target_university,
        course: app.course,
        total_fees: totalFees,
        scholarship_amount: scholarshipAmount,
        final_fees: finalFees,
        total_paid: totalPaid,
        remaining_amount: remaining > 0 ? remaining : 0,
        payments_count: payments.length,
        status: app.status,
      };
    }));

    res.json(studentsWithPayments);
  } catch (error) {
    console.error('Error in getOfferLetterStudents:', error);
    res.status(500).json({ message: error.message });
  }
}

// ─── ADD PAYMENT ──────────────────────────────────────────────────────────
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
        success: false,
        message: 'Missing required fields: application_id, amount, mode' 
      });
    }

    const application = await Application.findByPk(application_id);
    if (!application) {
      return res.status(404).json({ message: 'Application not found' });
    }

    const payment = await Payment.create({
      user_id: user_id || application.user_id,
      application_id: parseInt(application_id),
      amount: parseFloat(amount),
      payment_type: payment_type || 'consultancy_fee',
      mode: mode,
      status: 'completed',
      reference_no: reference_no || null,
      transaction_id: transaction_id || null,
      recorded_by: req.user.id,
      paid_at: new Date(),
      notes: notes || null,
      is_deleted: false,
    });

    console.log('Payment created:', payment.id);

    res.status(201).json({
      success: true,
      message: 'Payment added successfully',
      payment,
    });
  } catch (error) {
    console.error('Error in addPayment:', error);
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

    // Filter out fee records (amount = 0) and show only actual payments
    const actualPayments = payments.filter(p => p.amount > 0);

    const summary = {
      total_amount: actualPayments.filter(p => p.status === 'completed').reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0),
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
// Add these exports to your src/controllers/admin/payment.controller.js

// ─── DELETE PAYMENT ───────────────────────────────────────────────────────
export async function deletePayment(req, res) {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    await payment.update({ is_deleted: true });

    await logActivity({
      leadId: payment.user_id,
      actionType: 'payment_deleted',
      note: `Payment of ${payment.amount} deleted`,
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    });

    res.json({ success: true, message: 'Payment deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// ─── GET PENDING VERIFICATIONS ────────────────────────────────────────────
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

// ─── VERIFY PAYMENT ────────────────────────────────────────────────────────
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

// ─── GET STUDENT PAYMENTS ──────────────────────────────────────────────────
export async function getStudentPayments(req, res) {
  try {
    const { studentId } = req.params;
    
    const payments = await Payment.findAll({
      where: { user_id: studentId, is_deleted: false },
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'target_university', 'course', 'status'],
        },
        {
          model: User,
          as: 'recordedBy',
          attributes: ['id', 'name'],
        }
      ],
      order: [['paid_at', 'DESC']],
    });

    const totalPaid = payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    res.json({
      success: true,
      payments: payments.filter(p => p.amount > 0),
      total_paid: totalPaid,
      total_count: payments.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}