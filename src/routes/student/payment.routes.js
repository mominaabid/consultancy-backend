// src/routes/student/payment.routes.js
import express from 'express';
import multer from 'multer';
import auth from '../../middleware/auth.middleware.js';
import { getMyPayments, makePayment } from '../../controllers/student/payment.controller.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(auth);

router.get('/', getMyPayments);
router.post('/make', upload.single('proof'), makePayment);

export default router;