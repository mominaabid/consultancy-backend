import express from "express";
import auth from "../../middleware/auth.middleware.js";

import {
  getCounsellorProfile,
  updateCounsellorProfile,
} from "../../controllers/counsellor/counsellorProfile.controller.js";

const router = express.Router();

router.get("/profile", auth, getCounsellorProfile);
router.put("/updateProfile", auth, updateCounsellorProfile);

export default router;
