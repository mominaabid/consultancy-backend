// src/routes/counsellor/application.routes.js
import { Router } from "express";
import {
  getStudentsWithApplications,
  getAssignedStudents,
  getStudentApplications,
  createApplication,
  updateApplication,
  deleteApplication,
  updateApplicationStatusAsCounsellor,
  getApplicationStats,
} from "../../controllers/counsellor/application.controller.js";

import auth from "../../middleware/auth.middleware.js";
import { createCounsellor,
  getAllCounsellors,
  getCounsellorById,
  updateCounsellor,
  deleteCounsellor,
  getCounsellorStats, } from "../../controllers/counsellor.controller.js";
const router = Router();
router.use(auth);
router.use((req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin only.",
    });
  }
  next();
});

// ── Counsellor Routes ──
router.post("/counsellors", createCounsellor);          
router.get("/counsellors", getAllCounsellors);          
router.get("/counsellors/:id", getCounsellorById);      
router.put("/counsellors/:id", updateCounsellor);       
router.delete("/counsellors/:id", deleteCounsellor);    
router.get("/counsellors/stats", getCounsellorStats);

// ✅ Frontend compatibility routes
router.get("/getCounsellors", getAllCounsellors);
router.delete("/deleteCounsellor/:id", deleteCounsellor);
router.get("/students", auth, getStudentsWithApplications);
router.get("/assigned-students", auth, getAssignedStudents);
router.get("/student/:studentId", auth, getStudentApplications);
router.post("/", auth, createApplication);
router.put("/:id", auth, updateApplication);
router.delete("/:id", auth, deleteApplication);
router.put("/:applicationId/status", auth, updateApplicationStatusAsCounsellor);
router.get("/stats", auth, getApplicationStats);

export default router;