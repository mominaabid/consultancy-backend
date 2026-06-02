import express from "express";
import auth from "../../middleware/auth.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";

import {
  getAdminProfile,
  updateAdminProfile,
  uploadAdminProfileImage
} from "../../controllers/admin/adminProfile.controller.js";

const router = express.Router();

router.get("/profile", auth, getAdminProfile);
router.post("/upload-admin-profile-image", auth, upload.single("profileImage"), uploadAdminProfileImage); 
router.put("/profile", auth, updateAdminProfile);



export default router;
