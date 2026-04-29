// utils/sseManager.js
class SSEManager {
  constructor() {
    this.clients = new Map(); // userId -> { response, userId, role }
  }

  // Add client connection - ⭐ FIX: Add req parameter
  addClient(userId, role, res, req) {  // Added req parameter
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', userId, role })}\n\n`);

    const client = { userId, role, res };
    this.clients.set(userId.toString(), client); // Ensure userId is string

    // Handle client disconnect
    if (req) {
      req.on('close', () => {
        console.log(`Client disconnected: ${userId}`);
        this.removeClient(userId);
      });
    }

    console.log(`SSE client added: ${userId} (${role}), Total clients: ${this.clients.size}`);
    return client;
  }

  // Remove client
  removeClient(userId) {
    const deleted = this.clients.delete(userId.toString());
    if (deleted) {
      console.log(`SSE client removed: ${userId}, Remaining: ${this.clients.size}`);
    }
  }

  // Send event to specific user
  sendToUser(userId, event) {
    const client = this.clients.get(userId.toString());
    if (client && client.res && !client.res.writableEnded) {
      try {
        client.res.write(`data: ${JSON.stringify(event)}\n\n`);
        console.log(`SSE event sent to user ${userId}:`, event.type);
        return true;
      } catch (err) {
        console.error(`Error sending to user ${userId}:`, err);
        this.removeClient(userId);
        return false;
      }
    } else {
      console.log(`User ${userId} not connected via SSE`);
      return false;
    }
  }

  // Send event to all users with specific role
  sendToRole(role, event) {
    let sent = 0;
    for (const [userId, client] of this.clients) {
      if (client.role === role) {
        try {
          client.res.write(`data: ${JSON.stringify(event)}\n\n`);
          sent++;
        } catch (err) {
          console.error(`Error sending to user ${userId}:`, err);
          this.removeClient(userId);
        }
      }
    }
    console.log(`SSE event sent to ${sent} ${role} users`);
    return sent;
  }

  // Send event to all connected clients
  sendToAll(event) {
    let sent = 0;
    for (const [userId, client] of this.clients) {
      try {
        client.res.write(`data: ${JSON.stringify(event)}\n\n`);
        sent++;
      } catch (err) {
        console.error(`Error sending to user ${userId}:`, err);
        this.removeClient(userId);
      }
    }
    console.log(`SSE event sent to ${sent} clients`);
    return sent;
  }

  // Get connected clients count
  getConnectedCount() {
    return this.clients.size;
  }

  // Get all connected user IDs (for debugging)
  getConnectedUsers() {
    return Array.from(this.clients.keys());
  }
}

// Singleton instance
const sseManager = new SSEManager();
export default sseManager;