// src/services/socket.service.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import db from "../models/mysql/index.js";

// Staff roles that can use the staff todo/chat module.
const STAFF_ROLES = ["admin", "counsellor", "processing_officer"];

class StaffSocketManager {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // userId -> Set<socket>
  }

  init(httpServer) {
    this.io = new Server(httpServer, {
      path: "/staff-socket",
      cors: { origin: "*", credentials: true },
    });

    const staffNamespace = this.io.of("/staff");

    staffNamespace.use(async (socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.split(" ")[1];
        if (!token) return next(new Error("No token provided"));

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await db.User.findByPk(decoded.id);
        if (!user) return next(new Error("User not found"));
        if (!STAFF_ROLES.includes(user.role)) {
          return next(new Error("Only staff roles can use this channel"));
        }

        socket.user = { id: user.id, name: user.name, role: user.role };
        next();
      } catch (err) {
        next(new Error("Invalid token"));
      }
    });

    staffNamespace.on("connection", (socket) => {
      const userId = socket.user.id.toString();
      if (!this.userSockets.has(userId)) this.userSockets.set(userId, new Set());
      this.userSockets.get(userId).add(socket);

      socket.join("general");
      // A personal room lets us target this exact user (across every tab/
      // device they have open) for DMs, without broadcasting to everyone.
      socket.join(`user:${userId}`);

      socket.on("disconnect", () => {
        this.userSockets.get(userId)?.delete(socket);
        if (this.userSockets.get(userId)?.size === 0) {
          this.userSockets.delete(userId);
        }
      });
    });

    this.staffNamespace = staffNamespace;
  }

  // Broadcast a new chat message to everyone in the channel (except sender's
  // own extra tabs get it too — client should de-dupe by message id if needed).
  broadcastMessage(channel, message) {
    if (!this.staffNamespace) return;
    this.staffNamespace.to(channel || "general").emit("new_message", message);
  }

  // Deliver a DM directly to both participants' personal rooms — never
  // broadcast to "general", a DM is only ever seen by the two people in it.
  sendDirectMessage(senderId, recipientId, message) {
    if (!this.staffNamespace) return;
    this.staffNamespace.to(`user:${senderId}`).to(`user:${recipientId}`).emit("new_message", message);
  }

  // Push a todo create/update/delete event to everyone (simplest correct
  // behavior for a small staff list — no per-user filtering needed).
  broadcastTodoEvent(event, todo) {
    if (!this.staffNamespace) return;
    this.staffNamespace.to("general").emit("todo_event", { event, todo });
  }
}

const staffSocketManager = new StaffSocketManager();
export default staffSocketManager;
