import { Router } from "express";
import {
  login,
  getMe,
  verifySetupToken,
  setupPassword,
  verifyCounsellorSetupToken,
  setupCounsellorPassword,
  counsellorLogin,
} from "../controllers/auth.controller.js";

import auth from "../middleware/auth.middleware.js";

const router = Router();

/* ================= STUDENT ================= */
router.post("/login", login);
router.get("/me", auth, getMe);
router.get("/verify-setup-token", verifySetupToken);
router.post("/setup-password", setupPassword);

/* ================= COUNSELLOR ================= */
router.post("/counsellor/login", counsellorLogin);
router.get(
  "/counsellor/verify-setup-token",
  verifyCounsellorSetupToken
);
router.post(
  "/counsellor/setup-password",
  setupCounsellorPassword
);

export default router;