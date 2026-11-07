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

router.use(auth);

router.use((req, res, next) => {
  const allowed = ['counsellor', 'admin', 'processing_officer'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied. Counsellor, admin, or processing officer only.' });
  }
  next();
});

router.get('/all', getAllDocuments);
router.post('/upload-for-student', upload.single('file'), uploadForStudent);
router.put('/:id/verify', verifyDocument);
router.put('/:id/reject', rejectDocument);

export default router;