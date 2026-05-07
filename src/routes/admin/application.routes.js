import { Router } from "express";
import {
  getAllApplications,
  updateApplicationStatusByAdmin,
  getApplicationById,
  getApplicationsStats,
  getApplicationsByStatus,
  updateDocumentStatus,
  getApplicationDocuments,
  createApplicationByAdmin,
  getAllStudents
} from "../../controllers/admin/application.controller.js";
import auth from "../../middleware/auth.middleware.js";
import role from "../../middleware/role.middleware.js";

const router = Router();

// All admin routes require authentication and admin role
router.use(auth);
router.use(role("admin"));

// Admin application routes
router.get("/applications", getAllApplications);
router.get('/students', getAllStudents);
router.post("/addApplications", createApplicationByAdmin);
router.get("/applications/stats", getApplicationsStats);
router.get("/applications/status/:status", getApplicationsByStatus);
router.get("/applications/:id", getApplicationById);
router.get("/applications/:id/documents", getApplicationDocuments);
router.put("/applications/:id/status", updateApplicationStatusByAdmin);
router.put("/documents/:id/status", updateDocumentStatus);

export default router;
