import express from "express";
import auth from "../../middleware/auth.middleware.js";

import {
  getStudentProfile,
  updateStudentProfile,
} from "../../controllers/student/studentProfile.controller.js";

const router = express.Router();

router.get("/profile", auth, getStudentProfile);
router.put("/updateProfile", auth, updateStudentProfile);

export default router;