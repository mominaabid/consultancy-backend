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
const router = Router();

// ── Public ──────────────────────────────────────────────────────────────────
router.use('/auth', authRoutes);

// ── Admin ────────────────────────────────────────────────────────────────────
router.use('/admin/leads', adminLeadRoutes);
router.use('/admin', counsellorRoutes);
// ── Add more routes here as you build them ──────────────────────────────────
// router.use('/counsellor/leads', counsellorLeadRoutes);
// router.use('/student/lead',     studentLeadRoutes);

export default router;