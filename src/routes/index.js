// import express from "express";
// import leadRoutes from "./admin/lead.routes.js";
// import userRoutes from "./admin/user.routes.js";

// const router = express.Router();

// router.use("/admin/leads", leadRoutes);
// router.use("/admin/users", userRoutes);
// router.use('/auth', require('./auth.routes').default);
// export default router;
import { Router } from 'express';
import authRoutes from './auth.routes.js';
import adminLeadRoutes from './admin/lead.routes.js';
import counsellorRoutes from './admin/counsellor.routes.js';
import testRoutes from './test.routes.js';
import chatRoutes from './chat.routes.js';

const router = Router();

// ── Public ──────────────────────────────────────────────────────────────────
router.use('/auth', authRoutes);
router.use('/chat', chatRoutes);
// ── Admin ────────────────────────────────────────────────────────────────────
router.use('/admin/leads', adminLeadRoutes);
router.use('/admin', counsellorRoutes);
router.use('/counsellor/leads', adminLeadRoutes); // ← same routes file, role check inside controller
// ── Add more routes here as you build them ──────────────────────────────────
// router.use('/counsellor/leads', counsellorLeadRoutes);
// router.use('/student/lead',     studentLeadRoutes);
router.use('/test', testRoutes);
export default router;