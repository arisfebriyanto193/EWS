const { WebSocketServer, WebSocket } = require('ws');
const TelemetryService = require('./telemetryService');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Set();
    this.subscriptions = {};
  }

  init(server, path = '/ws') {
    this.wss = new WebSocketServer({ server, path });

    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      console.log(`⚡ [Trap WS Gateway] Klien terhubung dari IP: ${clientIp} (Total klien: ${this.wss.clients.size})`);
      this.clients.add(ws);

      // Kirim salam koneksi awal
      this.send(ws, {
        type: 'connected',
        gateway: 'Smart Pest Trap IoT Gateway',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        message: 'Terhubung ke Gateway WebSocket Pengendalian Perangkap Hama',
      });

      ws.on('message', async (message) => {
        try {
          const parsed = JSON.parse(message);
          await this.handleMessage(ws, parsed);
        } catch (err) {
          console.warn('⚠️ [Trap WS] Format pesan tidak valid:', message.toString());
          this.send(ws, { type: 'error', message: 'Format pesan JSON tidak valid' });
        }
      });

      ws.on('close', () => {
        console.log(`🔌 [Trap WS Gateway] Klien terputus (Sisa klien: ${this.wss.clients.size})`);
        this.clients.delete(ws);
        this.cleanupSubscriptions(ws);
      });

      ws.on('error', (err) => {
        console.error('❌ [Trap WS Gateway] Kesalahan WebSocket socket:', err.message);
      });
    });

    console.log(`🚀 [Trap WS Gateway] Berjalan pada path: ${path}`);
  }

  async handleMessage(ws, data) {
    const { action, topic, payload } = data;

    switch (action) {
      case 'subscribe':
        if (!topic) return;
        this.subscribe(topic, ws);
        this.send(ws, { type: 'subscribed', topic });
        break;

      case 'unsubscribe':
        if (!topic) return;
        this.unsubscribe(topic, ws);
        this.send(ws, { type: 'unsubscribed', topic });
        break;

      case 'publish':
        if (!topic) return;
        await this.handleIncomingPublish(topic, payload);
        break;

      case 'ping':
        this.send(ws, { type: 'pong', timestamp: Date.now() });
        break;

      default:
        console.warn('⚠️ [Trap WS] Aksi tidak dikenali:', action);
    }
  }

  async handleIncomingPublish(topic, payload) {
    let processedPayload = payload;

    // A. Deteksi Telemetri Perangkap Hama: traps/{trapId}/telemetry
    const trapMatch = topic.match(/^traps\/([^/]+)\/telemetry$/);
    if (trapMatch) {
      const trapId = trapMatch[1];
      const parsedData = typeof payload === 'string' ? JSON.parse(payload) : payload;
      processedPayload = await TelemetryService.processTrapTelemetry(trapId, parsedData);
    }

    // B. Deteksi Perintah Kontrol Perangkap Hama: traps/{trapId}/command
    const trapCmdMatch = topic.match(/^traps\/([^/]+)\/command$/);
    if (trapCmdMatch) {
      const trapId = trapCmdMatch[1];
      const cmdData = typeof payload === 'string' ? JSON.parse(payload) : payload;
      await TelemetryService.recordCommand(trapId, 'trap', cmdData.command || 'UNKNOWN', cmdData, cmdData.issuedBy);
    }

    // Broadcast ke seluruh klien yang subscribe pada topic ini
    this.broadcastToTopic(topic, processedPayload);

    // Broadcast juga ke topic wildcard jika ada subscriber: traps/+/telemetry
    const parts = topic.split('/');
    if (parts.length === 3) {
      this.broadcastToTopic(`${parts[0]}/+/${parts[2]}`, processedPayload);
    }
  }

  subscribe(topic, ws) {
    if (!this.subscriptions[topic]) {
      this.subscriptions[topic] = new Set();
    }
    this.subscriptions[topic].add(ws);
  }

  unsubscribe(topic, ws) {
    if (this.subscriptions[topic]) {
      this.subscriptions[topic].delete(ws);
      if (this.subscriptions[topic].size === 0) {
        delete this.subscriptions[topic];
      }
    }
  }

  cleanupSubscriptions(ws) {
    for (const topic in this.subscriptions) {
      this.subscriptions[topic].delete(ws);
      if (this.subscriptions[topic].size === 0) {
        delete this.subscriptions[topic];
      }
    }
  }

  publish(topic, payload) {
    this.broadcastToTopic(topic, payload);

    const parts = topic.split('/');
    if (parts.length === 3) {
      this.broadcastToTopic(`${parts[0]}/+/${parts[2]}`, payload);
    }
  }

  broadcastToTopic(topic, payload) {
    const message = JSON.stringify({
      topic,
      payload,
      timestamp: new Date().toISOString(),
    });

    // 1. Direct subscribers
    if (this.subscriptions[topic]) {
      this.subscriptions[topic].forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }

    // 2. Wildcard subscribers (e.g. traps/+/telemetry)
    const topicParts = topic.split('/');
    if (topicParts.length === 3) {
      const wildcardTopic = `${topicParts[0]}/+/${topicParts[2]}`;
      if (this.subscriptions[wildcardTopic]) {
        this.subscriptions[wildcardTopic].forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        });
      }
    }
  }

  broadcastAll(payload) {
    const message = JSON.stringify(payload);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  send(ws, payload) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }
}

module.exports = new WebSocketService();
