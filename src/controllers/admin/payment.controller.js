// src/controllers/admin/payment.controller.js
import rawDb from "../../config/db.js";
import db from "../../models/mysql/index.js";
import { logActivity } from "../../services/activityLog.service.js";
import { storeNotification } from "../../utils/notificationHelper.js";
import sseManager from "../../utils/sseManager.js";

const { Application, User, Lead } = db;

// ✅ Helper: Get fee record from student_accounts
async function getFeeRecord(applicationId) {
    const [feeRecord] = await rawDb.query(
        `SELECT * FROM student_accounts 
         WHERE application_id = ? AND debit = 0 AND credit = 0 
         ORDER BY created_at DESC LIMIT 1`,
        [applicationId]
    );
    return feeRecord || null;
}

// ✅ Helper: Get total paid for application
async function getTotalPaid(applicationId) {
    const [result] = await rawDb.query(
        `SELECT SUM(debit) as total_paid 
         FROM student_accounts 
         WHERE application_id = ? AND debit > 0`,
        [applicationId]
    );
    return parseFloat(result?.total_paid) || 0;
}

// ✅ Helper: Get all payments for application
async function getApplicationPayments(applicationId) {
    return await rawDb.query(
        `SELECT * FROM student_accounts 
         WHERE application_id = ? AND debit > 0
         ORDER BY created_at DESC`,
        [applicationId]
    );
}

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

        const application = await Application.findByPk(application_id);
        if (!application) {
            return res.status(404).json({ message: "Application not found" });
        }

        const scholarshipAmount = parseFloat(scholarship) || 0;
        const totalFeesAmount = parseFloat(total_fees) || 0;
        const finalFeesAmount = parseFloat(final_fees) || totalFeesAmount - scholarshipAmount;

        // Check if fee record exists
        const existingFee = await getFeeRecord(application_id);

        if (existingFee) {
            // Update existing fee record
            await rawDb.query(
                `UPDATE student_accounts 
                 SET debit = ?, credit = ?, 
                     description = ?,
                     updated_at = NOW()
                 WHERE id = ?`,
                [
                    totalFeesAmount,
                    scholarshipAmount,
                    `Total: ${total_fees}, Scholarship: ${scholarship || 0}`,
                    existingFee.id
                ]
            );
        } else {
            // Create new fee record
            await rawDb.query(
                `INSERT INTO student_accounts 
                 (application_id, student_id, debit, credit, 
                  description, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
                [
                    application_id,
                    application.user_id,
                    totalFeesAmount,
                    scholarshipAmount,
                    `Total: ${total_fees}, Scholarship: ${scholarship || 0}`
                ]
            );
        }

        res.json({
            success: true,
            message: "Fees updated successfully",
            data: {
                total_fees: totalFeesAmount,
                scholarship_amount: scholarshipAmount,
                scholarship_type,
                final_fees: finalFeesAmount,
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

        let dateFilter = '';
        const params = [];
        if (start && end) {
            dateFilter = ' AND created_at BETWEEN ? AND ?';
            params.push(new Date(start), new Date(end));
        }

        const applications = await rawDb.query(
            `SELECT * FROM applications 
             WHERE is_deleted = 0 ${dateFilter}
             ORDER BY created_at DESC`,
            params
        );

        const studentsWithPayments = await Promise.all(
            applications.map(async (app) => {
                const user = await rawDb.query(
                    'SELECT id, name, email FROM users WHERE id = ? AND is_deleted = 0',
                    [app.user_id]
                );

                const feeRecord = await getFeeRecord(app.id);
                const payments = await getApplicationPayments(app.id);
                
                const totalPaid = payments
                    .filter(p => p.debit > 0)
                    .reduce((sum, p) => sum + (parseFloat(p.debit) || 0), 0);
                    
                const totalFees = feeRecord?.debit || 0;
                const scholarshipAmount = feeRecord?.credit || 0;
                const finalFees = totalFees - scholarshipAmount;
                const remaining = finalFees - totalPaid;

                const payment_status = remaining <= 0 ? "completed" : "in-progress";

                return {
                    id: app.id,
                    user_id: app.user_id,
                    student_name: user[0]?.name || app.full_name,
                    student_email: user[0]?.email || app.email,
                    university_name: app.target_university,
                    course: app.course,
                    consultancy_fee: app.consultancy_fee,
                    total_fees: totalFees,
                    scholarship_amount: scholarshipAmount,
                    final_fees: finalFees,
                    total_paid: totalPaid,
                    remaining_amount: remaining > 0 ? remaining : 0,
                    payment_status,
                    payments_count: payments.filter(p => p.debit > 0).length,
                    status: app.status,
                };
            })
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

        const paymentStatus = status || "completed";
        const finalAmount = parseFloat(amount);

        // Insert payment into student_accounts
        const [result] = await rawDb.query(
            `INSERT INTO student_accounts 
             (application_id, student_id, debit, description, 
              invoice_no, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
            [
                application_id,
                user_id || application.user_id,
                finalAmount,
                `Payment: ${payment_type || 'consultancy_fee'} | Mode: ${mode} | ${notes || ''}`,
                reference_no || transaction_id || null
            ]
        );

        const paymentId = result.insertId;

        // Get the created payment
        const [payment] = await rawDb.query(
            'SELECT * FROM student_accounts WHERE id = ?',
            [paymentId]
        );

        // --- Notification ---
        if (paymentStatus === "completed") {
            try {
                const feeRecord = await getFeeRecord(application.id);
                let finalFees = 0;
                if (feeRecord) {
                    finalFees = parseFloat(feeRecord.debit) - parseFloat(feeRecord.credit || 0);
                }

                const totalPaid = await getTotalPaid(application.id);
                const overallStatus = finalFees > 0 && totalPaid >= finalFees ? "completed" : "in-progress";

                const amountFormatted = finalAmount.toFixed(2);
                const university = application.target_university || "your application";
                const course = application.course || "";

                let message = `Admin has added a payment of ${amountFormatted} for your application to ${university} (${course}). `;
                if (finalFees > 0) {
                    message += `Total paid: ${totalPaid.toFixed(2)} out of ${finalFees.toFixed(2)}. Status: ${overallStatus.toUpperCase()}.`;
                }

                const metadata = {
                    paymentId: payment.id,
                    applicationId: application.id,
                    amount: finalAmount,
                    totalPaid: totalPaid,
                    finalFees: finalFees,
                    overallStatus: overallStatus,
                    university,
                    course,
                    addedBy: req.user.name || req.user.email,
                };

                const studentId = application.user_id;
                await storeNotification(studentId, "payment_added_by_admin", message, metadata);
                sseManager.sendToUser(studentId, {
                    type: "payment_added_by_admin",
                    message,
                    metadata,
                });

                console.log(`Payment notification sent to student ${studentId}`);
            } catch (notifError) {
                console.error("Failed to send payment notification:", notifError);
            }
        }

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
            payment: payment,
        });
    } catch (error) {
        console.error("Error in addPayment:", error);
        res.status(500).json({ message: error.message });
    }
}

// src/controllers/admin/payment.controller.js

export async function getAllPayments(req, res) {
    try {
        const { start, end } = req.query;

        let sql = `
            SELECT 
                sa.*,
                a.status as application_status,
                a.consultancy_fee,
                u.name as student_name, 
                u.email as student_email,
                ru.name as recorded_by_name,
                uni.name as university_name,
                c.name as course_name,
                co.name as country_name
            FROM student_accounts sa
            LEFT JOIN applications a ON sa.application_id = a.id AND a.is_deleted = 0
            LEFT JOIN users u ON sa.student_id = u.id AND u.is_deleted = 0
            LEFT JOIN users ru ON sa.user_id = ru.id
            LEFT JOIN universities uni ON a.university_id = uni.id AND uni.is_active = 1
            LEFT JOIN config_values c ON a.course_id = c.id AND c.type = 'course'
            LEFT JOIN countries co ON a.country_id = co.id AND co.is_active = 1
            WHERE sa.debit > 0
        `;
        const params = [];

        if (start && end) {
            sql += ` AND sa.created_at BETWEEN ? AND ?`;
            params.push(new Date(start), new Date(end));
        }

        sql += ` ORDER BY sa.created_at DESC`;

        const payments = await rawDb.query(sql, params);

        // Format payments with proper column names
        const formattedPayments = payments.map(p => ({
            ...p,
            university: p.university_name || 'N/A',
            course: p.course_name || 'N/A',
            country: p.country_name || 'N/A',
        }));

        const actualPayments = formattedPayments.filter(p => p.debit > 0);

        const summary = {
            total_amount: actualPayments
                .reduce((sum, p) => sum + (parseFloat(p.debit) || 0), 0),
            completed_count: actualPayments.length,
            pending_count: 0,
            in_progress_count: 0,
            rejected_count: 0,
        };

        res.json({ 
            success: true, 
            payments: actualPayments, 
            summary 
        });
    } catch (error) {
        console.error("Get payments error:", error);
        res.status(500).json({ 
            success: false, 
            message: error.message,
            data: [] 
        });
    }
}

export async function deletePayment(req, res) {
    try {
        const { id } = req.params;

        const [payment] = await rawDb.query(
            'SELECT * FROM student_accounts WHERE id = ?',
            [id]
        );

        if (!payment) {
            return res.status(404).json({ message: "Payment not found" });
        }

        // Soft delete - update is_deleted if column exists, or just remove
        await rawDb.query('DELETE FROM student_accounts WHERE id = ?', [id]);

        const lead = await Lead.findOne({ where: { user_id: payment.student_id } });
        if (lead) {
            await logActivity({
                leadId: lead.id,
                actionType: "payment_deleted",
                note: `Payment of ${payment.debit} deleted`,
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

        let sql = `
            SELECT sa.*, 
                   a.target_university, a.course,
                   u.name as student_name, u.email as student_email
            FROM student_accounts sa
            LEFT JOIN applications a ON sa.application_id = a.id AND a.is_deleted = 0
            LEFT JOIN users u ON sa.student_id = u.id AND u.is_deleted = 0
            WHERE sa.debit > 0
        `;
        const params = [];

        if (start && end) {
            sql += ` AND sa.created_at BETWEEN ? AND ?`;
            params.push(new Date(start), new Date(end));
        }

        sql += ` ORDER BY sa.created_at DESC`;

        const payments = await rawDb.query(sql, params);

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

        const [payment] = await rawDb.query(
            'SELECT * FROM student_accounts WHERE id = ?',
            [id]
        );

        if (!payment) {
            return res.status(404).json({ message: "Payment not found" });
        }

        // Get application info
        const [application] = await rawDb.query(
            'SELECT * FROM applications WHERE id = ? AND is_deleted = 0',
            [payment.application_id]
        );

        const studentId = payment.student_id;
        const university = application?.target_university || "your application";
        const course = application?.course || "";
        const amount = parseFloat(payment.debit).toFixed(2);

        if (action === "approve") {
            // Already in student_accounts, just notify
            const lead = await Lead.findOne({ where: { user_id: payment.student_id } });
            if (lead) {
                await logActivity({
                    leadId: lead.id,
                    actionType: "payment_approved",
                    note: `Payment of ${payment.debit} approved`,
                    performedBy: req.user.id,
                    performedByRole: req.user.role,
                    performedByName: req.user.name,
                });
            }

            const message = `Your payment of ${amount} for ${university} (${course}) has been approved.`;
            const metadata = {
                paymentId: payment.id,
                applicationId: payment.application_id,
                amount: payment.debit,
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

            res.json({
                success: true,
                message: "Payment approved successfully",
                payment,
            });
        } else if (action === "reject") {
            // Remove the payment from student_accounts
            await rawDb.query('DELETE FROM student_accounts WHERE id = ?', [id]);

            const lead = await Lead.findOne({ where: { user_id: payment.student_id } });
            if (lead) {
                await logActivity({
                    leadId: lead.id,
                    actionType: "payment_rejected",
                    note: `Payment of ${payment.debit} rejected. Reason: ${rejection_reason}`,
                    performedBy: req.user.id,
                    performedByRole: req.user.role,
                    performedByName: req.user.name,
                });
            }

            const reasonText = rejection_reason ? ` Reason: ${rejection_reason}` : "";
            const message = `Your payment of ${amount} for ${university} (${course}) has been rejected.${reasonText}`;
            const metadata = {
                paymentId: payment.id,
                applicationId: payment.application_id,
                amount: payment.debit,
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

            res.json({
                success: true,
                message: "Payment rejected successfully",
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
        const [payment] = await rawDb.query(
            'SELECT * FROM student_accounts WHERE id = ?',
            [id]
        );

        if (!payment) {
            return res.status(404).json({ message: "Payment not found" });
        }

        // Check if description contains proof URL
        const proofUrl = payment.description?.match(/proof:\s*(.*)/)?.[1] || null;

        res.json({ success: true, proof_url: proofUrl });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
}

export async function getStudentPayments(req, res) {
    try {
        const { studentId, applicationId } = req.params;
        const { start, end } = req.query;

        let sql = `
            SELECT sa.*, 
                   a.target_university, a.course, a.status as application_status,
                   ru.name as recorded_by_name
            FROM student_accounts sa
            LEFT JOIN applications a ON sa.application_id = a.id AND a.is_deleted = 0
            LEFT JOIN users ru ON sa.user_id = ru.id
            WHERE sa.student_id = ? AND sa.application_id = ? AND sa.debit > 0
        `;
        const params = [studentId, applicationId];

        if (start && end) {
            sql += ` AND sa.created_at BETWEEN ? AND ?`;
            params.push(new Date(start), new Date(end));
        }

        sql += ` ORDER BY sa.created_at DESC`;

        const payments = await rawDb.query(sql, params);

        const totalPaid = payments
            .filter(p => p.debit > 0)
            .reduce((sum, p) => sum + (parseFloat(p.debit) || 0), 0);

        res.json({
            success: true,
            payments: payments,
            total_paid: totalPaid,
            total_count: payments.length,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
}