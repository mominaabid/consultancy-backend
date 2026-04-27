import { Router } from "express";
import {
  getProfile,
  addApplication,
  getApplications,
  updateApplication,
  updateApplicationStatus,
  deleteApplication,
} from "../../controllers/student/application.controller.js";

import { upload } from "../../middleware/upload.middleware.js";

const router = Router();

router.get("/user/profile", getProfile);
router.get("/getApplications", getApplications);
router.post("/addApplication", upload.single("profile_picture"), addApplication);
router.put(
  "/editApplication/:id",
  upload.single("profile_picture"),
  updateApplication,
);
router.put("/updateApplicationStatus/:id", updateApplicationStatus);
router.delete("/deleteApplication/:id", deleteApplication);

export default router;
