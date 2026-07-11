import express from "express";
import multer from "multer";
import auth from "../../middleware/auth.middleware.js";
import {
  getMyApplications,
  getMyDocuments,
  uploadDocument,
} from "../../controllers/student/application.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(auth);

router.use((req, res, next) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ message: "Access denied. Student only." });
  }
  next();
});

router.get("/applications", getMyApplications);
router.get("/documents", getMyDocuments);
router.post("/documents/upload", upload.single("file"), uploadDocument);

export default router;