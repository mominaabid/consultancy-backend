import express from "express";
import {
  getStudentsWithApplications,
  getStudentApplications,
  updateApplicationStatusAsCounsellor,
  getApplicationStats,
  createApplication,
  updateApplication,
  deleteApplication,
  getAssignedStudents,
  getLeadEducation,
  addApplicationNote,
} from "../../controllers/counsellor/application.controller.js";
import { getApplicationLogs } from "../../controllers/activityLog.controller.js";
import auth from "../../middleware/auth.middleware.js";
import { requireModule } from "../../controllers/admin/accessControl.controller.js";

const router = express.Router();

router.use(auth);

router.use((req, res, next) => {
  if (req.user.role !== "counsellor" && req.user.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Access denied. Counsellor or admin only." });
  }
  next();
});

router.use(requireModule("applications"));

// Existing routes
router.get("/applications/students", getStudentsWithApplications);
router.get("/applications/student/:studentId", getStudentApplications);
router.put(
  "/applications/:applicationId/status",
  updateApplicationStatusAsCounsellor,
);
router.get("/applications/stats", getApplicationStats);
router.get('/leads/:leadId', getLeadEducation);
// New routes
router.get("/assigned-students", getAssignedStudents);
router.post("/applications", createApplication);
router.put("/applications/:id", updateApplication);              // ← For full edit
router.delete("/applications/:id", deleteApplication);
router.get("/applications/:id/logs", getApplicationLogs);
router.post("/applications/:id/notes", addApplicationNote);

export default router;
