import { Router } from "express";
import auth from "../../middleware/auth.middleware.js";
import {
  getRolePermissions,
  updateRolePermissions,
  getMyModuleAccess,
} from "../../controllers/admin/accessControl.controller.js";

const router = Router();

// Self-check — any authenticated user can read their own module access.
router.get("/my-module-access", auth, getMyModuleAccess);

// Admin-only management endpoints.
router.get(
  "/access-control/:role",
  auth,
  (req, res, next) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }
    next();
  },
  getRolePermissions,
);
router.put(
  "/access-control/:role",
  auth,
  (req, res, next) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Access denied. Admin only." });
    }
    next();
  },
  updateRolePermissions,
);

export default router;
