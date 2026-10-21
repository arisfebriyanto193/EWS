const db = require('../database/db');
const wsService = require('./websocketService');

class DeviceWatchdogService {
  constructor() {
    this.intervalHandle = null;
    this.checkIntervalMs = 15000; // Pengecekan setiap 15 detik
    this.trapOfflineTimeoutSec = 180; // 180 detik (3 menit toleransi)
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(
      `🛡️ [Watchdog] Layanan pemantau koneksi perangkap hama aktif (Interval: ${this.checkIntervalMs / 1000}s, Timeout: ${this.trapOfflineTimeoutSec}s)`
    );

    // Jalankan pengecekan perdana setelah 5 detik
    setTimeout(() => {
      this.checkPestTraps().catch((err) =>
        console.error('❌ [Watchdog Error] Pengecekan perdana gagal:', err.message)
      );
    }, 5000);

    this.intervalHandle = setInterval(() => {
      this.checkPestTraps().catch((err) =>
        console.error('❌ [Watchdog Error] Interval check error:', err.message)
      );
    }, this.checkIntervalMs);
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    console.log('🛑 [Watchdog] Layanan pemantau koneksi perangkat dihentikan');
  }

  async checkPestTraps() {
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();
    if (!pool || !isDbConnected) return;

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
