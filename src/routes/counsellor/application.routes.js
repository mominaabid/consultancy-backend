// src/routes/counsellor/application.routes.js
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
} from "../../controllers/counsellor/application.controller.js";
import auth from "../../middleware/auth.middleware.js";

const router = express.Router();

router.use(auth);

// Only counsellors and admins can access
router.use((req, res, next) => {
  if (req.user.role !== 'counsellor' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Counsellor or admin only.' });
  }
  next();
});

// Existing routes
router.get("/applications/students", getStudentsWithApplications);
router.get("/applications/student/:studentId", getStudentApplications);
router.put("/applications/:applicationId/status", updateApplicationStatusAsCounsellor);
router.get("/applications/stats", getApplicationStats);

// New routes
router.get("/assigned-students", getAssignedStudents);
router.post("/applications", createApplication);
router.put("/applications/:id", updateApplication);
router.delete("/applications/:id", deleteApplication);

export default router;