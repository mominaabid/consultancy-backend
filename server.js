import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { connectMongo } from "./src/config/mongo.js";
import { initSocket } from "./src/sockets/chat.socket.js";
import sequelize from "./src/config/db.js";
import "./src/models/mysql/index.js";
import routes from "./src/routes/index.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/v1", routes);

initSocket(io);

const PORT = process.env.PORT || 3001;

async function start() {
  await connectMongo(); // connect MongoDB
  await sequelize.authenticate(); // connect MySQL
  console.log("✅ MySQL connected");

  server.listen(PORT, () => {
    // ✅ use server.listen not app.listen
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

start();
