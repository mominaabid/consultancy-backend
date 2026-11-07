// src/routes/index.js
import { Router } from "express";
import authRoutes from "./auth.routes.js";
import adminLeadRoutes from "./admin/lead.routes.js";
import counsellorRoutes from "./admin/counsellor.routes.js";
import processingOfficerAdminRoutes from "./admin/processingOfficer.routes.js";
import accessControlRoutes from "./admin/accessControl.routes.js";
import staffRoutes from "./staff/staff.routes.js";
import chatRoutes from "./chat.routes.js";
import studentDocumentRoutes from "./student/document.routes.js";
import studentApplicationRoutes from "./student/application.routes.js";
import counsellorDocumentRoutes from "./counsellor/document.routes.js";
import counsellorApplicationRoutes from "./counsellor/application.routes.js";
import processingOfficerApplicationRoutes from "./processingOfficer/application.routes.js";
import processingOfficerLeadRoutes from "./processingOfficer/lead.routes.js";
import adminPaymentRoutes from "./admin/payment.routes.js";
import studentPaymentRoutes from "./student/payment.routes.js";
import sseRoutes from "./sse.routes.js";
import publicLeadRoutes from "./public/lead.routes.js";
import publicOnlineQueryRoutes from "./public/onlineQuery.routes.js";
import adminOnlineQueryRoutes from "./admin/onlineQuery.routes.js";
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
import { getCounsellorProfile } from "../controllers/counsellor/counsellorProfile.controller.js";
import StudentApplicationRoutes from "./student/application.routes.js"; // Ensure this import is correct
// ADD THESE ROUTES

// ❌ REMOVE THIS LINE if it exists
// 

const router = Router();

// --- 1. Public Routes ---
router.use("/public/queries", publicOnlineQueryRoutes); // ✅ Website Apply Now form (no auth)
router.use("/public/leads", publicLeadRoutes); // ✅ Website lead form (no auth)  — DEPRECATED alias, ab online query banata hai
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
router.use("/admin", adminProfileRoutes);
// accessControlRoutes must be mounted before counsellorRoutes/processingOfficerAdminRoutes:
// those apply a blanket "admin only" guard to every path under them with no path
// restriction, which would otherwise intercept and 403 the self-check endpoint
// (/admin/my-module-access) that non-admin roles are meant to call.
router.use("/admin", accessControlRoutes);
router.use("/admin/leads", adminLeadRoutes);
router.use("/admin/online-queries", adminOnlineQueryRoutes); // admin-only
router.use("/admin/payments", adminPaymentRoutes);
router.use("/admin", counsellorRoutes);
router.use("/admin", processingOfficerAdminRoutes);
router.use("/staff", staffRoutes);
router.use("/admin", adminProfileRoutes);

// --- 4. Counsellor Routes ---

router.use("/counsellor/leads", adminLeadRoutes);
router.use("/counsellor/documents", counsellorDocumentRoutes);
router.use("/counsellor", counsellorApplicationRoutes);
router.use("/counsellor", counsellorProfileRoutes);

// --- 4b. Processing Officer Routes ---
router.use("/processingOfficer", processingOfficerApplicationRoutes);
router.use("/processingOfficer", processingOfficerLeadRoutes);
router.use("/processingOfficer/documents", counsellorDocumentRoutes);


// --- 5. Other Routes ---
router.use("/notifications", notificationRoutes);
// router.use("/", studentApplicationRoutes);
router.use("/accounts", accountRoutes);

export default router;