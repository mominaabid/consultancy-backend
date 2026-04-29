// routes/sse.routes.js
import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import sseManager from '../utils/sseManager.js';

const router = express.Router();

// SSE endpoint for real-time notifications
router.get('/events', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  
  console.log(`SSE client connecting: ${userId} (${userRole})`);
  
  // ⭐ Pass req to addClient
  sseManager.addClient(userId, userRole, res, req);
  
  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to notification stream', userId })}\n\n`);
  
  // Keep connection alive with periodic heartbeats (every 30 seconds)
  const heartbeatInterval = setInterval(() => {
    if (res.writableEnded || res.finished) {
      clearInterval(heartbeatInterval);
      return;
    }
    res.write(`: heartbeat\n\n`);
  }, 30000);
  
  // Clean up on close
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    console.log(`SSE client disconnected: ${userId}`);
  });
});

// Helper function to get connected clients count (for debugging)
router.get('/stats', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'counsellor') {
    return res.status(403).json({ message: 'Admin or Counsellor only' });
  }
  res.json({ 
    connectedClients: sseManager.getConnectedCount(),
    connectedUsers: sseManager.getConnectedUsers()
  });
});

export default router;