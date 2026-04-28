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
router.get('/history/:id', async (req, res) => {
  try {
    const document = await Document.findByPk(req.params.id);
    res.json({
      current_status: document.status,
      history_length: document.status_history?.length || 0,
      history: document.status_history || [],
      review_count: document.review_count || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
export default router;