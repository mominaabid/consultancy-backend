class SSEManager {
  constructor() {
    this.clients = new Map();
  }

  addClient(userId, role, res, req) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": "true",
    });

    res.write(
      `data: ${JSON.stringify({ type: "connected", userId, role })}\n\n`,
    );

    const client = { userId, role, res };
    this.clients.set(userId.toString(), client);

    if (req) {
      req.on("close", () => {
        this.removeClient(userId);
      });
    }

    return client;
  }

  removeClient(userId) {
    this.clients.delete(userId.toString());
  }

  sendToUser(userId, event) {
    const client = this.clients.get(userId.toString());
    if (client && client.res && !client.res.writableEnded) {
      try {
        client.res.write(`data: ${JSON.stringify(event)}\n\n`);
        return true;
      } catch (err) {
        console.error(`Error sending to user ${userId}:`, err);
        this.removeClient(userId);
        return false;
      }
    } else {
      return false;
    }
  }

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
    return sent;
  }

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
    return sent;
  }

  getConnectedCount() {
    return this.clients.size;
  }

  getConnectedUsers() {
    return Array.from(this.clients.keys());
  }
}

const sseManager = new SSEManager();
export default sseManager;
