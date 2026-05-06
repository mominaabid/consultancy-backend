// src/routes/counsellor/document.routes.js
import express from 'express';
import multer from 'multer';
import auth from '../../middleware/auth.middleware.js';
import {
  getAllDocuments,
  verifyDocument,
  rejectDocument,
  uploadForStudent,
} from '../../controllers/counsellor/document.controller.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Apply auth to all routes
router.use(auth);

// Only counsellors and admins can access these routes
router.use((req, res, next) => {
  if (req.user.role !== 'counsellor' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Counsellor or admin only.' });
  }
  next();
});

router.get('/all', getAllDocuments);
router.post('/upload-for-student', upload.single('file'), uploadForStudent);
router.put('/:id/verify', verifyDocument);
router.put('/:id/reject', rejectDocument);

export default router;