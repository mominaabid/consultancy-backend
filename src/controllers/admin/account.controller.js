// controllers/admin/account.controller.js
import db from "../../models/mysql/index.js";
import rawDb from "../../config/db.js";
import {
  sendCreditNotificationEmail,
  sendDebitNotificationEmail,
} from "../../services/email.service.js";
import { storeNotification } from "../../utils/notificationHelper.js";
import sseManager from "../../utils/sseManager.js";

// Simple currency formatter for PKR
const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 2,
  }).format(amount);
};

// ==================== HELPERS ====================

const getCurrentBalance = async (applicationId) => {
  const [lastTx] = await rawDb.query(
    'SELECT * FROM student_accounts WHERE application_id = ? ORDER BY date DESC, id DESC LIMIT 1',
    [applicationId]
  );
  if (lastTx && lastTx.length > 0) return parseFloat(lastTx[0].balance);

  const [app] = await rawDb.query(
    'SELECT consultancy_fee FROM applications WHERE id = ? AND is_deleted = 0',
    [applicationId]
  );
  return app && app.length > 0 ? parseFloat(app[0].consultancy_fee) : 0;
};

const getAdminEmails = async () => {
  const [admins] = await rawDb.query(
    'SELECT email FROM users WHERE role = "admin" AND is_deleted = 0'
  );
  return admins.map((admin) => admin.email).filter((email) => email);
};

const getStudentAndAppDetails = async (applicationId) => {
  const [appRows] = await rawDb.query(
    'SELECT * FROM applications WHERE id = ? AND is_deleted = 0',
    [applicationId]
  );
  if (!appRows || appRows.length === 0) throw new Error("Application not found");
  const application = appRows[0];

  const [leadRows] = await rawDb.query(
    'SELECT * FROM leads WHERE id = ? AND is_deleted = 0',
    [application.lead_id]
  );
  if (!leadRows || leadRows.length === 0) throw new Error("Student lead not found");
  const lead = leadRows[0];

  let universityName = "";
  const [univRows] = await rawDb.query(
    'SELECT name FROM universities WHERE id = ? AND is_deleted = 0',
    [application.university_id]
  );
  if (univRows && univRows.length > 0) universityName = univRows[0].name;

  const studentName = lead.name;
  const appReference = `#${application.id} - ${universityName || application.university_id || 'N/A'}`;

  return {
    studentName,
    appReference,
    studentId: lead.id,
    userId: application.user_id,
  };
};

const getCounsellorIdForUser = async (userId) => {
  const [rows] = await rawDb.query(
    'SELECT id FROM counsellors WHERE user_id = ? AND is_deleted = 0',
    [userId]
  );
  return rows && rows.length > 0 ? rows[0].id : null;
};

// ==================== GET APPLICATIONS FOR ACCOUNTS ====================
export const getApplicationsForAccounts = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    let query = '';
    let params = [];

    if (userRole === "admin") {
      query = `
        SELECT 
          a.id as applicationId,
          l.id as studentId,
          l.name as studentName,
          l.email as studentEmail,
          u.name as university,
          a.course_id as course,
          a.consultancy_fee as payableAmount,
          a.status,
          a.created_at as createdAt,
          COALESCE(
            (SELECT SUM(credit) FROM student_accounts WHERE application_id = a.id),
            0
          ) as totalPaid
        FROM applications a
        LEFT JOIN leads l ON l.id = a.lead_id
        LEFT JOIN universities u ON u.id = a.university_id
        WHERE a.is_deleted = 0
        ORDER BY l.name ASC
      `;
      params = [];
    } else if (userRole === "counsellor") {
      const counsellorId = await getCounsellorIdForUser(userId);
      if (!counsellorId) {
        return res.json({ success: true, applications: [] });
      }

      query = `
        SELECT 
          a.id as applicationId,
          l.id as studentId,
          l.name as studentName,
          l.email as studentEmail,
          u.name as university,
          a.course_id as course,
          a.consultancy_fee as payableAmount,
          a.status,
          a.created_at as createdAt,
          COALESCE(
            (SELECT SUM(credit) FROM student_accounts WHERE application_id = a.id),
            0
          ) as totalPaid
        FROM applications a
        LEFT JOIN leads l ON l.id = a.lead_id
        LEFT JOIN universities u ON u.id = a.university_id
        WHERE a.is_deleted = 0 
          AND l.counsellor_id = ?
        ORDER BY l.name ASC
      `;
      params = [counsellorId];
    } else if (userRole === "student") {
      const [leadRows] = await rawDb.query(
        'SELECT id FROM leads WHERE user_id = ? AND is_deleted = 0',
        [userId]
      );
      if (!leadRows || leadRows.length === 0) {
        return res.json({ success: true, applications: [] });
      }
      const leadId = leadRows[0].id;

      query = `
        SELECT 
          a.id as applicationId,
          l.id as studentId,
          l.name as studentName,
          l.email as studentEmail,
          u.name as university,
          a.course_id as course,
          a.consultancy_fee as payableAmount,
          a.status,
          a.created_at as createdAt,
          COALESCE(
            (SELECT SUM(credit) FROM student_accounts WHERE application_id = a.id),
            0
          ) as totalPaid
        FROM applications a
        LEFT JOIN leads l ON l.id = a.lead_id
        LEFT JOIN universities u ON u.id = a.university_id
        WHERE a.is_deleted = 0 
          AND a.lead_id = ?
        ORDER BY a.created_at DESC
      `;
      params = [leadId];
    } else {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const [results] = await rawDb.query(query, params);

    const applications = results.map(app => ({
      ...app,
      totalPaid: parseFloat(app.totalPaid || 0),
      payableAmount: parseFloat(app.payableAmount || 0),
      balance: parseFloat(app.payableAmount || 0) - parseFloat(app.totalPaid || 0),
      course: app.course || '',
    }));

    res.json({ success: true, applications });
  } catch (error) {
    console.error("getApplicationsForAccounts error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== CREATE TRANSACTION ====================
export const createTransaction = async (req, res) => {
  try {
    const { application_id, paid_amount, date, description } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!application_id) {
      return res.status(400).json({ success: false, message: "Application ID is required" });
    }
    if (!paid_amount || isNaN(paid_amount) || parseFloat(paid_amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid paid amount (>0) is required",
      });
    }
    if (!date) {
      return res.status(400).json({ success: false, message: "Date is required" });
    }

    const paid = parseFloat(paid_amount);

    const [appRows] = await rawDb.query(
      'SELECT * FROM applications WHERE id = ? AND is_deleted = 0',
      [application_id]
    );
    if (!appRows || appRows.length === 0) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }
    const application = appRows[0];

    // Permission Check
    let hasAccess = false;
    if (userRole === "admin") {
      hasAccess = true;
    } else if (userRole === "counsellor") {
      const counsellorId = await getCounsellorIdForUser(userId);
      if (counsellorId) {
        const [leadRows] = await rawDb.query(
          'SELECT * FROM leads WHERE user_id = ? AND counsellor_id = ? AND is_deleted = 0',
          [application.user_id, counsellorId]
        );
        if (leadRows && leadRows.length > 0) hasAccess = true;
      }
    } else if (userRole === "student") {
      const [leadRows] = await rawDb.query(
        'SELECT * FROM leads WHERE user_id = ? AND is_deleted = 0',
        [userId]
      );
      if (leadRows && leadRows.length > 0) {
        const [appCheck] = await rawDb.query(
          'SELECT * FROM applications WHERE id = ? AND lead_id = ? AND is_deleted = 0',
          [application_id, leadRows[0].id]
        );
        if (appCheck && appCheck.length > 0) hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const currentBalance = await getCurrentBalance(application_id);
    if (paid > currentBalance) {
      return res.status(400).json({
        success: false,
        message: `Paid amount cannot exceed remaining balance (${currentBalance.toFixed(2)})`,
      });
    }

    const newBalance = currentBalance - paid;

    // Generate invoice number
    const [lastInvoice] = await rawDb.query(
      "SELECT invoice_no FROM student_accounts WHERE invoice_no LIKE 'PAY-%' ORDER BY id DESC LIMIT 1"
    );
    let nextNumber = 1;
    if (lastInvoice && lastInvoice.length > 0) {
      const match = lastInvoice[0].invoice_no.match(/PAY-(\d+)/);
      if (match) nextNumber = parseInt(match[1], 10) + 1;
    }
    const invoiceNo = `PAY-${String(nextNumber).padStart(2, "0")}`;

    const [result] = await rawDb.query(
      `INSERT INTO student_accounts 
        (invoice_no, student_id, user_id, application_id, transaction_type_id, debit, credit, balance, date, description, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        invoiceNo,
        application.user_id,
        userId,
        application_id,
        null,
        0,
        paid,
        newBalance,
        date,
        description || "Consultancy fee payment",
      ]
    );

    const transactionId = result.insertId;

    const [accountTx] = await rawDb.query(
      'SELECT * FROM student_accounts WHERE id = ?',
      [transactionId]
    );

    // Notifications
    const { studentName, appReference, userId: studentUserId } = await getStudentAndAppDetails(application_id);

    if (userRole === "admin" || userRole === "counsellor") {
      const message = `Payment Credited: ${formatCurrency(paid)} for application ${appReference}. Date: ${new Date(date).toLocaleString()}`;

      await storeNotification(studentUserId, "payment_credited", message, {
        studentName,
        applicationId: application_id,
        applicationReference: appReference,
        amount: paid,
        transactionType: "Payment Credited",
        transactionDate: date,
        creditedBy: req.user.name,
        description: description || "Consultancy fee payment",
      });

      sseManager.sendToUser(studentUserId, {
        type: "payment_credited",
        message,
        metadata: {
          applicationId: application_id,
          amount: paid,
          transactionDate: date,
        },
      });
    } else if (userRole === "student") {
      const [adminUsers] = await rawDb.query(
        'SELECT id, name, email FROM users WHERE role = "admin" AND is_deleted = 0'
      );

      const message = `Payment Received: ${formatCurrency(paid)} from student ${studentName} for application ${appReference}. Date: ${new Date(date).toLocaleString()}`;

      for (const admin of adminUsers) {
        await storeNotification(admin.id, "payment_received", message, {
          studentName,
          applicationId: application_id,
          applicationReference: appReference,
          amount: paid,
          transactionType: "Payment Received",
          transactionDate: date,
          description: description || "Consultancy fee payment",
        });

        sseManager.sendToUser(admin.id, {
          type: "payment_received",
          message,
          metadata: {
            applicationId: application_id,
            studentName,
            amount: paid,
            transactionDate: date,
          },
        });
      }
    }

    if (userRole === "admin") {
      try {
        const [leadRows] = await rawDb.query(
          'SELECT name, email FROM leads WHERE user_id = ? AND is_deleted = 0',
          [application.user_id]
        );
        const studentName = leadRows?.[0]?.name || "Student";
        const studentEmail = leadRows?.[0]?.email;

        const [appDetails] = await rawDb.query(
          'SELECT target_university, course FROM applications WHERE id = ?',
          [application_id]
        );
        const applicationDetails = appDetails?.[0]
          ? `${appDetails[0].target_university} (${appDetails[0].course})`
          : `Application #${application_id}`;

        const previousBalance = currentBalance;
        const remainingBalance = newBalance;
        const adminEmails = await getAdminEmails();

        await sendCreditNotificationEmail({
          studentName,
          studentEmail,
          applicationDetails,
          invoiceNumber: invoiceNo,
          creditedAmount: paid,
          previousBalance,
          remainingBalance,
          transactionDate: date,
          description: description || "Consultancy fee payment",
          adminEmails,
        });
      } catch (emailErr) {
        console.error("Failed to send credit notification email:", emailErr);
      }
    }

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      transaction: accountTx?.[0] || null,
      newBalance: newBalance,
    });
  } catch (error) {
    console.error("createTransaction error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== CREATE DEBIT TRANSACTION ====================
export const createDebitTransaction = async (req, res) => {
  try {
    const { application_id, debit_amount, date, description } = req.body;
    const userRole = req.user.role;

    if (userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only admin can debit fees.",
      });
    }

    if (!application_id) {
      return res.status(400).json({ success: false, message: "Application ID is required" });
    }
    if (!debit_amount || isNaN(debit_amount) || parseFloat(debit_amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid debit amount (>0) is required",
      });
    }
    if (!date) {
      return res.status(400).json({ success: false, message: "Date is required" });
    }

    const debit = parseFloat(debit_amount);

    const [appRows] = await rawDb.query(
      'SELECT * FROM applications WHERE id = ? AND is_deleted = 0',
      [application_id]
    );
    if (!appRows || appRows.length === 0) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }
    const application = appRows[0];

    const currentBalance = await getCurrentBalance(application_id);
    const newBalance = currentBalance + debit;

    const [lastInvoice] = await rawDb.query(
      "SELECT invoice_no FROM student_accounts WHERE invoice_no LIKE 'DEB-%' ORDER BY id DESC LIMIT 1"
    );
    let nextNumber = 1;
    if (lastInvoice && lastInvoice.length > 0) {
      const match = lastInvoice[0].invoice_no.match(/DEB-(\d+)/);
      if (match) nextNumber = parseInt(match[1], 10) + 1;
    }
    const invoiceNo = `DEB-${String(nextNumber).padStart(4, "0")}`;

    const [result] = await rawDb.query(
      `INSERT INTO student_accounts 
        (invoice_no, student_id, user_id, application_id, debit, credit, balance, date, description, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        invoiceNo,
        application.user_id,
        application.user_id,
        application_id,
        debit,
        0,
        newBalance,
        date,
        description || "Additional fee charged",
      ]
    );

    const transactionId = result.insertId;

    const [accountTx] = await rawDb.query(
      'SELECT * FROM student_accounts WHERE id = ?',
      [transactionId]
    );

    // Notifications
    const { studentName, appReference, userId: studentUserId } = await getStudentAndAppDetails(application_id);

    const message = `Consultancy Fee Added: ${formatCurrency(debit)} for application ${appReference}. Date: ${new Date(date).toLocaleString()}`;

    await storeNotification(studentUserId, "consultancy_fee_added", message, {
      studentName,
      applicationId: application_id,
      applicationReference: appReference,
      amount: debit,
      transactionType: "Consultancy Fee Added",
      transactionDate: date,
      description: description || "Additional fee charged",
    });

    sseManager.sendToUser(studentUserId, {
      type: "consultancy_fee_added",
      message,
      metadata: {
        applicationId: application_id,
        amount: debit,
        transactionDate: date,
      },
    });

    try {
      const [leadRows] = await rawDb.query(
        'SELECT name, email FROM leads WHERE user_id = ? AND is_deleted = 0',
        [application.user_id]
      );
      const studentName = leadRows?.[0]?.name || "Student";
      const studentEmail = leadRows?.[0]?.email;

      const [appDetails] = await rawDb.query(
        'SELECT target_university, course FROM applications WHERE id = ?',
        [application_id]
      );
      const applicationDetails = appDetails?.[0]
        ? `${appDetails[0].target_university} (${appDetails[0].course})`
        : `Application #${application_id}`;

      await sendDebitNotificationEmail({
        studentName,
        studentEmail,
        applicationDetails,
        invoiceNumber: invoiceNo,
        debitedAmount: debit,
        outstandingBalance: newBalance,
        transactionDate: date,
        description: description || "Additional fee charged",
      });
    } catch (emailErr) {
      console.error("Failed to send debit notification email:", emailErr);
    }

    res.status(201).json({
      success: true,
      message: "Debit recorded successfully",
      transaction: accountTx?.[0] || null,
      newBalance,
    });
  } catch (error) {
    console.error("createDebitTransaction error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET TRANSACTIONS BY APPLICATION ====================
export const getTransactionsByApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userRole = req.user.role;
    const userId = req.user.id;

    const [appRows] = await rawDb.query(
      'SELECT * FROM applications WHERE id = ? AND is_deleted = 0',
      [applicationId]
    );
    if (!appRows || appRows.length === 0) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }
    const application = appRows[0];

    let hasAccess = false;
    if (userRole === "admin") {
      hasAccess = true;
    } else if (userRole === "counsellor") {
      const counsellorId = await getCounsellorIdForUser(userId);
      if (counsellorId) {
        const [leadRows] = await rawDb.query(
          'SELECT * FROM leads WHERE user_id = ? AND counsellor_id = ? AND is_deleted = 0',
          [application.user_id, counsellorId]
        );
        if (leadRows && leadRows.length > 0) hasAccess = true;
      }
    } else if (userRole === "student") {
      const [leadRows] = await rawDb.query(
        'SELECT * FROM leads WHERE user_id = ? AND is_deleted = 0',
        [userId]
      );
      if (leadRows && leadRows.length > 0) {
        const [appCheck] = await rawDb.query(
          'SELECT * FROM applications WHERE id = ? AND lead_id = ? AND is_deleted = 0',
          [applicationId, leadRows[0].id]
        );
        if (appCheck && appCheck.length > 0) hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const [transactions] = await rawDb.query(
      'SELECT * FROM student_accounts WHERE application_id = ? ORDER BY date ASC, id ASC',
      [applicationId]
    );

    res.json({
      success: true,
      application: {
        id: application.id,
        consultancy_fee: application.consultancy_fee,
      },
      transactions: transactions || [],
    });
  } catch (error) {
    console.error("getTransactionsByApplication error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET APPLICATION BALANCE ====================
export const getApplicationBalance = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userRole = req.user.role;
    const userId = req.user.id;

    const [appRows] = await rawDb.query(
      'SELECT * FROM applications WHERE id = ? AND is_deleted = 0',
      [applicationId]
    );
    if (!appRows || appRows.length === 0) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }
    const application = appRows[0];

    let hasAccess = false;
    if (userRole === "admin") {
      hasAccess = true;
    } else if (userRole === "counsellor") {
      const counsellorId = await getCounsellorIdForUser(userId);
      if (counsellorId) {
        const [leadRows] = await rawDb.query(
          'SELECT * FROM leads WHERE user_id = ? AND counsellor_id = ? AND is_deleted = 0',
          [application.user_id, counsellorId]
        );
        if (leadRows && leadRows.length > 0) hasAccess = true;
      }
    } else if (userRole === "student") {
      const [leadRows] = await rawDb.query(
        'SELECT * FROM leads WHERE user_id = ? AND is_deleted = 0',
        [userId]
      );
      if (leadRows && leadRows.length > 0) {
        const [appCheck] = await rawDb.query(
          'SELECT * FROM applications WHERE id = ? AND lead_id = ? AND is_deleted = 0',
          [applicationId, leadRows[0].id]
        );
        if (appCheck && appCheck.length > 0) hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const [totalPaidResult] = await rawDb.query(
      'SELECT SUM(credit) as total FROM student_accounts WHERE application_id = ?',
      [applicationId]
    );
    const totalPaid = parseFloat(totalPaidResult?.[0]?.total || 0);
    const payable = parseFloat(application.consultancy_fee);
    const balance = payable - totalPaid;

    res.json({
      success: true,
      payableAmount: payable,
      totalPaid: totalPaid,
      balance: balance,
    });
  } catch (error) {
    console.error("getApplicationBalance error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET ALL TRANSACTIONS ====================
export const getAllTransactions = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Admin - Get ALL transactions
    if (userRole === "admin") {
      const [transactions] = await rawDb.query(
        'SELECT * FROM student_accounts ORDER BY date ASC, id ASC'
      );

      if (!transactions || transactions.length === 0) {
        return res.json({ success: true, transactions: [] });
      }

      // Get student names
      const appIds = [...new Set(transactions.map(tx => tx.application_id).filter(id => id))];
      
      const studentMap = {};
      if (appIds.length > 0) {
        const [leads] = await rawDb.query(
          `SELECT l.id, l.name, a.id as application_id 
           FROM leads l
           JOIN applications a ON a.lead_id = l.id
           WHERE a.id IN (?) AND a.is_deleted = 0`,
          [appIds]
        );
        leads.forEach(lead => {
          studentMap[lead.application_id] = lead.name;
        });
      }

      // ✅ FIX: Group transactions by application
      const appMap = {};
      transactions.forEach(tx => {
        if (!appMap[tx.application_id]) appMap[tx.application_id] = [];
        appMap[tx.application_id].push(tx);
      });

      const results = [];
      
      // ✅ Process EACH application separately
      for (const appId in appMap) {
        let runningBalance = 0;
        const appTxs = appMap[appId];
        
        for (const tx of appTxs) {
          const debitVal = parseFloat(tx.debit || 0);
          const creditVal = parseFloat(tx.credit || 0);
          const previousBalance = runningBalance;
          
          if (debitVal > 0) runningBalance = previousBalance + debitVal;
          else if (creditVal > 0) runningBalance = previousBalance - creditVal;

          results.push({
            id: tx.id,
            studentName: studentMap[tx.application_id] || "Unknown Student",
            invoiceNo: tx.invoice_no,
            debit: debitVal,
            credit: creditVal,
            balance: runningBalance,
            previousBalance: previousBalance,
            netBalance: runningBalance,
            date: tx.date,
            description: tx.description,
            applicationId: tx.application_id,
          });
        }
      }

      return res.json({ success: true, transactions: results });
    }

    // Counsellor
    if (userRole === "counsellor") {
      const counsellorId = await getCounsellorIdForUser(userId);
      if (!counsellorId) {
        return res.json({ success: true, transactions: [] });
      }

      const [leads] = await rawDb.query(
        'SELECT id, name FROM leads WHERE counsellor_id = ? AND is_deleted = 0',
        [counsellorId]
      );

      if (!leads || leads.length === 0) {
        return res.json({ success: true, transactions: [] });
      }

      const leadIds = leads.map(l => l.id);
      const leadMap = {};
      leads.forEach(l => { leadMap[l.id] = l.name; });

      const [apps] = await rawDb.query(
        'SELECT id, lead_id FROM applications WHERE lead_id IN (?) AND is_deleted = 0',
        [leadIds]
      );

      const appIds = apps.map(a => a.id);
      const appLeadMap = {};
      apps.forEach(a => { appLeadMap[a.id] = a.lead_id; });

      if (appIds.length === 0) {
        return res.json({ success: true, transactions: [] });
      }

      const [transactions] = await rawDb.query(
        'SELECT * FROM student_accounts WHERE application_id IN (?) ORDER BY date ASC, id ASC',
        [appIds]
      );

      // ✅ FIX: Group transactions by application
      const appMap = {};
      transactions.forEach(tx => {
        if (!appMap[tx.application_id]) appMap[tx.application_id] = [];
        appMap[tx.application_id].push(tx);
      });

      const results = [];
      
      // ✅ Process EACH application separately
      for (const appId in appMap) {
        let runningBalance = 0;
        const appTxs = appMap[appId];
        
        for (const tx of appTxs) {
          const debitVal = parseFloat(tx.debit || 0);
          const creditVal = parseFloat(tx.credit || 0);
          const previousBalance = runningBalance;
          
          if (debitVal > 0) runningBalance = previousBalance + debitVal;
          else if (creditVal > 0) runningBalance = previousBalance - creditVal;

          const leadId = appLeadMap[tx.application_id];
          results.push({
            id: tx.id,
            studentName: leadMap[leadId] || "Unknown Student",
            invoiceNo: tx.invoice_no,
            debit: debitVal,
            credit: creditVal,
            balance: runningBalance,
            previousBalance: previousBalance,
            netBalance: runningBalance,
            date: tx.date,
            description: tx.description,
            applicationId: tx.application_id,
          });
        }
      }

      return res.json({ success: true, transactions: results });
    }

    // Student
    if (userRole === "student") {
      console.log("🎓 Student ID:", userId);
      
      const [leadRows] = await rawDb.query(
        'SELECT id FROM leads WHERE user_id = ? AND is_deleted = 0',
        [userId]
      );

      if (!leadRows || leadRows.length === 0) {
        console.log("⚠️ No lead found for student");
        return res.json({ success: true, transactions: [] });
      }

      const leadId = leadRows[0].id;
      console.log("📊 Lead ID:", leadId);

      const [apps] = await rawDb.query(
        'SELECT id FROM applications WHERE lead_id = ? AND is_deleted = 0',
        [leadId]
      );
      console.log("📊 Applications found:", apps);

      const appIds = apps.map(a => a.id);
      console.log("📊 Application IDs:", appIds);

      if (appIds.length === 0) {
        console.log("⚠️ No applications found for student");
        return res.json({ success: true, transactions: [] });
      }

      const [transactions] = await rawDb.query(
        'SELECT * FROM student_accounts WHERE application_id IN (?) ORDER BY date ASC, id ASC',
        [appIds]
      );
      console.log("📊 Transactions found:", transactions?.length || 0);

      if (!transactions || transactions.length === 0) {
        return res.json({ success: true, transactions: [] });
      }

      // ✅ FIX: Group transactions by application
      const appMap = {};
      transactions.forEach(tx => {
        if (!appMap[tx.application_id]) appMap[tx.application_id] = [];
        appMap[tx.application_id].push(tx);
      });

      const results = [];
      
      // ✅ Process EACH application separately
      for (const appId in appMap) {
        let runningBalance = 0;
        const appTxs = appMap[appId];
        
        for (const tx of appTxs) {
          const debitVal = parseFloat(tx.debit || 0);
          const creditVal = parseFloat(tx.credit || 0);
          const previousBalance = runningBalance;
          
          if (debitVal > 0) runningBalance = previousBalance + debitVal;
          else if (creditVal > 0) runningBalance = previousBalance - creditVal;

          results.push({
            id: tx.id,
            studentName: req.user.name || "Student",
            invoiceNo: tx.invoice_no,
            debit: debitVal,
            credit: creditVal,
            balance: runningBalance,
            previousBalance: previousBalance,
            netBalance: runningBalance,
            date: tx.date,
            description: tx.description,
            applicationId: tx.application_id,
          });
        }
      }

      return res.json({ success: true, transactions: results });
    }

    return res.status(403).json({ success: false, message: "Access denied" });
  } catch (error) {
    console.error("getAllTransactions error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};