// src/routes/index.js
import { Router } from 'express';
import authRoutes from './auth.routes.js';
import adminLeadRoutes from './admin/lead.routes.js';
import counsellorRoutes from './admin/counsellor.routes.js';
import chatRoutes from './chat.routes.js';
import studentDocumentRoutes from './student/document.routes.js';
import studentApplicationRoutes from "./student/application.routes.js";
import counsellorDocumentRoutes from './counsellor/document.routes.js';
import counsellorApplicationRoutes from './counsellor/application.routes.js';



const router = Router();

// Public
router.use('/auth', authRoutes);
router.use('/chat', chatRoutes);

// Student routes
router.use('/student/documents', studentDocumentRoutes);
router.use("/", studentApplicationRoutes);
router.use('/counsellor', counsellorApplicationRoutes);


// Admin & Counsellor routes
router.use('/admin/leads', adminLeadRoutes);
router.use('/admin', counsellorRoutes);
router.use('/counsellor/leads', adminLeadRoutes);
router.use('/counsellor/documents', counsellorDocumentRoutes);

export default router;