import { Router } from "express";
import {
  getOfficerApplications,
  getStudentApplications,
  updateApplicationStatusAsCounsellor,
  getApplicationStats,
  createApplication,
  updateApplication,
  deleteApplication,
  getLeadEducation,
  addApplicationNote,
} from "../../controllers/counsellor/application.controller.js";
import { getApplicationLogs } from "../../controllers/activityLog.controller.js";
import auth from "../../middleware/auth.middleware.js";
import role from "../../middleware/role.middleware.js";
import { requireModule } from "../../controllers/admin/accessControl.controller.js";

const router = Router();

router.use(auth, role("admin", "processing_officer"), requireModule("applications"));

router.get("/applications", getOfficerApplications);
router.get("/applications/student/:studentId", getStudentApplications);
router.put("/applications/:applicationId/status", updateApplicationStatusAsCounsellor);
router.get("/applications/stats", getApplicationStats);
router.get("/leads/:leadId", getLeadEducation);
router.post("/applications", createApplication);
router.put("/applications/:id", updateApplication);
router.delete("/applications/:id", deleteApplication);
router.get("/applications/:id/logs", getApplicationLogs);
router.post("/applications/:id/notes", addApplicationNote);

export default router;
