// src/routes/student/document.routes.js
import express from 'express';
import multer from 'multer';
import auth from '../../middleware/auth.middleware.js';
import {
  getMyDocuments,
  uploadDocument,
  deleteDocument,
} from '../../controllers/student/document.controller.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(auth);

router.get('/', getMyDocuments);
router.post('/upload', upload.single('file'), uploadDocument);
router.delete('/:id', deleteDocument);

export default router;