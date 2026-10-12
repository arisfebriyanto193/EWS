const db = require('../database/db');
const wsService = require('../services/websocketService');

function formatTrapNode(trap) {
  let presets = null;
  if (trap.presets_json) {
    try {
      presets = typeof trap.presets_json === 'string' ? JSON.parse(trap.presets_json) : trap.presets_json;
    } catch {
      presets = null;
    }
  }

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
    currentDistance: parseInt(trap.current_distance || 0, 10),
    mode: trap.mode || 'otomatis',
    status: trap.status || 'aktif',
    activePreset: parseInt(trap.active_preset || 0, 10),
    startTime: trap.start_time || '18:00',
    endTime: trap.end_time || '06:00',
    ledRotationInterval: parseInt(trap.led_rotation_interval || 15, 10),
    manualIntervalMin: parseInt(trap.manual_interval_min || 15, 10),
    manualDurationSec: parseInt(trap.manual_duration_sec || 3, 10),
    ledColor: trap.led_color || '#3b82f6',
    presets: presets,
    lastSeenAt: trap.last_seen_at ? new Date(trap.last_seen_at).toISOString() : null,
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

exports.createTrap = async (req, res) => {
  try {
    const {
      id,
      name,
      location,
      mode = 'otomatis',
      startTime = '18:00',
      endTime = '06:00',
      activePreset = 0,
      ledRotationInterval = 15,
      manualIntervalMin = 15,
      manualDurationSec = 3,
      ledColor = '#3b82f6',
      presets = null,
    } = req.body;

    if (!id || !name) {
      return res.status(400).json({ success: false, message: 'ID dan Nama Perangkap Hama wajib diisi' });
    }

    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    if (!isDbConnected || !pool) {
      return res.status(503).json({ success: false, message: 'Database belum terhubung' });
    }

    const [existing] = await pool.query('SELECT id FROM pest_traps WHERE id = ?', [id]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: `Perangkat dengan ID "${id}" sudah terdaftar` });
    }

    const presetsJsonStr = presets ? JSON.stringify(presets) : null;

    await pool.query(
      `INSERT INTO pest_traps (
        id, name, location, uv_led_status, blower_status,
        pir_trigger_count, photoelectric_count, container_capacity_percent,
        battery_voltage, solar_charging_current, current_distance,
        mode, status, active_preset, start_time, end_time,
        led_rotation_interval, manual_interval_min, manual_duration_sec, led_color, presets_json
      ) VALUES (
        ?, ?, ?, 1, 0,
        0, 0, 0,
        12.60, 0, 0,
        ?, 'aktif', ?, ?, ?,
        ?, ?, ?, ?, ?
      )`,
      [
        id,
        name,
        location || 'Area Perkebunan',
        mode,
        activePreset,
        startTime,
        endTime,
        ledRotationInterval,
        manualIntervalMin,
        manualDurationSec,
        ledColor,
        presetsJsonStr,
      ]
    );

    const [newTrap] = await pool.query('SELECT * FROM pest_traps WHERE id = ?', [id]);
    const formatted = formatTrapNode(newTrap[0]);

    wsService.publish('traps/node/created', {
      node: formatted,
      timestamp: new Date().toISOString(),
    });

    return res.status(201).json({
      success: true,
      message: `Perangkat perangkap hama ${id} berhasil didaftarkan`,
      data: formatted,
    });
  } catch (error) {
    console.error('Error creating trap:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTrap = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      location,
      mode,
      startTime,
      endTime,
      activePreset,
      ledRotationInterval,
      manualIntervalMin,
      manualDurationSec,
      ledColor,
      presets,
    } = req.body;

    const pool = db.getPool();
    const presetsJsonStr = presets !== undefined ? (presets ? JSON.stringify(presets) : null) : undefined;

    await pool.query(
      `UPDATE pest_traps SET
        name = COALESCE(?, name),
        location = COALESCE(?, location),
        mode = COALESCE(?, mode),
        start_time = COALESCE(?, start_time),
        end_time = COALESCE(?, end_time),
        active_preset = COALESCE(?, active_preset),
        led_rotation_interval = COALESCE(?, led_rotation_interval),
        manual_interval_min = COALESCE(?, manual_interval_min),
        manual_duration_sec = COALESCE(?, manual_duration_sec),
        led_color = COALESCE(?, led_color),
        presets_json = COALESCE(?, presets_json)
      WHERE id = ?`,
      [
        name || null,
        location || null,
        mode || null,
        startTime || null,
        endTime || null,
        activePreset !== undefined ? activePreset : null,
        ledRotationInterval !== undefined ? ledRotationInterval : null,
        manualIntervalMin !== undefined ? manualIntervalMin : null,
        manualDurationSec !== undefined ? manualDurationSec : null,
        ledColor || null,
        presetsJsonStr !== undefined ? presetsJsonStr : null,
        id,
      ]
    );

    const [updated] = await pool.query('SELECT * FROM pest_traps WHERE id = ?', [id]);
    if (updated.length === 0) {
      return res.status(404).json({ success: false, message: 'Perangkat tidak ditemukan' });
    }

    const formatted = formatTrapNode(updated[0]);

    // Beri tahu ESP32 tentang update konfigurasi
    wsService.publish(`traps/${id}/command`, {
      command: 'SET_CONFIG',
      payload: formatted,
      timestamp: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: `Data ${id} berhasil diperbarui`,
      data: formatted,
    });
  } catch (error) {
    console.error('Error updating trap:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteTrap = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = db.getPool();

    const [check] = await pool.query('SELECT id, name FROM pest_traps WHERE id = ?', [id]);
    if (check.length === 0) {
      return res.status(404).json({ success: false, message: 'Perangkat tidak ditemukan' });
    }

    await pool.query('DELETE FROM pest_traps WHERE id = ?', [id]);

    wsService.publish('traps/node/deleted', {
      id,
      timestamp: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: `Perangkat ${id} (${check[0].name}) berhasil dihapus`,
    });
  } catch (error) {
    console.error('Error deleting trap:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.controlTrap = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      mode,
      uvLedStatus,
      blowerStatus,
      status,
      activePreset,
      startTime,
      endTime,
      ledRotationInterval,
      manualIntervalMin,
      manualDurationSec,
      ledColor,
      presets,
      command = 'SET_CONTROL',
    } = req.body;
    const pool = db.getPool();

    const presetsJsonStr = presets !== undefined ? (presets ? JSON.stringify(presets) : null) : undefined;

    const [existing] = await pool.query('SELECT id FROM pest_traps WHERE id = ?', [id]);
    if (existing.length === 0) {
      await pool.query(
        `INSERT INTO pest_traps (
          id, name, location, uv_led_status, blower_status,
          mode, status, active_preset, start_time, end_time,
          led_rotation_interval, manual_interval_min, manual_duration_sec, led_color, presets_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          `Perangkap Hama ${id}`,
          'Area Perkebunan Warga',
          uvLedStatus !== undefined ? (uvLedStatus ? 1 : 0) : 1,
          blowerStatus !== undefined ? (blowerStatus ? 1 : 0) : 0,
          mode || 'otomatis',
          status || 'aktif',
          activePreset !== undefined ? activePreset : 0,
          startTime || '18:00',
          endTime || '06:00',
          ledRotationInterval !== undefined ? ledRotationInterval : 15,
          manualIntervalMin !== undefined ? manualIntervalMin : 15,
          manualDurationSec !== undefined ? manualDurationSec : 3,
          ledColor || '#3b82f6',
          presetsJsonStr !== undefined ? presetsJsonStr : null,
        ]
      );
    } else {
      await pool.query(
        `UPDATE pest_traps SET
          mode = COALESCE(?, mode),
          uv_led_status = COALESCE(?, uv_led_status),
          blower_status = COALESCE(?, blower_status),
          status = COALESCE(?, status),
          active_preset = COALESCE(?, active_preset),
          start_time = COALESCE(?, start_time),
          end_time = COALESCE(?, end_time),
          led_rotation_interval = COALESCE(?, led_rotation_interval),
          manual_interval_min = COALESCE(?, manual_interval_min),
          manual_duration_sec = COALESCE(?, manual_duration_sec),
          led_color = COALESCE(?, led_color),
          presets_json = COALESCE(?, presets_json)
        WHERE id = ?`,
        [
          mode || null,
          uvLedStatus !== undefined ? (uvLedStatus ? 1 : 0) : null,
          blowerStatus !== undefined ? (blowerStatus ? 1 : 0) : null,
          status || null,
          activePreset !== undefined ? activePreset : null,
          startTime || null,
          endTime || null,
          ledRotationInterval !== undefined ? ledRotationInterval : null,
          manualIntervalMin !== undefined ? manualIntervalMin : null,
          manualDurationSec !== undefined ? manualDurationSec : null,
          ledColor || null,
          presetsJsonStr !== undefined ? presetsJsonStr : null,
          id,
        ]
      );
    }

    // Ambil data terbaru
    const [rows] = await pool.query('SELECT * FROM pest_traps WHERE id = ?', [id]);
    const formatted = rows.length > 0 ? formatTrapNode(rows[0]) : null;

    // Kirim instruksi ke mikrokontroler ESP32 Trap via WebSocket topic: traps/{id}/command
    wsService.publish(`traps/${id}/command`, {
      command,
      mode,
      uvLedStatus: uvLedStatus !== undefined ? (uvLedStatus ? true : false) : undefined,
      blowerStatus: blowerStatus !== undefined ? (blowerStatus ? true : false) : undefined,
      status,
      activePreset,
      startTime,
      endTime,
      ledRotationInterval,
      manualIntervalMin,
      manualDurationSec,
      ledColor,
      presets,
      payload: {
        command,
        mode,
        uvLedStatus,
        blowerStatus,
        status,
        activePreset,
        startTime,
        endTime,
        ledRotationInterval,
        manualIntervalMin,
        manualDurationSec,
        ledColor,
        presets,
      },
      timestamp: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: `Kontrol ${id} berhasil dikirim ke perangkat`,
      data: formatted,
    });
  } catch (error) {
    console.error('Error controlling trap:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
