import express from "express";
import auth from "../../middleware/auth.middleware.js";

import {
  getApplicationsForAccounts,
  createTransaction,
  getTransactionsByApplication,
  getApplicationBalance,
  getAllTransactions,
} from "../../controllers/admin/account.controller.js";

const router = express.Router();

router.use(auth);

router.get("/applications", getApplicationsForAccounts);

router.post("/transactions", createTransaction);

router.get(
  "/transactions/application/:applicationId",
  getTransactionsByApplication,
);

router.get("/balance/:applicationId", getApplicationBalance);
router.get("/all-transactions", getAllTransactions);

export default router;
