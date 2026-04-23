import express          from 'express';
import http             from 'http';
import { Server }       from 'socket.io';
import cors             from 'cors';
import { connectMongo } from './src/config/mongo.js';
import { initSocket }   from './src/sockets/chat.socket.js';
import sequelize        from './src/config/db.js';
import './src/models/mysql/index.js';
import routes           from './src/routes/index.js';

const app    = express();
const server = http.createServer(app); // ✅ wrap express in http server for Socket.IO

// ── Socket.IO setup ────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
    methods:     ['GET', 'POST'],
    credentials: true,
  },
});

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/v1', routes);

// ── Init Socket.IO events ──────────────────────────────────────────────────────
initSocket(io);

// ── Start server ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

async function start() {
  await connectMongo();                    // connect MongoDB
  await sequelize.authenticate();          // connect MySQL
  console.log('✅ MySQL connected');

  server.listen(PORT, () => {             // ✅ use server.listen not app.listen
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

start();