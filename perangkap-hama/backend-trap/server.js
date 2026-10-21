const dns = require('dns');
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./database/db');
const wsService = require('./services/websocketService');
const deviceWatchdog = require('./services/deviceWatchdogService');
const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);
const PORT = parseInt(process.env.PORT, 10) || 5001;
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT, 10) : null;
const WS_PATH = process.env.WS_PATH || '/ws';

// Middleware CORS
const envOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
];
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

app.use(
  cors({
    origin: (origin, callback) => {
      // Izinkan request tanpa origin (seperti curl, mobile apps, atau mikrokontroler)
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/$/, '');
      if (allowedOrigins.some((allowed) => cleanOrigin === allowed.replace(/\/$/, '') || allowed === '*')) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'Smart Pest Trap IoT Gateway',
    databaseConnected: db.getIsConnected(),
    wsPort: WS_PORT || PORT,
    wsPath: WS_PATH,
    apiPort: PORT,
    timestamp: new Date().toISOString(),
  });
});

// Mount API Routes
app.use('/api', apiRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.message);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: err.message,
  });
});

// Start Server
async function startServer() {
  console.log('================================================================');
  console.log('🦗 SISTEM PERANGKAP HAMA PINTAR (SMART PEST TRAP) - BACKEND IOT');
  console.log('================================================================');

  // 1. Inisialisasi Database MySQL
  await db.initDb();

  // 2. Mulai Watchdog Pemantau Koneksi & Offline Detector
  deviceWatchdog.start();

  // 3. Inisialisasi WebSocket Server
  if (WS_PORT && WS_PORT !== PORT) {
    wsService.init(WS_PORT, WS_PATH);
    console.log(`🚀 [WebSocket] Server mandiri aktif di ws://0.0.0.0:${WS_PORT}${WS_PATH}`);
  } else {
    wsService.init(server, WS_PATH);
    console.log(`🚀 [WebSocket] Server terpasang bersama HTTP Server di ws://0.0.0.0:${PORT}${WS_PATH}`);
  }

  // 4. Jalankan HTTP REST & WebSocket Server bersamaan
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [REST API] Express server aktif di http://0.0.0.0:${PORT}`);
    console.log(`📡 [Endpoints]`);
    console.log(`   - Auth     : http://localhost:${PORT}/api/auth/login`);
    console.log(`   - Traps    : http://localhost:${PORT}/api/traps`);
    console.log(`   - Logs     : http://localhost:${PORT}/api/logs/traps`);
    console.log(`   - WS Stream: ws://localhost:${PORT}${WS_PATH}`);
  });

  console.log('----------------------------------------------------------------');
  console.log(`📋 [Topik WebSocket]:`);
  console.log(`   - Telemetri Trap : traps/{id}/telemetry  (e.g. traps/TRAP-01/telemetry)`);
  console.log(`   - Kontrol Trap   : traps/{id}/command    (e.g. traps/TRAP-01/command)`);
  console.log(`   - Status Trap    : traps/{id}/status     (e.g. traps/TRAP-01/status)`);
  console.log('================================================================');
}

startServer().catch((err) => {
  console.error('Fatal Server Boot Error:', err);
});
