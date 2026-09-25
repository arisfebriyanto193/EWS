const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./database/db');
const wsService = require('./services/websocketService');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 5000;
const WS_PORT = parseInt(process.env.WS_PORT, 10) || 3440;

// Middleware CORS
const envOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://server-iot.qbyte.web.id',
  'https://iot-v2.qbyte.web.id',
  'https://testopikmqtt.qbyte.web.id',
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
    system: 'EWS & Pest Trap IoT Gateway',
    databaseConnected: db.getIsConnected(),
    wsPort: WS_PORT,
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
  console.log('⚡ SISTEM EWS DAN PERANGKAP HAMA TERINTEGRASI - BACKEND IOT');
  console.log('================================================================');

  // 1. Inisialisasi Database MySQL
  await db.initDb();

  // 2. Jalankan HTTP REST Server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [REST API] Express server aktif di http://0.0.0.0:${PORT}`);
    console.log(`📡 [Endpoints]`);
    console.log(`   - Auth     : http://localhost:${PORT}/api/auth/login`);
    console.log(`   - EWS      : http://localhost:${PORT}/api/ews`);
    console.log(`   - Traps    : http://localhost:${PORT}/api/traps`);
    console.log(`   - Alarms   : http://localhost:${PORT}/api/alarms`);
    console.log(`   - Logs     : http://localhost:${PORT}/api/logs/sensor`);
  });

  // 3. Jalankan WebSocket Server mandiri pada WS_PORT (3440)
  wsService.init(WS_PORT);

  console.log('----------------------------------------------------------------');
  console.log(`🚀 [WebSocket] Server berjalan di ws://0.0.0.0:${WS_PORT}`);
  console.log(`📋 [Topik WebSocket]:`);
  console.log(`   - Telemetri EWS  : ews/{ewsId}/telemetry (e.g. ews/EWS-01/telemetry)`);
  console.log(`   - Kontrol EWS    : ews/{ewsId}/command   (e.g. ews/EWS-01/command)`);
  console.log(`   - Telemetri Trap : traps/{id}/telemetry  (e.g. traps/TRAP-01/telemetry)`);
  console.log(`   - Kontrol Trap   : traps/{id}/command    (e.g. traps/TRAP-01/command)`);
  console.log(`   - Notif Alarm    : alarms`);
  console.log('================================================================');
}

startServer().catch((err) => {
  console.error('Fatal Server Boot Error:', err);
});
