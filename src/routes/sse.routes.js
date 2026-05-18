import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import sseManager from "../utils/sseManager.js";

const router = express.Router();

router.get("/events", authMiddleware, (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  console.log(`SSE client connecting: ${userId} (${userRole})`);

  sseManager.addClient(userId, userRole, res, req);

  res.write(
    `data: ${JSON.stringify({ type: "connected", message: "Connected to notification stream", userId })}\n\n`,
  );

  const heartbeatInterval = setInterval(() => {
    if (res.writableEnded || res.finished) {
      clearInterval(heartbeatInterval);
      return;
    }
    res.write(`: heartbeat\n\n`);
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeatInterval);
    console.log(`SSE client disconnected: ${userId}`);
  });
});

router.get("/stats", authMiddleware, (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "counsellor") {
    return res.status(403).json({ message: "Admin or Counsellor only" });
  }
  res.json({
    connectedClients: sseManager.getConnectedCount(),
    connectedUsers: sseManager.getConnectedUsers(),
  });
});

export default router;
