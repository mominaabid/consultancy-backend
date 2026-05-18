import express from "express";
import auth from "../../middleware/auth.middleware.js";
import {
  setTotalFees,
  getOfferLetterStudents,
  getPendingVerifications,
  verifyPayment,
  getAllPayments,
  deletePayment,
  getPaymentProof,
  addPayment,
  getStudentPayments,
} from "../../controllers/admin/payment.controller.js";

const router = express.Router();

router.use(auth);

router.post("/set-fees", setTotalFees);
router.post("/", addPayment); 
router.get("/offer-letter-students", getOfferLetterStudents);
router.get("/pending-verifications", getPendingVerifications);
router.put("/verify/:id", verifyPayment);
router.get("/", getAllPayments);
router.delete("/:id", deletePayment);
router.get("/:id/proof", getPaymentProof);
router.get("/student/:studentId/application/:applicationId", getStudentPayments);


export default router;
