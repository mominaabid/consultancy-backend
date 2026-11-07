
import { Router } from 'express';
import {
  createLead,
  getAllLeads,
  getLeadById,
  assignCounsellor,
  updateStage,
  updateLead,
  deleteLead,
  addStageNote, getStageNotes ,addNoteOnly,
  markLeadReadyForApplication,
  assignProcessingOfficerToLead,
} from '../../controllers/lead.controller.js';
import auth from '../../middleware/auth.middleware.js';
import role from '../../middleware/role.middleware.js';
import { requireModule } from '../../controllers/admin/accessControl.controller.js';
import { getLeadLogs } from '../../controllers/activityLog.controller.js';
const router = Router();
router.use(auth, role('admin', 'counsellor'), requireModule('leads'));

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
  next();
};

router.post('/',             createLead);
router.get('/',              getAllLeads);
router.get('/:id',           getLeadById);
router.put('/:id/assign',    assignCounsellor);
router.put('/:id/stage',     updateStage);
router.put('/:id',           updateLead);
router.delete('/:id',        deleteLead);
router.get('/:id/logs', getLeadLogs);
router.get("/:id/stage-notes", getStageNotes);
router.post("/:id/stage-notes", addStageNote);
router.put("/:id/note", addNoteOnly);
router.put('/:id/ready-for-application', adminOnly, markLeadReadyForApplication);
router.put('/:id/assign-officer', adminOnly, assignProcessingOfficerToLead);
export default router;