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
  updateApplicationStatus,
} from "../../controllers/counsellor/application.controller.js";
import auth from "../../middleware/auth.middleware.js";

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
// routes/counsellor.routes.js
router.put("/applications/:id/status", updateApplicationStatus);  // ← For status only
router.put("/applications/:id", updateApplication);              // ← For full edit
router.delete("/applications/:id", deleteApplication);

export default router;
