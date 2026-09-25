// WebSocket Client untuk Frontend Web Monitoring EWS & Perangkap Hama

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';
type MessageCallback = (payload: any) => void;

class FrontendWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval = 3000;
  private shouldReconnect = true;
  private listeners: Map<string, Set<MessageCallback>> = new Map();
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
  public status: ConnectionStatus = 'disconnected';

  constructor() {
    const host = window.location.hostname || 'localhost';
    this.url = `ws://${host}:3440`;
  }

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('⚡ [Frontend WS] Terhubung ke WebSocket Gateway:', this.url);
        this.setStatus('connected');

        // Berlangganan (Subscribe) ke seluruh topik telemetri EWS dan topik sensor per-data
        this.subscribe('ews/+/telemetry');
        this.subscribe('ews/+/status');
        this.subscribe('ews/+/pitch');
        this.subscribe('ews/+/roll');
        this.subscribe('ews/+/soil_moisture');
        this.subscribe('ews/+/soil_temperature');
        this.subscribe('ews/+/rainfall_rate');
        this.subscribe('ews/+/rainfall_cumulative');
        this.subscribe('ews/+/vibration');
        this.subscribe('ews/+/battery');
        this.subscribe('ews/+/battery_voltage');
        this.subscribe('ews/+/solar');
        this.subscribe('ews/+/solar_current');
        this.subscribe('ews/+/gsm');
        this.subscribe('alarms');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const { topic, payload, type } = msg;

          if (topic) {
            // Panggil listener spesifik topik
            this.notifyListeners(topic, payload);

            // Cek pattern wildcard ews/{ewsId}/{actionOrSensor}
            const parts = topic.split('/');
            if (parts.length === 3 && parts[0] === 'ews') {
              const ewsId = parts[1];
              const subTopic = parts[2];

              // Notifikasi ke wildcard e.g. ews/+/pitch atau ews/+/rainfall_rate
              this.notifyListeners(`ews/+/${subTopic}`, { ewsId, subTopic, payload });

              // Notifikasi event generik sensor update
              this.notifyListeners('ews/sensor_update', { ewsId, sensorKey: subTopic, payload });
            }
          } else if (type) {
            // Notifikasi sistem (connected, subscribed, error)
            this.notifyListeners(`system:${type}`, msg);
          }
        } catch (err) {
          console.warn('⚠️ [Frontend WS] Gagal membaca pesan:', event.data);
        }
      };

      this.ws.onclose = () => {
        console.log('❌ [Frontend WS] Terputus dari server');
        this.setStatus('disconnected');
        this.ws = null;
        if (this.shouldReconnect) {
          setTimeout(() => this.connect(), this.reconnectInterval);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('⚠️ [Frontend WS] Kesalahan koneksi:', err);
      };
    } catch (err) {
      console.error('Fatal WebSocket Init Error:', err);
      this.setStatus('disconnected');
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.reconnectInterval);
      }
    }
  }

  public subscribe(topic: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'subscribe', topic }));
    }
  }

  public publish(topic: string, payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'publish', topic, payload }));
    } else {
      console.warn('⚠️ [Frontend WS] Gagal kirim: WebSocket belum terhubung');
    }
  }

  public on(topic: string, callback: MessageCallback) {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, new Set());
    }
    this.listeners.get(topic)!.add(callback);

    // Otomatis kirim subscribe ke server jika sudah connect
    this.subscribe(topic);

    return () => {
      this.off(topic, callback);
    };
  }

  public off(topic: string, callback: MessageCallback) {
    const topicListeners = this.listeners.get(topic);
    if (topicListeners) {
      topicListeners.delete(callback);
      if (topicListeners.size === 0) {
        this.listeners.delete(topic);
      }
    }
  }

  public onStatusChange(callback: (status: ConnectionStatus) => void) {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status));
  }

  private notifyListeners(topic: string, payload: any) {
    const cbs = this.listeners.get(topic);
    if (cbs) {
      cbs.forEach((cb) => cb(payload));
    }
  }

  public disconnect() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const wsClient = new FrontendWebSocket();
