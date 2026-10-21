const db = require('../database/db');
const TelemetryService = require('../services/telemetryService');
const wsService = require('../services/websocketService');
const { formatWib } = require('../utils/dateUtils');

exports.getTrapLogs = async (req, res) => {
  try {
    const { trapId, startDate, endDate, limit = 100, page = 1 } = req.query;
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    if (!isDbConnected || !pool) {
      return res.status(503).json({ success: false, message: 'Database belum terhubung' });
    }

    let sql = 'SELECT * FROM pest_trap_logs WHERE 1=1';
    const params = [];

    if (trapId) {
      sql += ' AND trap_id = ?';
      params.push(trapId);
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

    const formattedData = rows.map((r) => ({
      ...r,
      created_at_wib: formatWib(r.created_at, false),
      created_at_wib_full: formatWib(r.created_at, true),
    }));

    return res.json({
      success: true,
      count: formattedData.length,
      page: parsedPage,
      limit: parsedLimit,
      data: formattedData,
    });
  } catch (error) {
    console.error('Error fetching trap logs:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.exportTrapCsv = async (req, res) => {
  try {
    const { trapId, startDate, endDate } = req.query;
    const pool = db.getPool();

    let sql = 'SELECT * FROM pest_trap_logs WHERE 1=1';
    const params = [];

    if (trapId) {
      sql += ' AND trap_id = ?';
      params.push(trapId);
    }
    if (startDate) {
      sql += ' AND created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND created_at <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY created_at ASC LIMIT 2000';
    const [rows] = await pool.query(sql, params);

    let csv = 'ID,ID Perangkap,Waktu (WIB),Status UV LED,Status Blower,PIR Count,Photoelectric Count,Kapasitas Kontainer (%),Tegangan Baterai (V),Arus Solar (mA),Jarak Sensor (cm)\n';

    rows.forEach((r) => {
      const line = [
        r.id,
        r.trap_id,
        `"${formatWib(r.created_at, true)}"`,
        r.uv_led_status ? 'ON' : 'OFF',
        r.blower_status ? 'ON' : 'OFF',
        r.pir_trigger_count || 0,
        r.photoelectric_count || 0,
        r.container_capacity_percent || 0,
        r.battery_voltage || 0,
        r.solar_charging_current || 0,
        r.current_distance || 0,
      ].join(',');
      csv += line + '\n';
    });

    const filename = `trap_log_${trapId || 'all'}_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (error) {
    console.error('Error exporting trap csv:', error);
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
