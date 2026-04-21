
import { Router } from 'express';
import {
  createLead,
  getAllLeads,
  getLeadById,
  assignCounsellor,
  updateStage,
  updateLead,
  deleteLead,
} from '../../controllers/lead.controller.js';
import auth from '../../middleware/auth.middleware.js';
import role from '../../middleware/role.middleware.js';

const router = Router();
router.use(auth, role('admin', 'counsellor'));

router.post('/',             createLead);
router.get('/',              getAllLeads);
router.get('/:id',           getLeadById);
router.put('/:id/assign',    assignCounsellor);
router.put('/:id/stage',     updateStage);
router.put('/:id',           updateLead);
router.delete('/:id',        deleteLead);

export default router;