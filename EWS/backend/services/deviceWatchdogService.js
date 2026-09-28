const db = require('../database/db');
const wsService = require('./websocketService');
const TelegramService = require('./telegramService');

/**
 * Service Watchdog untuk memantau konektivitas perangkat EWS dan Pest Trap.
 * Jika perangkat tidak mengirimkan telemetri melewati ambang batas waktu (30 detik),
 * status otomatis dialihkan menjadi 'offline', log alarm dicatat, event disiarkan via WebSocket,
 * dan notifikasi darurat dikirim ke bot Telegram (jika dikonfigurasi).
 */
class DeviceWatchdogService {
  constructor() {
    this.intervalHandle = null;
    this.checkIntervalMs = 10000; // Jalankan pengecekan setiap 10 detik
    this.ewsOfflineTimeoutSec = 30; // 30 detik tanpa data = OFFLINE
    this.trapOfflineTimeoutSec = 60; // 60 detik untuk perangkat perangkap hama
    this.isRunning = false;
  }

  /**
   * Mulai watchdog monitor
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(
      `🛡️ [Watchdog] Layanan pemantau koneksi perangkat aktif (Interval: ${this.checkIntervalMs / 1000}s, EWS Timeout: ${this.ewsOfflineTimeoutSec}s)`
    );

    // Jalankan pengecekan perdana setelah 5 detik
    setTimeout(() => {
      this.checkAllDevices().catch((err) =>
        console.error('❌ [Watchdog Error] Pengecekan perdana gagal:', err.message)
      );
    }, 5000);

    this.intervalHandle = setInterval(() => {
      this.checkAllDevices().catch((err) =>
        console.error('❌ [Watchdog Error] Interval check error:', err.message)
      );
    }, this.checkIntervalMs);
  }

  /**
   * Hentikan watchdog monitor
   */
  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    console.log('🛑 [Watchdog] Layanan pemantau koneksi perangkat dihentikan');
  }

  /**
   * Periksa seluruh titik pantau EWS dan perangkap hama
   */
  async checkAllDevices() {
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();
    if (!pool || !isDbConnected) {
      return;
    }

    await this.checkEwsNodes(pool);
    await this.checkPestTraps(pool);
  }

  /**
   * Pengecekan node stasiun EWS
   */
  async checkEwsNodes(pool) {
    try {
      const [nodes] = await pool.query(`
        SELECT 
          e.id, e.name, e.location, e.status, e.last_seen_at, e.last_gsm_status,
          t.bot_token, t.chat_id, t.enabled AS tele_enabled, 
          t.notify_offline, t.notify_normal_kembali
        FROM ews_nodes e
        LEFT JOIN telegram_configs t ON e.id = t.ews_id
      `);

      const now = Date.now();

      for (const node of nodes) {
        if (!node.last_seen_at) {
          // Jika belum pernah kirim data sama sekali dan status belum offline
          continue;
        }

        const lastSeenTime = new Date(node.last_seen_at).getTime();
        const elapsedSec = (now - lastSeenTime) / 1000;

        // Jika data terakhir melebihi ambang batas timeout
        if (elapsedSec > this.ewsOfflineTimeoutSec) {
          if (node.status !== 'offline') {
            console.log(
              `⚠️ [Watchdog] Node ${node.id} (${node.name}) tidak mengirim data selama ${Math.round(
                elapsedSec
              )}s. Mengubah status ke OFFLINE...`
            );

            // 1. Update status node di database
            await pool.query(
              `UPDATE ews_nodes SET 
                status = 'offline', 
                last_gsm_status = 'offline',
                siren_active = 0,
                strobo_active = 0
               WHERE id = ?`,
              [node.id]
            );

            // 2. Catat alarm log offline (cegah duplikasi jika sudah ada dalam 15 menit)
            const [recentAlarm] = await pool.query(
              `SELECT id FROM alarm_logs 
               WHERE ews_id = ? AND alarm_type = 'offline' AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
               LIMIT 1`,
              [node.id]
            );

            if (recentAlarm.length === 0) {
              const alarmId = `ALM-${Date.now().toString().slice(-6)}`;
              await pool.query(
                `INSERT INTO alarm_logs (
                  id, ews_id, alarm_type, trigger_cause, trigger_value, duration_minutes, acknowledged
                ) VALUES (?, ?, 'offline', 'Koneksi Telemetri Terputus', ?, 0, 0)`,
                [
                  alarmId,
                  node.id,
                  `Tidak ada transmisi data selama ${Math.round(elapsedSec)} detik`,
                ]
              );
            }

            // 3. Broadcast status OFFLINE ke seluruh klien WebSocket
            const statusPayload = {
              ewsId: node.id,
              status: 'offline',
              gsmStatus: 'offline',
              sirenActive: false,
              stroboActive: false,
              lastSeenAt: node.last_seen_at,
              message: `Perangkat ${node.name} (${node.id}) terputus dari jaringan (tidak ada data > ${this.ewsOfflineTimeoutSec}s)`,
              timestamp: new Date().toISOString(),
            };

            wsService.publish(`ews/${node.id}/status`, statusPayload);
            wsService.publish('ews/+/status', statusPayload);
            wsService.publish('alarms', {
              event: 'DEVICE_OFFLINE',
              ewsId: node.id,
              name: node.name,
              status: 'offline',
              elapsedSeconds: Math.round(elapsedSec),
              timestamp: new Date().toISOString(),
            });

            // 4. Kirim notifikasi darurat ke Telegram Bot jika dikonfigurasi
            if (node.tele_enabled && (node.notify_offline || node.notify_offline === 1)) {
              const teleConfig = {
                bot_token: node.bot_token,
                chat_id: node.chat_id,
                enabled: true,
                notify_offline: true,
              };

              TelegramService.sendOfflineAlert(
                teleConfig,
                node,
                `Tidak ada transmisi telemetri diterima selama ${Math.round(
                  elapsedSec
                )} detik (Batas timeout: ${this.ewsOfflineTimeoutSec}s)`
              )
                .then((res) => {
                  if (res && res.success) {
                    console.log(`📱 [Watchdog -> Telegram] Berhasil mengirim alert offline untuk ${node.id}`);
                  }
                })
                .catch((err) => {
                  console.error(
                    `❌ [Watchdog -> Telegram] Gagal kirim alert offline untuk ${node.id}:`,
                    err.message
                  );
                });
            }
          }
        }
      }
    } catch (err) {
      console.error('❌ [Watchdog] Error memeriksa status EWS nodes:', err.message);
    }
  }

  /**
   * Pengecekan node perangkap hama (Pest Trap)
   */
  async checkPestTraps(pool) {
    try {
      const [traps] = await pool.query(`
        SELECT id, name, location, status, last_seen_at 
        FROM pest_traps
      `);

      const now = Date.now();

      for (const trap of traps) {
        if (!trap.last_seen_at) continue;

        const lastSeenTime = new Date(trap.last_seen_at).getTime();
        const elapsedSec = (now - lastSeenTime) / 1000;

        if (elapsedSec > this.trapOfflineTimeoutSec && trap.status !== 'offline') {
          console.log(
            `⚠️ [Watchdog] Trap ${trap.id} (${trap.name}) tidak aktif selama ${Math.round(
              elapsedSec
            )}s. Status dialihkan ke OFFLINE.`
          );

          await pool.query(`UPDATE pest_traps SET status = 'offline' WHERE id = ?`, [trap.id]);

          wsService.publish(`traps/${trap.id}/status`, {
            trapId: trap.id,
            status: 'offline',
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.error('❌ [Watchdog] Error memeriksa status Pest Traps:', err.message);
    }
  }
}

const deviceWatchdog = new DeviceWatchdogService();
module.exports = deviceWatchdog;
