import { Router } from 'express';
import {
  getConversations,
  getMessages,
  startConversation,
  markAsRead,
  syncConversations,
  getAllConversations,
  sendMessage,
  sendTyping,
} from '../controllers/chat.controller.js';
import auth from '../middleware/auth.middleware.js';
import role from '../middleware/role.middleware.js';
import { generateAblyToken } from '../services/ably.service.js';
const router = Router();

// All chat routes require authentication
router.use(auth);

// Both student and counsellor can access
router.get('/conversations',              getConversations);
router.get('/messages/:conversationId',   getMessages);
router.post('/conversations/start',       startConversation);
router.put('/messages/read/:conversationId', markAsRead);
router.post('/messages/send',                  sendMessage);      // ← NEW
router.post('/typing',                         sendTyping);       // ← NEW
router.get('/token',                           generateAblyToken);// ← NEW (frontend auth)
router.post('/sync', syncConversations); // admin only - run once
router.get('/admin/conversations', role('admin'), getAllConversations);
export default router;