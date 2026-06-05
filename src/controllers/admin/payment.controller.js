import db from "../../models/mysql/index.js";
import { logActivity } from "../../services/activityLog.service.js";
import { Op } from "sequelize";
import { storeNotification } from "../../utils/notificationHelper.js";
import sseManager from "../../utils/sseManager.js";

const { Payment, Application, User, Lead } = db;

export async function setTotalFees(req, res) {
  try {
    const {
      application_id,
      total_fees,
      scholarship,
      scholarship_type,
      scholarship_remarks,
      final_fees,
    } = req.body;

    console.log("=== SETTING FEES ===");
    console.log("Application ID:", application_id);
    console.log("Total Fees:", total_fees);
    console.log("Scholarship:", scholarship);
    console.log("Scholarship Type:", scholarship_type);
    console.log("Final Fees:", final_fees);

    const application = await Application.findByPk(application_id);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    let feeRecord = await Payment.findOne({
      where: {
        application_id: application_id,
        amount: 0,
      },
    });

    const scholarshipAmount = parseFloat(scholarship) || 0;
    const totalFeesAmount = parseFloat(total_fees) || 0;
    const finalFeesAmount =
      parseFloat(final_fees) || totalFeesAmount - scholarshipAmount;

    if (feeRecord) {
      await feeRecord.update({
        total_fees: totalFeesAmount,
        scholarship_amount: scholarshipAmount,
        scholarship_type: scholarship_type || null,
        scholarship_remarks: scholarship_remarks || null,
        final_fees: finalFeesAmount,
      });
      console.log("Updated existing fee record");
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
        mode: "cash",
        status: "pending",
        recorded_by: req.user.id,
        paid_at: new Date(),
        notes: `Total: ${total_fees}, Scholarship: ${scholarship || 0}`,
      });
      console.log("Created new fee record");
    }

    res.json({
      success: true,
      message: "Fees updated successfully",
      data: {
        total_fees: feeRecord.total_fees,
        scholarship_amount: feeRecord.scholarship_amount,
        scholarship_type: feeRecord.scholarship_type,
        final_fees: feeRecord.final_fees,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function getOfferLetterStudents(req, res) {
  try {
    const { start, end } = req.query;

    // Build where clause for applications
    let appWhere = {};

    if (start && end) {
      appWhere.created_at = {
        [Op.between]: [new Date(start), new Date(end)],
      };
    }

    const applications = await Application.findAll({
      where: appWhere,
      order: [["created_at", "DESC"]],
    });

    // const applications = await Application.findAll({
    //   where: {
    //     status: {
    //       [Op.in]: ["offer letter received", "visa filed", "approved"],
    //     },
    //   },
    //   order: [["created_at", "DESC"]],
    // });

    const studentsWithPayments = await Promise.all(
      applications.map(async (app) => {
        const user = await User.findByPk(app.user_id, {
          attributes: ["id", "name", "email"],
        });

        const feeRecord = await Payment.findOne({
          where: { application_id: app.id, is_deleted: false },
        });

        const payments = await Payment.findAll({
          where: {
            application_id: app.id,
            is_deleted: false,
            status: "completed",
            amount: { [db.Sequelize.Op.gt]: 0 },
          },
        });

        const totalPaid = payments.reduce(
          (sum, p) => sum + (parseFloat(p.amount) || 0),
          0,
        );
        const totalFees = feeRecord?.total_fees || 0;
        const scholarshipAmount = feeRecord?.scholarship_amount || 0;
        const finalFees = feeRecord?.final_fees || totalFees;
        const remaining = finalFees - totalPaid;

        const payment_status = remaining <= 0 ? "completed" : "in-progress";

        return {
          id: app.id,
          user_id: app.user_id,
          student_name: user?.name || app.full_name,
          student_email: user?.email || app.email,
          university_name: app.target_university,
          course: app.course,
          consultancy_fee: app.consultancy_fee,
          total_fees: totalFees,
          scholarship_amount: scholarshipAmount,
          final_fees: finalFees,
          total_paid: totalPaid,
          remaining_amount: remaining > 0 ? remaining : 0,
          payment_status,
          payments_count: payments.length,
          status: app.status,
        };
      }),
    );

    res.json(studentsWithPayments);
  } catch (error) {
    console.error("Error in getOfferLetterStudents:", error);
    res.status(500).json({ message: error.message });
  }
}

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
      status,
    } = req.body;

    console.log("Adding payment:", { user_id, application_id, amount, mode });

    if (!application_id || !amount || !mode) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: application_id, amount, mode",
      });
    }

    const application = await Application.findByPk(application_id);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    // Create the payment (admin may set status, default to 'completed' if not provided)
    const paymentStatus = status || "completed";
    const payment = await Payment.create({
      user_id: user_id || application.user_id,
      application_id: parseInt(application_id),
      amount: parseFloat(amount),
      payment_type: payment_type || "consultancy_fee",
      mode: mode,
      status: paymentStatus,
      reference_no: reference_no || null,
      transaction_id: transaction_id || null,
      recorded_by: req.user.id,
      paid_at: new Date(),
      notes: notes || null,
      is_deleted: false,
    });

    console.log("Payment created:", payment.id);

    // --- Notification & overall status logic (only for completed payments) ---
    if (paymentStatus === "completed") {
      try {
        // 1. Fetch fee record (amount = 0) for this application
        const feeRecord = await Payment.findOne({
          where: {
            application_id: application.id,
            amount: 0,
            is_deleted: false,
          },
          attributes: ["final_fees", "total_fees"],
        });

        let finalFees = 0;
        if (feeRecord && feeRecord.final_fees) {
          finalFees = parseFloat(feeRecord.final_fees);
        } else if (feeRecord && feeRecord.total_fees) {
          finalFees = parseFloat(feeRecord.total_fees);
        } else {
          // No fee structure defined – we cannot compute overall status
          console.warn(`No fee record found for application ${application.id}`);
        }

        // 2. Calculate total paid (sum of all completed payments for this application)
        const allCompletedPayments = await Payment.findAll({
          where: {
            application_id: application.id,
            status: "completed",
            is_deleted: false,
            amount: { [Op.gt]: 0 }, // only actual payments, not the fee record
          },
          attributes: ["amount"],
        });

        const totalPaid = allCompletedPayments.reduce(
          (sum, p) => sum + parseFloat(p.amount),
          0,
        );

        // 3. Determine overall payment status
        const overallStatus =
          finalFees > 0 && totalPaid >= finalFees ? "completed" : "in-progress";

        // 4. Prepare notification data
        const amountFormatted = parseFloat(amount).toFixed(2);
        const totalPaidFormatted = totalPaid.toFixed(2);
        const finalFeesFormatted = finalFees.toFixed(2);
        const university = application.target_university || "your application";
        const course = application.course || "";

        let message = `Admin has added a payment of $${amountFormatted} for your application to ${university} (${course}). `;
        if (finalFees > 0) {
          message += `Total paid: $${totalPaidFormatted} out of $${finalFeesFormatted}. Status: ${overallStatus.toUpperCase()}.`;
        } else {
          message += `Please check your payment dashboard for details.`;
        }

        const metadata = {
          paymentId: payment.id,
          applicationId: application.id,
          amount: parseFloat(amount),
          totalPaid: totalPaid,
          finalFees: finalFees,
          overallStatus: overallStatus,
          university,
          course,
          addedBy: req.user.name || req.user.email,
        };

        // 5. Store notification in DB and send via SSE
        const studentId = application.user_id;
        await storeNotification(
          studentId,
          "payment_added_by_admin",
          message,
          metadata,
        );
        sseManager.sendToUser(studentId, {
          type: "payment_added_by_admin",
          message,
          metadata,
        });

        console.log(`Payment notification sent to student ${studentId}`);
      } catch (notifError) {
        console.error("Failed to send payment notification:", notifError);
        // Do not break the main flow
      }
    }
    // --- End of notification block ---

    const lead = await Lead.findOne({ where: { user_id: payment.user_id } });
    if (lead) {
      await logActivity({
        leadId: lead.id,
        actionType: "payment_created",
        note: `Payment of ${amount} added for application ${application_id}`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    res.status(201).json({
      success: true,
      message: "Payment added successfully",
      payment,
    });
  } catch (error) {
    console.error("Error in addPayment:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getAllPayments(req, res) {
  try {
    const { start, end } = req.query;

    let where = { is_deleted: false };
    if (start && end) {
      where.paid_at = {
        [Op.between]: [new Date(start), new Date(end)],
      };
    }

    const payments = await Payment.findAll({
      where,
      include: [
        {
          model: Application,
          as: "application",
          attributes: ["id", "target_university", "course", "status"],
        },
        {
          model: User,
          as: "student",
          attributes: ["id", "name", "email"],
        },
        {
          model: User,
          as: "recordedBy",
          attributes: ["id", "name"],
        },
      ],
      order: [["paid_at", "DESC"]],
    });

    const actualPayments = payments.filter((p) => p.amount > 0);

    const summary = {
      total_amount: actualPayments
        .filter((p) => p.status === "completed")
        .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0),
      completed_count: actualPayments.filter((p) => p.status === "completed")
        .length,
      pending_count: actualPayments.filter(
        (p) =>
          p.status === "awaiting_verification" || p.status === "in-progress",
      ).length,
      in_progress_count: actualPayments.filter(
        (p) => p.status === "in-progress",
      ).length,
      rejected_count: actualPayments.filter((p) => p.status === "rejected")
        .length,
    };

    res.json({ success: true, payments: actualPayments, summary });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function deletePayment(req, res) {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    await payment.update({ is_deleted: true });

    const lead = await Lead.findOne({ where: { user_id: payment.user_id } });

    if (lead) {
      await logActivity({
        leadId: lead.id,
        actionType: "payment_deleted",
        note: `Payment of ${payment.amount} deleted`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });
    }

    res.json({ success: true, message: "Payment deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function getPendingVerifications(req, res) {
  try {
    const { start, end } = req.query;

    let where = { status: "awaiting_verification", is_deleted: false };
    if (start && end) {
      where.paid_at = {
        [Op.between]: [new Date(start), new Date(end)],
      };
    }

    const payments = await Payment.findAll({
      where,
      include: [
        {
          model: Application,
          as: "application",
          attributes: ["id", "target_university", "course"],
        },
        {
          model: User,
          as: "student",
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["paid_at", "DESC"]],
    });

    res.json({ success: true, payments });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function verifyPayment(req, res) {
  try {
    const { id } = req.params;
    const { action, rejection_reason } = req.body;

    const payment = await Payment.findByPk(id, {
      include: [
        {
          model: Application,
          as: "application",
          attributes: ["target_university", "course"],
        },
      ],
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    // Prepare student & application data for notification
    const studentId = payment.user_id;
    const application = payment.application;
    const university = application?.target_university || "your application";
    const course = application?.course || "";
    const amount = parseFloat(payment.amount).toFixed(2);

    if (action === "approve") {
      await payment.update({
        status: "completed",
        verified_by: req.user.id,
        verified_at: new Date(),
      });

      const lead = await Lead.findOne({ where: { user_id: payment.user_id } });
      if (lead) {
        await logActivity({
          leadId: lead.id,
          actionType: "payment_approved", // or "payment_rejected"
          note: `Payment of ${payment.amount} ${action === "approve" ? "approved" : "rejected"}`,
          performedBy: req.user.id,
          performedByRole: req.user.role,
          performedByName: req.user.name,
        });
      }

      // ----- Send notification to student -----
      const message = `Your payment of $${amount} for ${university} (${course}) has been approved.`;
      const metadata = {
        paymentId: payment.id,
        applicationId: payment.application_id,
        amount: payment.amount,
        status: "approved",
        university,
        course,
      };

      await storeNotification(studentId, "payment_verified", message, metadata);
      sseManager.sendToUser(studentId, {
        type: "payment_verified",
        message,
        metadata,
      });
      // ---------------------------------------

      res.json({
        success: true,
        message: "Payment approved successfully",
        payment,
      });
    } else if (action === "reject") {
      await payment.update({
        status: "rejected",
        rejection_reason: rejection_reason,
        verified_by: req.user.id,
        verified_at: new Date(),
      });

      await logActivity({
        leadId: lead.id,
        actionType: "payment_rejected",
        note: `Payment of ${payment.amount} rejected. Reason: ${rejection_reason}`,
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });

      // ----- Send rejection notification to student -----
      const reasonText = rejection_reason ? ` Reason: ${rejection_reason}` : "";
      const message = `Your payment of $${amount} for ${university} (${course}) has been rejected.${reasonText}`;
      const metadata = {
        paymentId: payment.id,
        applicationId: payment.application_id,
        amount: payment.amount,
        status: "rejected",
        rejection_reason: rejection_reason,
        university,
        course,
      };

      await storeNotification(studentId, "payment_rejected", message, metadata);
      sseManager.sendToUser(studentId, {
        type: "payment_rejected",
        message,
        metadata,
      });
      // ------------------------------------------------

      res.json({
        success: true,
        message: "Payment rejected successfully",
        payment,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function getPaymentProof(req, res) {
  try {
    const { id } = req.params;
    const payment = await Payment.findByPk(id);

    if (!payment || !payment.payment_proof) {
      return res.status(404).json({ message: "Payment proof not found" });
    }

    res.json({ success: true, proof_url: payment.payment_proof });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function getStudentPayments(req, res) {
  try {
    const { studentId, applicationId } = req.params;
    const { start, end } = req.query;

    let where = {
      user_id: studentId,
      application_id: applicationId,
      is_deleted: false,
    };

    if (start && end) {
      where.paid_at = {
        [Op.between]: [new Date(start), new Date(end)],
      };
    }

    const payments = await Payment.findAll({
      where,
      include: [
        {
          model: Application,
          as: "application",
          attributes: ["id", "target_university", "course", "status"],
        },
        {
          model: User,
          as: "recordedBy",
          attributes: ["id", "name"],
        },
      ],
      order: [["paid_at", "DESC"]],
    });

    const actualPayments = payments.filter((p) => p.amount > 0);

    const totalPaid = actualPayments
      .filter((p) => p.status === "completed")
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    res.json({
      success: true,
      payments: actualPayments,
      total_paid: totalPaid,
      total_count: actualPayments.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}
