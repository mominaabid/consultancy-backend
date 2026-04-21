import { Router } from 'express';
import { login, getMe , verifySetupToken, setupPassword} from '../controllers/auth.controller.js';
import auth from '../middleware/auth.middleware.js';

const router = Router();

router.post('/login', login);
router.get('/me', auth, getMe);
router.get('/verify-setup-token', verifySetupToken);
router.post('/setup-password',    setupPassword);
export default router;