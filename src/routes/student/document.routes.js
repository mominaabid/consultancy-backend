// src/routes/student/document.routes.js
import express from "express";
import multer from "multer";
import auth from "../../middleware/auth.middleware.js";
import role from "../../middleware/role.middleware.js";

import {
  getMyDocuments,
  uploadDocument,
  deleteDocument,
  getMobileDocs,
  getDocumentStats,
  getDocumentTypes,
  getStudentsWithApplications,
  verifyDocument,
  rejectDocument,
  toggleReceivedStatus,
} from "../../controllers/student/document.controller.js";

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/documents/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = file.originalname.split(".").pop();
    cb(null, "doc-" + uniqueSuffix + "." + ext);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only PDF, DOC, DOCX, JPG, PNG, WEBP allowed."
        ),
        false
      );
    }
  },
});

// ============================================
// ✅ PUBLIC / CONFIG ROUTES (No auth required)
// ============================================
router.get("/config/document-type", getDocumentTypes);
router.get("/mobile-docs", getMobileDocs);

// ============================================
// ✅ AUTHENTICATED ROUTES
// ============================================
router.use(auth);

// Student routes
router.get("/", getMyDocuments);
router.post("/upload", upload.single("file"), uploadDocument);
router.delete("/:id", deleteDocument);

// ============================================
// ✅ COUNSELLOR ROUTES (For Dynamic Dropdown)
// ============================================
router.get(
  "/counsellor/applications/students",
  role("counsellor", "admin"),
  getStudentsWithApplications
);

router.post(
  "/counsellor/documents/upload-for-student",
  role("counsellor", "admin"),
  upload.single("file"),
  uploadDocument
);

router.put(
  "/counsellor/documents/:id/verify",
  role("counsellor", "admin"),
  verifyDocument
);

router.put(
  "/counsellor/documents/:id/reject",
  role("counsellor", "admin"),
  rejectDocument
);

// ============================================
// ✅ ADMIN ROUTES (For Received Checkbox)
// ============================================
router.put(
  "/admin/documents/:id/toggle-received",
  role("admin"),
  toggleReceivedStatus
);

// ============================================
// ✅ STATS ROUTE
// ============================================
router.get("/stats", getDocumentStats);

export default router;