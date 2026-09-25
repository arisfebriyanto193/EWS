const db = require('../database/db');
const wsService = require('../services/websocketService');

function formatAlarmLog(row) {
  return {
    id: row.id,
    ewsId: row.ews_id,
    ewsName: row.ews_name || `Titik ${row.ews_id}`,
    timestamp: row.created_at ? new Date(row.created_at).toLocaleString('id-ID') + ' WIB' : '',
    type: row.alarm_type,
    triggerCause: row.trigger_cause,
    triggerValue: row.trigger_value,
    durationMinutes: parseInt(row.duration_minutes || 0, 10),
    acknowledged: Boolean(row.acknowledged),
    acknowledgedBy: row.acknowledged_by || undefined,
    acknowledgeNote: row.acknowledge_note || undefined,
    acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at).toLocaleString('id-ID') + ' WIB' : undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toLocaleString('id-ID') + ' WIB' : undefined,
  };
}

exports.getAlarms = async (req, res) => {
  try {
    const { ewsId, type, acknowledged, limit = 50 } = req.query;
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    if (!isDbConnected || !pool) {
      return res.status(503).json({ success: false, message: 'Database belum terhubung' });
    }

    let sql = `
      SELECT a.*, e.name AS ews_name
      FROM alarm_logs a
      LEFT JOIN ews_nodes e ON a.ews_id = e.id
      WHERE 1=1
    `;
    const params = [];

    if (ewsId) {
      sql += ' AND a.ews_id = ?';
      params.push(ewsId);
    }
    if (type) {
      sql += ' AND a.alarm_type = ?';
      params.push(type);
    }
    if (acknowledged !== undefined) {
      sql += ' AND a.acknowledged = ?';
      params.push(acknowledged === 'true' || acknowledged === '1' ? 1 : 0);
    }

    sql += ' ORDER BY a.created_at DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const [rows] = await pool.query(sql, params);
    const result = rows.map(formatAlarmLog);

    return res.json({ success: true, count: result.length, data: result });
  } catch (error) {
    console.error('Error fetching alarm logs:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.acknowledgeAlarm = async (req, res) => {
  try {
    const { id } = req.params;
    const { note, author } = req.body;
    const pool = db.getPool();

    if (!note || !author) {
      return res.status(400).json({ success: false, message: 'Catatan konfirmasi dan nama operator wajib diisi' });
    }

    await pool.query(
      `UPDATE alarm_logs SET
        acknowledged = 1,
        acknowledged_by = ?,
        acknowledge_note = ?,
        acknowledged_at = NOW()
      WHERE id = ?`,
      [author, note, id]
    );

    // Ambil data terbaru untuk broadcast
    const [rows] = await pool.query(
      `SELECT a.*, e.name AS ews_name 
       FROM alarm_logs a 
       LEFT JOIN ews_nodes e ON a.ews_id = e.id 
       WHERE a.id = ?`,
      [id]
    );

    const updatedLog = rows.length > 0 ? formatAlarmLog(rows[0]) : null;

    // Broadcast ke browser
    if (updatedLog) {
      wsService.publish('alarms', {
        event: 'ALARM_ACKNOWLEDGED',
        data: updatedLog,
      });
    }

    return res.json({
      success: true,
      message: `Alarm ${id} berhasil dikonfirmasi oleh ${author}`,
      data: updatedLog,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.resolveAlarm = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = db.getPool();

    await pool.query(
      `UPDATE alarm_logs SET
        resolved_at = NOW()
      WHERE id = ?`,
      [id]
    );

    return res.json({ success: true, message: `Status bahaya alarm ${id} dinyatakan telah selesai / normal kembali` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
