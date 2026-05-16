import db from "../../models/mysql/index.js";
import { uploadPaymentProof } from "../../services/fileUpload.service.js";

const { Payment, Application, User, Lead } = db;

export async function getMyPayments(req, res) {
  try {
    const lead = await Lead.findOne({
      where: { email: req.user.email, is_deleted: false },
    });

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    // Get all payments
    const payments = await Payment.findAll({
      where: { user_id: req.user.id, is_deleted: false },
      include: [
        {
          model: Application,
          as: "application",
          attributes: [
            "id",
            "target_university",
            "target_country",
            "course",
            "status",
          ],
        },
      ],
      order: [["paid_at", "DESC"]],
    });

    // Get fee records (amount = 0)
    const feeRecords = await Payment.findAll({
      where: {
        user_id: req.user.id,
        amount: 0,
        is_deleted: false,
      },
      attributes: [
        "application_id",
        "total_fees",
        "scholarship_amount",
        "scholarship_type",
        "scholarship_remarks",
        "final_fees",
      ],
    });

    // Build feeInfo object
    const feeInfo = {};
    feeRecords.forEach((record) => {
      feeInfo[record.application_id] = {
        total_fees: parseFloat(record.total_fees) || 0,
        scholarship_amount: parseFloat(record.scholarship_amount) || 0,
        scholarship_type: record.scholarship_type,
        scholarship_remarks: record.scholarship_remarks,
        final_fees:
          parseFloat(record.final_fees) || parseFloat(record.total_fees) || 0,
      };
    });

    console.log("Fee Info being sent:", JSON.stringify(feeInfo, null, 2));

    const totalPaid = payments
      .filter((p) => p.status === "completed")
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalPending = payments
      .filter((p) => p.status === "awaiting_verification")
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    res.json({
      success: true,
      payments: payments.filter((p) => p.amount > 0),
      feeInfo: feeInfo,
      summary: {
        total_paid: totalPaid,
        total_pending: totalPending,
        completed_count: payments.filter((p) => p.status === "completed")
          .length,
        pending_count: payments.filter(
          (p) => p.status === "awaiting_verification",
        ).length,
        rejected_count: payments.filter((p) => p.status === "rejected").length,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function makePayment(req, res) {
  try {
    const { application_id, amount, mode, payment_date, notes } = req.body;
    const proofFile = req.file;

    if (!application_id || !amount || !mode) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const application = await Application.findByPk(application_id);
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    let proofUrl = null;
    if (proofFile && mode === "online") {
      const uploadResult = await uploadPaymentProof(
        proofFile,
        req.user.id,
        "proof",
      );
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
      status: "awaiting_verification", // ✅ FIXED: Use same status for both modes
      recorded_by: req.user.id,
      paid_at: new Date(),
    });

    res.status(201).json({
      success: true,
      message:
        "Payment submitted successfully! Please wait for admin verification.",
      payment,
    });
  } catch (error) {
    console.error("Error in makePayment:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getPaymentStats(req, res) {
  try {
    const lead = await Lead.findOne({
      where: {
        email: req.user.email,
        is_deleted: false,
      },
    });

    if (!lead) {
      return res.status(404).json({
        message: "Lead not found",
      });
    }

    // Get all applications
    const applications = await Application.findAll({
      where: {},

      attributes: ["id"],
    });

    const applicationIds = applications.map((a) => a.id);

    // Get all payments
    const payments = await Payment.findAll({
      where: {
        user_id: req.user.id,
        is_deleted: false,
      },
      attributes: ["id", "application_id", "amount", "status"],
    });

    // Get fee records
    const feeRecords = await Payment.findAll({
      where: {
        user_id: req.user.id,
        amount: 0,
        is_deleted: false,
      },
      attributes: [
        "application_id",
        "total_fees",
        "scholarship_amount",
        "final_fees",
      ],
    });

    // Build fee map
    const feeMap = {};

    feeRecords.forEach((record) => {
      feeMap[record.application_id] = {
        total_fees: parseFloat(record.total_fees) || 0,
        scholarship_amount: parseFloat(record.scholarship_amount) || 0,
        final_fees:
          parseFloat(record.final_fees) || parseFloat(record.total_fees) || 0,
      };
    });

    // ─── TOTAL PAID ─────────────────────
    const total_paid = payments
      .filter((p) => p.status === "completed" && parseFloat(p.amount) > 0)
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    // ─── TOTAL PENDING ──────────────────
    const total_pending = payments
      .filter(
        (p) => p.status === "awaiting_verification" && parseFloat(p.amount) > 0,
      )
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    // ─── REJECTED COUNT ─────────────────
    const rejected_count = payments.filter(
      (p) => p.status === "rejected" && parseFloat(p.amount) > 0,
    ).length;

    // ─── FULLY PAID APPLICATIONS ────────
    let completed_count = 0;

    applications.forEach((app) => {
      const appPayments = payments.filter(
        (p) =>
          p.application_id === app.id &&
          p.status === "completed" &&
          parseFloat(p.amount) > 0,
      );

      const totalPaidForApp = appPayments.reduce(
        (sum, p) => sum + (parseFloat(p.amount) || 0),
        0,
      );

      const feeData = feeMap[app.id] || {
        final_fees: 0,
      };

      const finalFees = parseFloat(feeData.final_fees) || 0;

      if (finalFees > 0 && totalPaidForApp >= finalFees) {
        completed_count++;
      }
    });

    return res.status(200).json({
      success: true,
      stats: {
        total_paid,
        total_pending,
        completed_count,
        rejected_count,
      },
    });
  } catch (error) {
    console.error("Get payment stats error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
