import express from "express";
import {
  getStudentsWithApplications,
  getStudentApplications,
  updateApplicationStatusAsCounsellor,
  getApplicationStats,
} from "../../controllers/counsellor/application.controller.js";
import auth from "../../middleware/auth.middleware.js";
const router = express.Router();

router.use(auth);

router.get("/applications/students", getStudentsWithApplications);

router.get("/applications/student/:studentId", getStudentApplications);

router.put(
  "/applications/:applicationId/status",
  updateApplicationStatusAsCounsellor,
);

router.get("/applications/stats", getApplicationStats);

export default router;
