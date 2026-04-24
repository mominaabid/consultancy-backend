// src/routes/counsellor/document.routes.js
import express from 'express';
import auth from '../../middleware/auth.middleware.js';  // ← change this line
import {
  getAllDocuments,
  verifyDocument,
  rejectDocument,
} from '../../controllers/counsellor/document.controller.js';

const router = express.Router();

router.use(auth);  // ← use auth directly

router.get('/all', getAllDocuments);
router.put('/:id/verify', verifyDocument);
router.put('/:id/reject', rejectDocument);

export default router;