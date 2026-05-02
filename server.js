import 'mysql2';
import 'dotenv/config';
console.log("🔥 ENV TEST:", process.env.ABLY_API_KEY);
import express from "express";
import http from "http";

import cors from "cors";
import { connectMongo } from "./src/config/mongo.js";

import sequelize from "./src/config/db.js";
import "./src/models/mysql/index.js";
import routes from "./src/routes/index.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs"; // Add this import

// Define __filename and __dirname first (before using them)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Now you can use __dirname
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("✅ Uploads directory created");
}

const app = express();
const server = http.createServer(app);



app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/v1", routes);



const PORT = process.env.PORT || 3001;

async function start() {
  await connectMongo(); // connect MongoDB
  await sequelize.authenticate(); // connect MySQL
  console.log("✅ MySQL connected");

  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

start();
