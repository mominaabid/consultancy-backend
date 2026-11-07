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
import { requireModule } from '../controllers/admin/accessControl.controller.js';
const router = Router();

// requireModule fails open for roles it doesn't gate (student, admin), so
// this only actually restricts counsellors — students/admin are unaffected.
router.use(auth, requireModule('chats'));

router.get('/conversations',              getConversations);
router.get('/messages/:conversationId',   getMessages);
router.post('/conversations/start',       startConversation);
router.put('/messages/read/:conversationId', markAsRead);
router.post('/messages/send',                  sendMessage);     
router.post('/typing',                         sendTyping);       
router.get('/token',                           generateAblyToken);
router.post('/sync', syncConversations); 
router.get('/admin/conversations', role('admin'), getAllConversations);
export default router;