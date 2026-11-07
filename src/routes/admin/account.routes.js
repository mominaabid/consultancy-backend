import express from "express";
import auth from "../../middleware/auth.middleware.js";
import { requireModule } from "../../controllers/admin/accessControl.controller.js";

import {
  getApplicationsForAccounts,
  createTransaction,
  getTransactionsByApplication,
  getApplicationBalance,
  getAllTransactions,
  createDebitTransaction,
  getLeadsForAccounts,
  createLeadTransaction,
  createLeadDebitTransaction,
  getTransactionsByLead,
} from "../../controllers/admin/account.controller.js";

const router = express.Router();

router.use(auth, requireModule("accounts"));

// Payments are admin-managed only — counsellors can view accounts (per the
// module-visibility gate above) but may not record/charge a transaction.
const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied. Admin only." });
  }
  next();
};

router.get("/applications", getApplicationsForAccounts);

router.post("/transactions", adminOnly, createTransaction);

router.post("/debit", adminOnly, createDebitTransaction);

router.get(
  "/transactions/application/:applicationId",
  getTransactionsByApplication,
);

router.get("/balance/:applicationId", getApplicationBalance);
router.get("/all-transactions", getAllTransactions);

// Lead-based payments (before an Application exists — Counseling phase onward)
router.get("/leads", getLeadsForAccounts);
router.post("/lead-transactions", adminOnly, createLeadTransaction);
router.post("/lead-debit", adminOnly, createLeadDebitTransaction);
router.get("/transactions/lead/:leadId", getTransactionsByLead);

export default router;
