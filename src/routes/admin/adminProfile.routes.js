import express from "express";
import auth from "../../middleware/auth.middleware.js";
import {
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
} from "../../controllers/admin/adminProfile.controller.js";

const router = express.Router();

router.get("/profile", auth, getAdminProfile);
router.put("/profile", auth, updateAdminProfile);
router.post("/change-password", auth, changeAdminPassword);

export default router;