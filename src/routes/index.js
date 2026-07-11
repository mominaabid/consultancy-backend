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
import studentPaymentRoutes from "./student/payment.routes.js";
import sseRoutes from "./sse.routes.js";
import counsellorProfileRoutes from "./counsellor/counsellorProfile.routes.js";
import studentProfileRoutes from "./student/studentProfile.routes.js";
import adminProfileRoutes from "./admin/adminProfile.routes.js";
import notificationRoutes from "./notification.routes.js";
import accountRoutes from "./admin/account.routes.js";
import configRoutes from "./config.routes.js";
// src/routes/index.js - ADD THESE IMPORTS
import countryRoutes from "./country.routes.js";
import cityRoutes from "./city.routes.js";
import universityRoutes from "./university.routes.js";
import StudentApplicationRoutes from "./student/application.routes.js"; // Ensure this import is correct
// ADD THESE ROUTES

// ❌ REMOVE THIS LINE if it exists
// 

const router = Router();

// --- 1. Public Routes ---
router.use("/countries", countryRoutes);
router.use("/cities", cityRoutes);
router.use("/universities", universityRoutes);
router.use("/config", configRoutes); 
router.use("/auth", authRoutes);
router.use("/chat", chatRoutes);
router.use("/sse", sseRoutes);

// --- 2. Student Routes ---
router.use("/student/documents", studentDocumentRoutes);
router.use("/student/payments", studentPaymentRoutes);
router.use("/student", studentProfileRoutes);
router.use("/student", StudentApplicationRoutes); // Ensure this route is correct
// --- 3. Admin Routes ---
router.use("/admin/leads", adminLeadRoutes);
router.use("/admin/payments", adminPaymentRoutes);
router.use("/admin", counsellorRoutes);
router.use("/admin", adminProfileRoutes);

// --- 4. Counsellor Routes ---
router.use("/counsellor/leads", adminLeadRoutes);
router.use("/counsellor/documents", counsellorDocumentRoutes);
router.use("/counsellor", counsellorApplicationRoutes);
router.use("/counsellor", counsellorProfileRoutes);

// --- 5. Other Routes ---
router.use("/notifications", notificationRoutes);
// router.use("/", studentApplicationRoutes);
router.use("/accounts", accountRoutes);

export default router;