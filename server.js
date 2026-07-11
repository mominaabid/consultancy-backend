import "mysql2";
import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { connectMongo } from "./src/config/mongo.js";
// ✅ Remove Sequelize import
// import sequelize from "./src/config/db.js";
// ✅ Remove Sequelize models import
// import "./src/models/mysql/index.js";

// ✅ Import mysql2/promise connection
import db from "./src/config/db.js";
import routes from "./src/routes/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getUploadsPath = () => {
  if (process.env.NODE_ENV === "production") {
    return "/tmp/uploads";
  }
  return path.join(__dirname, "uploads");
};

const UPLOADS_DIR = getUploadsPath();

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log("✅ Uploads directory created at:", UPLOADS_DIR);
}

const documentsDir = path.join(UPLOADS_DIR, "documents");
const paymentsDir = path.join(UPLOADS_DIR, "payments");

[documentsDir, paymentsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json());

app.use("/uploads", express.static(UPLOADS_DIR));

app.use("/api/v1", routes);

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    // ✅ Connect to MongoDB
    await connectMongo();
    console.log("✅ MongoDB connected");

    // ✅ Test MySQL connection (mysql2/promise)
    await db.query('SELECT 1');
    console.log("✅ MySQL connected (mysql2/promise)");

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📁 Uploads served from: ${UPLOADS_DIR}`);
      console.log(`⏰ Session expires in: 2 hours`);
    });

  } catch (err) {
    console.error("❌ Server startup failed:", err);
    process.exit(1);
  }
}

start();