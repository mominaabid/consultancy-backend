import { Router } from "express";
import { getReadyLeadsForOfficer, getLeadById } from "../../controllers/lead.controller.js";
import auth from "../../middleware/auth.middleware.js";
import role from "../../middleware/role.middleware.js";
import { requireModule } from "../../controllers/admin/accessControl.controller.js";

const router = Router();
router.use(auth, role("admin", "processing_officer"), requireModule("applications"));

router.get("/ready-leads", getReadyLeadsForOfficer);
// Read-only — officers can view a ready/assigned lead's details to build an
// application, but cannot edit/reassign/delete the lead (that stays with
// admin + counsellor via adminLeadRoutes).
router.get("/leads/:id", getLeadById);

export default router;
