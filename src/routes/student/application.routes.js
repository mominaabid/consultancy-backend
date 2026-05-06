// src/routes/student/application.routes.js
import { Router } from "express";
import {
  getProfile,
  getApplications,
  getApplication,
} from "../../controllers/student/application.controller.js";
import auth from "../../middleware/auth.middleware.js";

const router = Router();
router.use(auth);

router.get("/user/profile", getProfile);
router.get("/getApplications", getApplications);
router.get("/getApplication/:id", getApplication);

export default router;