// src/routes/student/studentProfile.routes.js
import express from "express";
import auth from "../../middleware/auth.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import {
  getStudentProfile,
  updateStudentProfile,
  uploadProfilePicture,
} from "../../controllers/student/studentProfile.controller.js";

const router = express.Router();

router.get("/profile", auth, getStudentProfile);
router.put("/updateProfile", auth, updateStudentProfile);
router.post("/upload-profile-picture", auth, upload.single("profileImage"), uploadProfilePicture);

export default router;