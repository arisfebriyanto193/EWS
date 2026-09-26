const WebSocket = require('ws');
const url = require('url');
const TelemetryService = require('./telemetryService');
require('dotenv').config();

// Daftar domain yang diizinkan (CORS / WebSocket Origin)
const envOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://server-iot.qbyte.web.id',
  'https://iot-v2.qbyte.web.id',
  'https://testopikmqtt.qbyte.web.id',
];
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

class WebSocketService {
  constructor() {
    this.wss = null;
    this.subscriptions = {}; // Format: { topic: Set<WebSocket> }
    this.clientMeta = new Map(); // Simpan metadata per client (device type, id, etc.)
  }

  init(serverOrPort) {
    const wsOptions = {
      verifyClient: (info, done) => {
        const origin = info.origin;
        const headers = info.req.headers;
        const userAgent = (headers['user-agent'] || '').toLowerCase();
        const isESP32 =
          userAgent.includes('arduino') ||
          userAgent.includes('esp32') ||
          userAgent.includes('simcom') ||
          userAgent.includes('a7670');

        if (origin) {
          // Normalisasi origin (hapus trailing slash)
          const cleanOrigin = origin.replace(/\/$/, '');
          const isAllowed = allowedOrigins.some((allowed) => {
            return cleanOrigin === allowed.replace(/\/$/, '') || allowed === '*';
          });

          if (isAllowed) {
            console.log(`✅ [WS] Browser origin diizinkan: ${origin}`);
            done(true);
          } else if (isESP32) {
            console.log(`✅ [WS] ESP32 diizinkan melalui user-agent: ${userAgent}`);
            done(true);
          } else {
            console.log(`❌ [WS] Origin ditolak: ${origin}`);
            done(false, 403, 'Forbidden: Origin Not Allowed');
          }
        } else {
          // Koneksi tanpa header origin (biasanya langsung dari ESP32 / Arduino / GSM module)
          console.log('✅ [WS] Koneksi tanpa origin (perangkat ESP32 / Mikrokontroler)');
          done(true);
        }
      },
    };

    if (typeof serverOrPort === 'number') {
      wsOptions.port = serverOrPort;
      this.wss = new WebSocket.Server(wsOptions);
      console.log(`🚀 [WS] WebSocket Server berjalan mandiri di port ${serverOrPort}`);
    } else {
      wsOptions.server = serverOrPort;
      this.wss = new WebSocket.Server(wsOptions);
      console.log('🚀 [WS] WebSocket Server terpasang (attached) pada HTTP Server');
    }

    this.setupListeners();
    this.setupHeartbeat();
  }

  setupListeners() {
    this.wss.on('connection', (ws, req) => {
      ws.isAlive = true;
      const clientIp = req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'] || 'ESP32-Client';
      console.log(`🔌 [WS] Klien baru terhubung [${clientIp}] - Agent: ${userAgent}`);

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', async (message) => {
        try {
          const msgStr = message.toString();

          // 1. Format Pesan JSON
          if (msgStr.trim().startsWith('{')) {
            const data = JSON.parse(msgStr);
            await this.handleJsonMessage(ws, data);
          }
          // 2. Format Pesan RAW: topic|payload (seperti contoh sensor/temp|25.4)
          else if (msgStr.includes('|')) {
            const delimiterIndex = msgStr.indexOf('|');
            const topic = msgStr.slice(0, delimiterIndex).trim();
            const rawPayload = msgStr.slice(delimiterIndex + 1).trim();

            let payload = rawPayload;
            try {
              if (rawPayload.startsWith('{') || rawPayload.startsWith('[')) {
                payload = JSON.parse(rawPayload);
              }
            } catch {
              // Tetap raw string/number
            }

            await this.handlePublish(topic, payload, ws);
          }
          // Format tidak dikenal
          else {
            console.warn('⚠️ [WS] Format pesan tidak dikenal:', msgStr);
          }
        } catch (err) {
          console.error('❗ [WS] Error memproses pesan:', err.message);
          this.sendToClient(ws, {
            type: 'error',
            message: 'Format payload tidak valid',
            detail: err.message,
          });
        }
      });

      ws.on('close', () => {
        console.log('❎ [WS] Klien terputus');
        this.unsubscribeAll(ws);
      });

      ws.on('error', (err) => {
        console.error('❌ [WS] Socket error:', err.message);
      });

      // Kirim pesan selamat datang & info koneksi
      this.sendToClient(ws, {
        type: 'connected',
        message: 'Terhubung ke EWS IoT WebSocket Server',
        serverTime: new Date().toISOString(),
      });
    });
  }

  async handleJsonMessage(ws, data) {
    const { action, topic, payload } = data;

    // Jika pesan memiliki format { topic, payload } tanpa action, anggap sebagai publish
    const effectiveAction = action || (topic && payload !== undefined ? 'publish' : undefined);

    if (effectiveAction === 'subscribe') {
      this.subscribe(topic, ws);
      this.sendToClient(ws, {
        type: 'subscribed',
        topic,
        status: 'success',
      });
    } else if (effectiveAction === 'unsubscribe') {
      this.unsubscribe(topic, ws);
      this.sendToClient(ws, {
        type: 'unsubscribed',
        topic,
        status: 'success',
      });
    } else if (effectiveAction === 'publish') {
      await this.handlePublish(topic, payload, ws);
    } else if (effectiveAction === 'ping') {
      this.sendToClient(ws, { type: 'pong', time: Date.now() });
    } else {
      console.warn('⚠️ [WS] Action tidak dikenal:', action);
    }
  }

  async handlePublish(topic, payload, senderWs) {
    // console.log(`📢 [WS Publish] ${topic} =>`, typeof payload === 'object' ? JSON.stringify(payload) : payload);

    let processedPayload = payload;

    // A. Deteksi Topic Telemetri Lengkap EWS: ews/{ewsId}/telemetry
    const ewsMatch = topic.match(/^ews\/([^/]+)\/telemetry$/);
    if (ewsMatch) {
      const ewsId = ewsMatch[1];
      const parsedData = typeof payload === 'string' ? JSON.parse(payload) : payload;
      processedPayload = await TelemetryService.processEwsTelemetry(ewsId, parsedData);

      // Jika memicu bahaya/siaga, broadcast ke channel alarm khusus
      if (processedPayload.status === 'siaga' || processedPayload.status === 'bahaya') {
        this.publish('alarms', {
          event: 'ALARM_ACTIVE',
          ewsId,
          status: processedPayload.status,
          sensorData: processedPayload.sensorData,
          timestamp: processedPayload.timestamp,
        });
      }
    }

    // B. Deteksi Topic Parameter Sensor Individual: ews/{ewsId}/{sensorKey}
    // Contoh topik: ews/EWS-01/pitch, ews/EWS-01/rainfall_rate, ews/EWS-01/soil_moisture, ews/EWS-01/vibration
    const singleSensorMatch = topic.match(
      /^ews\/([^/]+)\/(pitch|pitch_angle|roll|roll_angle|soil_moisture|soil_temp|soil_temperature|rainfall_rate|rain|rain_rate|rainfall_cumulative|vibration|vibration_level|battery|battery_voltage|battery_current|solar|solar_current|gsm|gsm_signal|uptime)$/i
    );
    if (singleSensorMatch) {
      const ewsId = singleSensorMatch[1];
      const sensorKey = singleSensorMatch[2];
      const result = await TelemetryService.processSingleSensor(ewsId, sensorKey, payload);
      if (result) {
        processedPayload = result;

        // Broadcast juga ke agregat telemetri agar dashboard tetap sinkron instan
        this.broadcastToTopic(`ews/${ewsId}/telemetry`, result);
        this.broadcastToTopic('ews/+/telemetry', result);

        if (result.status === 'siaga' || result.status === 'bahaya') {
          this.publish('alarms', {
            event: 'ALARM_ACTIVE',
            ewsId,
            status: result.status,
            sensorData: result.sensorData,
            timestamp: result.timestamp,
          });
        }
      }
    }

    // C. Deteksi Perintah Kontrol dari Web ke ESP32: ews/{ewsId}/command
    const cmdMatch = topic.match(/^ews\/([^/]+)\/command$/);
    if (cmdMatch) {
      const ewsId = cmdMatch[1];
      const cmdData = typeof payload === 'string' ? JSON.parse(payload) : payload;
      await TelemetryService.recordCommand(ewsId, 'ews', cmdData.command || 'UNKNOWN', cmdData, cmdData.issuedBy);
    }

    // Broadcast ke seluruh klien yang subscribe pada topic ini
    this.broadcastToTopic(topic, processedPayload);

    // Broadcast juga ke topic wildcard jika ada subscriber: e.g. ews/+/pitch atau ews/+/telemetry
    const parts = topic.split('/');
    if (parts.length === 3 && parts[0] === 'ews') {
      this.broadcastToTopic(`ews/+/${parts[2]}`, processedPayload);
    }
  }

  subscribe(topic, ws) {
    if (!this.subscriptions[topic]) {
      this.subscriptions[topic] = new Set();
    }
    this.subscriptions[topic].add(ws);
    console.log(`✅ [WS] Klien subscribe ke topik: ${topic} (Total subscriber: ${this.subscriptions[topic].size})`);
  }

  unsubscribe(topic, ws) {
    if (this.subscriptions[topic]) {
      this.subscriptions[topic].delete(ws);
      if (this.subscriptions[topic].size === 0) {
        delete this.subscriptions[topic];
      }
    }
  }

  unsubscribeAll(ws) {
    for (const topic in this.subscriptions) {
      this.subscriptions[topic].delete(ws);
      if (this.subscriptions[topic].size === 0) {
        delete this.subscriptions[topic];
      }
    }
  }

  broadcastToTopic(topic, payload) {
    const clients = this.subscriptions[topic];
    if (!clients || clients.size === 0) return;

    const message = JSON.stringify({
      topic,
      payload,
      timestamp: new Date().toISOString(),
    });

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Helper public untuk broadcast dari Express REST Controllers
   */
  publish(topic, payload) {
    this.broadcastToTopic(topic, payload);
    // Cek jika ada wildcard
    if (topic.startsWith('ews/') && topic.endsWith('/telemetry')) {
      this.broadcastToTopic('ews/+/telemetry', payload);
    }
    if (topic.startsWith('traps/') && topic.endsWith('/telemetry')) {
      this.broadcastToTopic('traps/+/telemetry', payload);
    }
  }

  /**
   * Alias untuk publish
   */
  broadcast(topic, payload) {
    this.publish(topic, payload);
  }

  sendToClient(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  setupHeartbeat() {
    // Ping setiap 30 detik untuk mendeteksi client yang terputus tanpa sinyal close
    setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
          console.log('💀 [WS] Menutup koneksi klien yang tidak merespon (heartbeat timeout)');
          this.unsubscribeAll(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }
}

const wsService = new WebSocketService();
module.exports = wsService;
