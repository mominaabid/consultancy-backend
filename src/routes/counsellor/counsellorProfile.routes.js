// src/routes/counsellor/counsellorProfile.routes.js
import express from "express";
import auth from "../../middleware/auth.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import {
  getCounsellorProfile,
  updateCounsellorProfile,
  uploadProfileImage,
} from "../../controllers/counsellor/counsellorProfile.controller.js";

const router = express.Router();

// ✅ All routes match frontend expectations
router.get("/profile", auth, getCounsellorProfile);
router.put("/updateProfile", auth, updateCounsellorProfile);  // ✅ Fixed: match frontend
router.post("/upload-profile-image", auth, upload.single("profileImage"), uploadProfileImage);

export default router;