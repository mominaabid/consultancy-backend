import express from "express";
import multer from "multer";
import auth from "../../middleware/auth.middleware.js";

import {
  getMyDocuments,
  uploadDocument,
  deleteDocument,
  getMobileDocs,
  getDocumentStats,
} from "../../controllers/student/document.controller.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

router.use(auth);

router.get("/mobile-docs", auth, getMobileDocs);
router.get("/stats", getDocumentStats);
router.get("/", getMyDocuments);
router.post("/upload", upload.single("file"), uploadDocument);
router.delete("/:id", deleteDocument);

export default router;
