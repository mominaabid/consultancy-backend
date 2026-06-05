// controllers/admin/account.controller.js
import db from "../../models/mysql/index.js";
import { Op } from "sequelize";
import sequelize from "../../config/db.js";

const { AccountTransaction, Application, Lead, User } = db;

/**
 * Helper: Get current balance for an application
 */
const getCurrentBalance = async (applicationId) => {
  const lastTx = await AccountTransaction.findOne({
    where: { application_id: applicationId },
    order: [
      ["date", "DESC"],
      ["id", "DESC"],
    ],
  });
  if (lastTx) return parseFloat(lastTx.balance);

  // No transaction yet: balance = consultancy_fee
  const app = await Application.findByPk(applicationId, {
    attributes: ["consultancy_fee"],
  });
  return app ? parseFloat(app.consultancy_fee) : 0;
};

/**
 * GET /api/accounts/applications
 * Returns list of all applications with student info, payable amount, total paid, balance.
 * Accessible by admin, counsellors (see only their students), and students (see only their own lead)
 */
export const getApplicationsForAccounts = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    let leadWhere = { is_deleted: false };
    if (userRole === "counsellor") {
      leadWhere.counsellor_id = userId;
    } else if (userRole === "student") {
      // Student sees only his own lead
      leadWhere.user_id = userId;
    }
    // admin sees all leads (no extra condition)

    const leads = await Lead.findAll({
      where: leadWhere,
      attributes: ["id", "user_id", "name", "email"],
      include: [
        {
          model: Application,
          as: "applications",
          required: true, // only leads that have at least one application
          attributes: [
            "id",
            "target_university",
            "course",
            "consultancy_fee",
            "status",
            "created_at",
          ],
        },
      ],
    });

    const results = [];
    for (const lead of leads) {
      for (const app of lead.applications) {
        // Calculate total paid for this application
        const totalPaidResult = await AccountTransaction.sum("credit", {
          where: { application_id: app.id, debit: 0 },
        });
        const totalPaid = parseFloat(totalPaidResult || 0);
        const payable = parseFloat(app.consultancy_fee || 0);
        const balance = payable - totalPaid;

        results.push({
          applicationId: app.id,
          studentId: lead.id,
          studentName: lead.name,
          studentEmail: lead.email,
          university: app.target_university,
          course: app.course,
          payableAmount: payable,
          totalPaid: totalPaid,
          balance: balance,
          status: app.status,
          createdAt: app.created_at,
        });
      }
    }

    res.json({ success: true, applications: results });
  } catch (error) {
    console.error("getApplicationsForAccounts error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};



/**
 * POST /api/accounts/transactions
 * Create a new payment transaction.
 * Body: { application_id, paid_amount, date, description }
 * Allowed: admin, counsellor (assigned to student), student (owner of the lead)
 */
export const createTransaction = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { application_id, paid_amount, date, description } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Validation
    if (!application_id) {
      return res
        .status(400)
        .json({ success: false, message: "Application ID is required" });
    }
    if (!paid_amount || isNaN(paid_amount) || parseFloat(paid_amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid paid amount (>0) is required",
      });
    }
    if (!date) {
      return res
        .status(400)
        .json({ success: false, message: "Date is required" });
    }

    const paid = parseFloat(paid_amount);

    // Fetch application and validate permissions
    const application = await Application.findByPk(application_id, {
      attributes: ["id", "user_id", "consultancy_fee"],
    });
    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    // ----- Permission Check -----
    let hasAccess = false;

    if (userRole === "admin") {
      hasAccess = true;
    } else if (userRole === "counsellor") {
      // Counsellor can add payment only if assigned to this student's lead
      const lead = await Lead.findOne({
        where: {
          user_id: application.user_id,
          counsellor_id: userId,
          is_deleted: false,
        },
      });
      if (lead) hasAccess = true;
    } else if (userRole === "student") {
      // Student can add payment only for his own lead
      const lead = await Lead.findOne({
        where: { user_id: userId, is_deleted: false },
        include: [
          {
            model: Application,
            as: "applications",
            where: { id: application_id },
            required: true,
          },
        ],
      });
      if (lead) hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    // ----- End Permission Check -----

    // Get current balance before this payment
    const currentBalance = await getCurrentBalance(application_id);
    if (paid > currentBalance) {
      return res.status(400).json({
        success: false,
        message: `Paid amount cannot exceed remaining balance (${currentBalance.toFixed(2)})`,
      });
    }

    const newBalance = currentBalance - paid;

    // --- Generate sequential invoice number (PAY-0001, PAY-0002, ...) ---
    // Find the latest transaction with invoice_no like 'PAY-%' (ordered by id descending)
    const lastInvoice = await AccountTransaction.findOne({
      where: { invoice_no: { [Op.like]: 'PAY-%' } },
      order: [['id', 'DESC']],
      attributes: ['invoice_no'],
      transaction, // use the same transaction to avoid race conditions
    });

    let nextNumber = 1;
    if (lastInvoice) {
      const match = lastInvoice.invoice_no.match(/PAY-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }
    const invoiceNo = `PAY-${String(nextNumber).padStart(2, '0')}`;
    // ---------------------------------------------------------------

    // Create transaction record
    const accountTx = await AccountTransaction.create({
      invoice_no: invoiceNo,
      user_id: application.user_id,
      application_id: application.id,
      debit: 0,
      credit: paid,
      balance: newBalance,
      date: date,
      description: description || "Consultancy fee payment",
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      transaction: accountTx,
      newBalance: newBalance,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("createTransaction error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/accounts/transactions/application/:applicationId
 * Returns all transactions for a specific application (with running balance)
 * Accessible by admin, counsellor (assigned to student), and student (owner)
 */
export const getTransactionsByApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userRole = req.user.role;
    const userId = req.user.id;

    // Verify application exists
    const application = await Application.findByPk(applicationId, {
      attributes: ["id", "user_id", "consultancy_fee"],
    });
    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    // ----- Permission Check -----
    let hasAccess = false;

    if (userRole === "admin") {
      hasAccess = true;
    } else if (userRole === "counsellor") {
      const lead = await Lead.findOne({
        where: {
          user_id: application.user_id,
          counsellor_id: userId,
          is_deleted: false,
        },
      });
      if (lead) hasAccess = true;
    } else if (userRole === "student") {
      // Student can view his own application
      const lead = await Lead.findOne({
        where: { user_id: userId, is_deleted: false },
        include: [
          {
            model: Application,
            as: "applications",
            where: { id: applicationId },
            required: true,
          },
        ],
      });
      if (lead) hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    // ----- End Permission Check -----

    const transactions = await AccountTransaction.findAll({
      where: { application_id: applicationId },
      order: [
        ["date", "ASC"],
        ["id", "ASC"],
      ],
      attributes: [
        "id",
        "invoice_no",
        "debit",
        "credit",
        "balance",
        "date",
        "description",
        "created_at",
      ],
    });

    res.json({
      success: true,
      application: {
        id: application.id,
        consultancy_fee: application.consultancy_fee,
      },
      transactions,
    });
  } catch (error) {
    console.error("getTransactionsByApplication error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/accounts/balance/:applicationId
 * Returns current payable amount, total paid, and remaining balance
 * Accessible by admin, counsellor (assigned to student), and student (owner)
 */
export const getApplicationBalance = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userRole = req.user.role;
    const userId = req.user.id;

    const application = await Application.findByPk(applicationId, {
      attributes: ["id", "user_id", "consultancy_fee"],
    });
    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    // ----- Permission Check -----
    let hasAccess = false;

    if (userRole === "admin") {
      hasAccess = true;
    } else if (userRole === "counsellor") {
      const lead = await Lead.findOne({
        where: {
          user_id: application.user_id,
          counsellor_id: userId,
          is_deleted: false,
        },
      });
      if (lead) hasAccess = true;
    } else if (userRole === "student") {
      const lead = await Lead.findOne({
        where: { user_id: userId, is_deleted: false },
        include: [
          {
            model: Application,
            as: "applications",
            where: { id: applicationId },
            required: true,
          },
        ],
      });
      if (lead) hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    // ----- End Permission Check -----

    const totalPaid = parseFloat(
      (await AccountTransaction.sum("credit", {
        where: { application_id: applicationId, debit: 0 },
      })) || 0,
    );
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

/**
 * GET /api/accounts/all-transactions
 * Returns all transactions with student names, running balances (for ledger view)
 * Accessible by admin, counsellors (see only their students), and students (see only their own)
 */
export const getAllTransactions = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    // Build where clause for leads based on role
    let leadWhere = { is_deleted: false };
    if (userRole === "counsellor") {
      leadWhere.counsellor_id = userId;
    } else if (userRole === "student") {
      leadWhere.user_id = userId;
    }
    // admin sees all leads (no extra condition)

    // Get all leads with their applications (for permission filtering)
    const leads = await Lead.findAll({
      where: leadWhere,
      attributes: ["id", "name", "email"],
      include: [
        {
          model: Application,
          as: "applications",
          required: true,
          attributes: ["id"],
        },
      ],
    });

    const allowedAppIds = leads.flatMap((lead) =>
      lead.applications.map((app) => app.id),
    );

    if (allowedAppIds.length === 0) {
      return res.json({ success: true, transactions: [] });
    }

    // Fetch all transactions for allowed applications
    const transactions = await AccountTransaction.findAll({
      where: { application_id: allowedAppIds },
      order: [
        ["date", "ASC"],
        ["id", "ASC"],
      ],
      raw: true,
    });

    // Group transactions by application_id
    const txByApp = new Map();
    for (const tx of transactions) {
      if (!txByApp.has(tx.application_id)) txByApp.set(tx.application_id, []);
      txByApp.get(tx.application_id).push(tx);
    }

    // Build final list with student name, previousBalance, netBalance
    const results = [];
    for (const lead of leads) {
      for (const app of lead.applications) {
        const appTxs = txByApp.get(app.id) || [];
        if (appTxs.length === 0) continue;

        let runningBalance = 0;
        for (let i = 0; i < appTxs.length; i++) {
          const tx = appTxs[i];
          const debitVal = parseFloat(tx.debit || 0);
          const creditVal = parseFloat(tx.credit || 0);

          // Compute previous balance (balance before this transaction)
          const previousBalance = i === 0 ? 0 : runningBalance;
          // Update running balance
          if (debitVal > 0) runningBalance = debitVal;
          else if (creditVal > 0) runningBalance = previousBalance - creditVal;

          results.push({
            id: tx.id,
            studentName: lead.name,
            invoiceNo: tx.invoice_no,
            debit: debitVal,
            credit: creditVal,
            balance: runningBalance, // balance after this transaction
            previousBalance: previousBalance, // balance before this transaction
            netBalance: runningBalance, // same as balance for frontend
            date: tx.date,
            description: tx.description,
            applicationId: tx.application_id,
          });
        }
      }
    }

    // Sort globally by date (oldest first)
    results.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ success: true, transactions: results });
  } catch (error) {
    console.error("getAllTransactions error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
