const db = require('../database/db');
const TelemetryService = require('../services/telemetryService');
const wsService = require('../services/websocketService');

exports.getSensorLogs = async (req, res) => {
  try {
    const { ewsId, startDate, endDate, limit = 100, page = 1 } = req.query;
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    if (!isDbConnected || !pool) {
      return res.status(503).json({ success: false, message: 'Database belum terhubung' });
    }

    let sql = 'SELECT * FROM ews_sensor_logs WHERE 1=1';
    const params = [];

    if (ewsId) {
      sql += ' AND ews_id = ?';
      params.push(ewsId);
    }
    if (startDate) {
      sql += ' AND created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND created_at <= ?';
      params.push(endDate);
    }

    const parsedLimit = parseInt(limit, 10);
    const parsedPage = parseInt(page, 10);
    const offset = (parsedPage - 1) * parsedLimit;

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parsedLimit, offset);

    const [rows] = await pool.query(sql, params);

    return res.json({
      success: true,
      count: rows.length,
      page: parsedPage,
      limit: parsedLimit,
      data: rows,
    });
  } catch (error) {
    console.error('Error querying sensor logs:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTrapLogs = async (req, res) => {
  try {
    const { trapId, limit = 100 } = req.query;
    const pool = db.getPool();

    let sql = 'SELECT * FROM pest_trap_logs WHERE 1=1';
    const params = [];

    if (trapId) {
      sql += ' AND trap_id = ?';
      params.push(trapId);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.exportSensorCsv = async (req, res) => {
  try {
    const { ewsId, startDate, endDate } = req.query;
    const pool = db.getPool();

    let sql = 'SELECT * FROM ews_sensor_logs WHERE 1=1';
    const params = [];

    if (ewsId) {
      sql += ' AND ews_id = ?';
      params.push(ewsId);
    }
    if (startDate) {
      sql += ' AND created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND created_at <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY created_at ASC LIMIT 1000';
    const [rows] = await pool.query(sql, params);

    // Generate CSV Header
    let csv = 'ID,Titik EWS,Waktu,Pitch (°),Roll (°),Kelembapan (%),Suhu (°C),Curah Hujan (mm/h),Akumulasi Hujan (mm),Getaran (g),Tegangan Aki (V),Arus Aki (mA),Arus Solar (mA),GSM RSSI (dBm),Status GSM\n';

    rows.forEach((r) => {
      const line = [
        r.id,
        r.ews_id,
        `"${new Date(r.created_at).toISOString()}"`,
        r.pitch_angle,
        r.roll_angle,
        r.soil_moisture,
        r.soil_temperature,
        r.rainfall_rate,
        r.rainfall_cumulative,
        r.vibration_level,
        r.battery_voltage,
        r.battery_current,
        r.solar_current,
        r.gsm_signal_dbm,
        r.gsm_status,
      ].join(',');
      csv += line + '\n';
    });

    const filename = `telemetri_${ewsId || 'all'}_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// HTTP Fallback jika ESP32 mengirim telemetri via HTTP POST
exports.postEwsTelemetryHttp = async (req, res) => {
  try {
    const { ewsId, sensorData } = req.body;
    if (!ewsId || !sensorData) {
      return res.status(400).json({ success: false, message: 'ewsId dan sensorData wajib diisi' });
    }

    const processed = await TelemetryService.processEwsTelemetry(ewsId, sensorData);

    // Broadcast ke WebSocket subscriber
    wsService.publish(`ews/${ewsId}/telemetry`, processed);

    return res.json({ success: true, message: 'Data telemetri berhasil diterima dan diproses', data: processed });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.postTrapTelemetryHttp = async (req, res) => {
  try {
    const { trapId, trapData } = req.body;
    if (!trapId || !trapData) {
      return res.status(400).json({ success: false, message: 'trapId dan trapData wajib diisi' });
    }

    const processed = await TelemetryService.processTrapTelemetry(trapId, trapData);
    wsService.publish(`traps/${trapId}/telemetry`, processed);

    return res.json({ success: true, message: 'Data perangkap hama berhasil diproses', data: processed });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
