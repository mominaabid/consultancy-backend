// src/routes/admin/payment.routes.js
import express from 'express';
import auth from '../../middleware/auth.middleware.js';
import {
  setTotalFees,
  getOfferLetterStudents,
  getPendingVerifications,
  verifyPayment,
  getAllPayments,
  deletePayment,
  getPaymentProof,
} from '../../controllers/admin/payment.controller.js';

const router = express.Router();

router.use(auth);

router.post('/set-fees', setTotalFees);
router.get('/offer-letter-students', getOfferLetterStudents);
router.get('/pending-verifications', getPendingVerifications);
router.put('/verify/:id', verifyPayment);
router.get('/', getAllPayments);
router.delete('/:id', deletePayment);
// src/routes/admin/payment.routes.js - Add this route
router.get('/:id/proof', getPaymentProof);
export default router;