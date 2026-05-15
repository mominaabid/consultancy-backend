import express from "express";
import auth from "../../middleware/auth.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import {
  getCounsellorProfile,
  updateCounsellorProfile,
  uploadProfileImage,          
} from "../../controllers/counsellor/counsellorProfile.controller.js";

const router = express.Router();

router.get("/profile", auth, getCounsellorProfile);
router.post("/upload-profile-image", auth, upload.single("profileImage"), uploadProfileImage); 
router.put("/updateProfile", auth, updateCounsellorProfile);

export default router;