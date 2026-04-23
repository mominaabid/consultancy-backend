import { Router } from 'express';
import {
  getConversations,
  getMessages,
  startConversation,
  markAsRead,
} from '../controllers/chat.controller.js';
import auth from '../middleware/auth.middleware.js';
import role from '../middleware/role.middleware.js';

const router = Router();

// All chat routes require authentication
router.use(auth);

// Both student and counsellor can access
router.get('/conversations',              getConversations);
router.get('/messages/:conversationId',   getMessages);
router.post('/conversations/start',       startConversation);
router.put('/messages/read/:conversationId', markAsRead);

export default router;