// src/controllers/student/payment.controller.js
import rawDb from "../../config/db.js";
import db from "../../models/mysql/index.js";
import { uploadPaymentProof } from "../../services/fileUpload.service.js";
import { storeNotification } from "../../utils/notificationHelper.js";
import sseManager from "../../utils/sseManager.js";

const { Application, User, Lead } = db;

// ✅ Helper: Get fee record
async function getFeeRecord(applicationId) {
    const [feeRecord] = await rawDb.query(
        `SELECT * FROM student_accounts 
         WHERE application_id = ? AND debit = 0 AND credit = 0 
         ORDER BY created_at DESC LIMIT 1`,
        [applicationId]
    );
    return feeRecord || null;
}

// ✅ Helper: Get total paid
async function getTotalPaid(applicationId) {
    const [result] = await rawDb.query(
        `SELECT SUM(debit) as total_paid 
         FROM student_accounts 
         WHERE application_id = ? AND debit > 0`,
        [applicationId]
    );
    return parseFloat(result?.total_paid) || 0;
}

// src/controllers/student/payment.controller.js

export async function getMyPayments(req, res) {
    try {
        const lead = await Lead.findOne({
            where: { email: req.user.email, is_deleted: false },
        });

        if (!lead) {
            return res.status(404).json({ message: "Lead not found" });
        }

        const payments = await rawDb.query(
            `SELECT 
                sa.*,
                a.status as application_status,
                a.consultancy_fee,
                uni.name as university_name,
                c.name as course_name,
                co.name as country_name
             FROM student_accounts sa
             LEFT JOIN applications a ON sa.application_id = a.id AND a.is_deleted = 0
             LEFT JOIN universities uni ON a.university_id = uni.id AND uni.is_active = 1
             LEFT JOIN config_values c ON a.course_id = c.id AND c.type = 'course'
             LEFT JOIN countries co ON a.country_id = co.id AND co.is_active = 1
             WHERE sa.student_id = ? AND sa.debit > 0
             ORDER BY sa.created_at DESC`,
            [req.user.id]
        );

        // Format payments
        const formattedPayments = payments.map(p => ({
            ...p,
            target_university: p.university_name || 'N/A',
            course: p.course_name || 'N/A',
            target_country: p.country_name || 'N/A',
        }));

        const feeRecords = await rawDb.query(
            `SELECT application_id, debit as total_fees, credit as scholarship_amount
             FROM student_accounts 
             WHERE student_id = ? AND debit = 0 AND credit >= 0`,
            [req.user.id]
        );

        const feeInfo = {};
        feeRecords.forEach((record) => {
            feeInfo[record.application_id] = {
                total_fees: parseFloat(record.total_fees) || 0,
                scholarship_amount: parseFloat(record.scholarship_amount) || 0,
                final_fees: parseFloat(record.total_fees) - parseFloat(record.scholarship_amount || 0) || 0,
            };
        });

        const totalPaid = formattedPayments
            .filter(p => p.debit > 0)
            .reduce((sum, p) => sum + (parseFloat(p.debit) || 0), 0);

        res.json({
            success: true,
            payments: formattedPayments,
            feeInfo: feeInfo,
            summary: {
                total_paid: totalPaid,
                total_pending: 0,
                completed_count: formattedPayments.length,
                pending_count: 0,
                rejected_count: 0,
            },
        });
    } catch (error) {
        console.error("Get my payments error:", error);
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

        // Insert payment into student_accounts
        const [result] = await rawDb.query(
            `INSERT INTO student_accounts 
             (application_id, student_id, debit, description, 
              invoice_no, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
            [
                application_id,
                req.user.id,
                parseFloat(amount),
                `Student payment | Mode: ${mode} | ${notes || ''}${proofUrl ? ' | proof: ' + proofUrl : ''}`,
                `PAY-${Date.now()}`
            ]
        );

        const paymentId = result.insertId;

        // Get created payment
        const [payment] = await rawDb.query(
            'SELECT * FROM student_accounts WHERE id = ?',
            [paymentId]
        );

        // Notify admins
        try {
            const student = await User.findByPk(req.user.id, {
                attributes: ["id", "name", "email"],
            });

            const studentName = student?.name || "A student";
            const university = application.target_university || "Unknown university";
            const course = application.course || "Unknown course";
            const amountFormatted = parseFloat(amount).toFixed(2);

            const message = `${studentName} has added a payment of ${amountFormatted} for application to ${university} (${course}). Please verify.`;

            const metadata = {
                paymentId: payment.id,
                applicationId: application.id,
                studentId: req.user.id,
                studentName: studentName,
                amount: parseFloat(amount),
                mode: mode,
                university: university,
                course: course,
            };

            const admins = await User.findAll({
                where: { role: "admin", is_deleted: false },
                attributes: ["id"],
            });

            for (const admin of admins) {
                await storeNotification(
                    admin.id,
                    "payment_awaiting_verification",
                    message,
                    metadata,
                );
                sseManager.sendToUser(admin.id, {
                    type: "payment_awaiting_verification",
                    message: message,
                    metadata: metadata,
                });
            }

            console.log(`Payment notification sent to ${admins.length} admin(s)`);
        } catch (notifError) {
            console.error("Failed to send payment notification:", notifError);
        }

        res.status(201).json({
            success: true,
            message: "Payment submitted successfully! Please wait for admin verification.",
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

        const applications = await rawDb.query(
            'SELECT id FROM applications WHERE is_deleted = 0'
        );

        const payments = await rawDb.query(
            `SELECT id, application_id, debit as amount
             FROM student_accounts 
             WHERE student_id = ? AND debit > 0`,
            [req.user.id]
        );

        const feeRecords = await rawDb.query(
            `SELECT application_id, debit as total_fees, credit as scholarship_amount
             FROM student_accounts 
             WHERE student_id = ? AND debit = 0`,
            [req.user.id]
        );

        const feeMap = {};
        feeRecords.forEach((record) => {
            feeMap[record.application_id] = {
                total_fees: parseFloat(record.total_fees) || 0,
                scholarship_amount: parseFloat(record.scholarship_amount) || 0,
                final_fees: parseFloat(record.total_fees) - parseFloat(record.scholarship_amount || 0) || 0,
            };
        });

        const total_paid = payments
            .filter(p => parseFloat(p.amount) > 0)
            .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

        let completed_count = 0;
        applications.forEach((app) => {
            const appPayments = payments.filter(p => p.application_id === app.id);
            const totalPaidForApp = appPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
            const feeData = feeMap[app.id] || { final_fees: 0 };
            const finalFees = parseFloat(feeData.final_fees) || 0;

            if (finalFees > 0 && totalPaidForApp >= finalFees) {
                completed_count++;
            }
        });

        return res.status(200).json({
            success: true,
            stats: {
                total_paid,
                total_pending: 0,
                completed_count,
                rejected_count: 0,
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