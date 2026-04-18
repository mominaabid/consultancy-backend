import { Router } from 'express';
import { login, getMe } from '../controllers/auth.controller.js';
import auth from '../middleware/auth.middleware.js';

const router = Router();

router.post('/login', login);
router.get('/me', auth, getMe);

export default router;