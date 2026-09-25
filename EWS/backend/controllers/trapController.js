const db = require('../database/db');
const wsService = require('../services/websocketService');

function formatTrapNode(trap) {
  return {
    id: trap.id,
    name: trap.name,
    location: trap.location,
    uvLedStatus: Boolean(trap.uv_led_status),
    blowerStatus: Boolean(trap.blower_status),
    pirTriggerCount: parseInt(trap.pir_trigger_count || 0, 10),
    photoelectricCount: parseInt(trap.photoelectric_count || 0, 10),
    containerCapacityPercent: parseInt(trap.container_capacity_percent || 0, 10),
    batteryVoltage: parseFloat(trap.battery_voltage || 12.6),
    solarChargingCurrent: parseInt(trap.solar_charging_current || 1400, 10),
    mode: trap.mode,
    status: trap.status,
  };
}

exports.getAllTraps = async (req, res) => {
  try {
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    if (!isDbConnected || !pool) {
      return res.status(503).json({ success: false, message: 'Database belum terhubung' });
    }

    const [rows] = await pool.query('SELECT * FROM pest_traps ORDER BY id ASC');
    const result = rows.map(formatTrapNode);

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching traps:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTrapById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = db.getPool();
    const [rows] = await pool.query('SELECT * FROM pest_traps WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Perangkap hama tidak ditemukan' });
    }

    return res.json({ success: true, data: formatTrapNode(rows[0]) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.controlTrap = async (req, res) => {
  try {
    const { id } = req.params;
    const { mode, uvLedStatus, blowerStatus, status } = req.body;
    const pool = db.getPool();

    await pool.query(
      `UPDATE pest_traps SET
        mode = COALESCE(?, mode),
        uv_led_status = COALESCE(?, uv_led_status),
        blower_status = COALESCE(?, blower_status),
        status = COALESCE(?, status)
      WHERE id = ?`,
      [
        mode || null,
        uvLedStatus !== undefined ? (uvLedStatus ? 1 : 0) : null,
        blowerStatus !== undefined ? (blowerStatus ? 1 : 0) : null,
        status || null,
        id,
      ]
    );

    // Kirim instruksi ke mikrokontroler ESP32 Trap via WebSocket
    wsService.publish(`traps/${id}/command`, {
      command: 'SET_ACTUATOR',
      payload: { mode, uvLedStatus, blowerStatus, status },
      timestamp: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: `Kontrol ${id} berhasil dikirim ke perangkat`,
      data: { id, mode, uvLedStatus, blowerStatus, status },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
