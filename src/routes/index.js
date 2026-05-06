// src/routes/index.js
import { Router } from "express";
import authRoutes from "./auth.routes.js";
import adminLeadRoutes from "./admin/lead.routes.js";
import counsellorRoutes from "./admin/counsellor.routes.js";
import chatRoutes from "./chat.routes.js";
import studentDocumentRoutes from "./student/document.routes.js";
import studentApplicationRoutes from "./student/application.routes.js";
import counsellorDocumentRoutes from "./counsellor/document.routes.js";
import counsellorApplicationRoutes from "./counsellor/application.routes.js";
import adminPaymentRoutes from "./admin/payment.routes.js";
import adminApplicationRoutes from "./admin/application.routes.js";
import studentPaymentRoutes from "./student/payment.routes.js";
import sseRoutes from "./sse.routes.js";
import counsellorProfileRoutes from "./counsellor/counsellorProfile.routes.js";
import studentProfileRoutes from "./student/studentProfile.routes.js";
import adminProfileRoutes from "./admin/adminProfile.routes.js";

const router = Router();

// --- 1. Public Routes ---
router.use("/auth", authRoutes);
router.use("/chat", chatRoutes);
router.use("/sse", sseRoutes);

// --- 2. Specific Student Routes (Most specific paths first) ---
router.use("/student/documents", studentDocumentRoutes);
router.use("/student/payments", studentPaymentRoutes);
// Move profile here - under /student, but before the root "/" catch-all
router.use("/student", studentProfileRoutes);

// --- 3. General Application Routes ---
// This was likely shadowing your profile routes because it's mounted at "/"

// --- 4. Admin & Counsellor routes ---
router.use("/admin/leads", adminLeadRoutes);
router.use("/admin/payments", adminPaymentRoutes);
router.use("/admin", counsellorRoutes);
router.use("/admin", adminApplicationRoutes);
router.use("/admin", adminProfileRoutes);

router.use("/counsellor/leads", adminLeadRoutes);
router.use("/counsellor/documents", counsellorDocumentRoutes);
router.use("/counsellor", counsellorApplicationRoutes);
router.use("/counsellor", counsellorProfileRoutes);

router.use("/", studentApplicationRoutes);

export default router;
