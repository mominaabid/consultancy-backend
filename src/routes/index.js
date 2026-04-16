import express from 'express';
import adminLeadRoutes from './admin/lead.routes.js';

const router = express.Router();

router.use('/admin/leads', adminLeadRoutes);

export default router;