const db = require('../database/db');
const wsService = require('../services/websocketService');
const TelegramService = require('../services/telegramService');

// Helper untuk format node dari DB ke struktur EWSNode frontend
function formatEwsNode(node, telegram) {
  return {
    id: node.id,
    name: node.name,
    location: node.location,
    coordinates: {
      lat: parseFloat(node.latitude),
      lng: parseFloat(node.longitude),
    },
    status: node.status,
    sirenActive: Boolean(node.siren_active),
    stroboActive: Boolean(node.strobo_active),
    muted: Boolean(node.muted),
    sensorData: {
      pitchAngle: parseFloat(node.last_pitch || 0),
      rollAngle: parseFloat(node.last_roll || 0),
      soilMoisture: parseFloat(node.last_soil_moisture || 0),
      soilTemperature: parseFloat(node.last_soil_temp || 0),
      rainfallRate: parseFloat(node.last_rainfall_rate || 0),
      rainfallCumulative: parseFloat(node.last_rainfall_cumulative || 0),
      vibrationLevel: parseFloat(node.last_vibration || 0),
      batteryVoltage: parseFloat(node.last_battery_voltage || 12.8),
      batteryCurrent: parseInt(node.last_battery_current || 400, 10),
      solarCurrent: parseInt(node.last_solar_current || 1800, 10),
      gsmSignalDbm: parseInt(node.last_gsm_signal || -70, 10),
      gsmStatus: node.last_gsm_status || 'online',
      microSdStorageUsedMb: parseInt(node.microsd_used_mb || 1000, 10),
      microSdStorageTotalMb: parseInt(node.microsd_total_mb || 30400, 10),
      firmwareVersion: node.firmware_version || 'v2.4.1-ESP32-A7670C',
      uptimeHours: parseInt(node.uptime_hours || 0, 10),
      lastUpdated: node.last_seen_at ? new Date(node.last_seen_at).toLocaleString('id-ID') : 'Aktif',
    },
    thresholds: {
      tiltWarning: parseFloat(node.tilt_warning),
      tiltDanger: parseFloat(node.tilt_danger),
      rainWarning: parseFloat(node.rain_warning),
      rainDanger: parseFloat(node.rain_danger),
      soilMoistureWarning: parseFloat(node.soil_moisture_warning),
      vibrationDanger: parseFloat(node.vibration_danger),
      batteryLowVoltage: parseFloat(node.battery_low_voltage),
    },
    telegramConfig: telegram
      ? {
          ewsId: telegram.ews_id,
          botToken: telegram.bot_token,
          chatId: telegram.chat_id,
          channelName: telegram.channel_name,
          enabled: Boolean(telegram.enabled),
          notifySiaga: Boolean(telegram.notify_siaga),
          notifyBahaya: Boolean(telegram.notify_bahaya),
          notifyOffline: Boolean(telegram.notify_offline),
          notifyBateraiLemah: Boolean(telegram.notify_baterai_lemah),
          notifySensorGagal: Boolean(telegram.notify_sensor_gagal),
          notifyNormalKembali: Boolean(telegram.notify_normal_kembali),
          dailyReport: Boolean(telegram.daily_report),
          lastTestStatus: telegram.last_test_status,
          lastTestTime: telegram.last_test_time,
        }
      : {
          ewsId: node.id,
          botToken: '',
          chatId: '',
          channelName: 'Belum Dikonfigurasi',
          enabled: false,
          notifySiaga: true,
          notifyBahaya: true,
          notifyOffline: true,
          notifyBateraiLemah: true,
          notifySensorGagal: true,
          notifyNormalKembali: true,
          dailyReport: false,
        },
  };
}

exports.getAllEws = async (req, res) => {
  try {
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    if (!isDbConnected || !pool) {
      return res.status(503).json({ success: false, message: 'Database belum terhubung' });
    }

    const [nodes] = await pool.query('SELECT * FROM ews_nodes ORDER BY id ASC');
    const [telegrams] = await pool.query('SELECT * FROM telegram_configs');

    const telegramMap = {};
    telegrams.forEach((t) => {
      telegramMap[t.ews_id] = t;
    });

    const result = nodes.map((node) => formatEwsNode(node, telegramMap[node.id]));
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching EWS nodes:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getEwsById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = db.getPool();
    const [nodes] = await pool.query('SELECT * FROM ews_nodes WHERE id = ?', [id]);
    if (nodes.length === 0) {
      return res.status(404).json({ success: false, message: 'Titik EWS tidak ditemukan' });
    }

    const [telegrams] = await pool.query('SELECT * FROM telegram_configs WHERE ews_id = ?', [id]);
    const result = formatEwsNode(nodes[0], telegrams[0] || null);

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateThresholds = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tiltWarning,
      tiltDanger,
      rainWarning,
      rainDanger,
      soilMoistureWarning,
      vibrationDanger,
      batteryLowVoltage,
    } = req.body;

    const pool = db.getPool();
    await pool.query(
      `UPDATE ews_nodes SET
        tilt_warning = COALESCE(?, tilt_warning),
        tilt_danger = COALESCE(?, tilt_danger),
        rain_warning = COALESCE(?, rain_warning),
        rain_danger = COALESCE(?, rain_danger),
        soil_moisture_warning = COALESCE(?, soil_moisture_warning),
        vibration_danger = COALESCE(?, vibration_danger),
        battery_low_voltage = COALESCE(?, battery_low_voltage)
      WHERE id = ?`,
      [
        tiltWarning,
        tiltDanger,
        rainWarning,
        rainDanger,
        soilMoistureWarning,
        vibrationDanger,
        batteryLowVoltage,
        id,
      ]
    );

    // Broadcast update ambang batas ke ESP32 dan Web
    wsService.publish(`ews/${id}/command`, {
      command: 'SET_THRESHOLDS',
      thresholds: req.body,
      timestamp: new Date().toISOString(),
    });

    return res.json({ success: true, message: `Ambang batas ${id} berhasil diperbarui` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTelegramConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      botToken,
      chatId,
      channelName,
      enabled,
      notifySiaga,
      notifyBahaya,
      notifyOffline,
      notifyBateraiLemah,
      notifySensorGagal,
      notifyNormalKembali,
      dailyReport,
      lastTestStatus,
      lastTestTime,
    } = req.body;

    const pool = db.getPool();
    const cleanBotToken = botToken ? String(botToken).trim() : '';
    const cleanChatId = chatId ? String(chatId).trim() : '';
    const cleanChannelName = channelName ? String(channelName).trim() : 'Saluran Telegram EWS';

    await pool.query(
      `INSERT INTO telegram_configs (
        ews_id, bot_token, chat_id, channel_name, enabled,
        notify_siaga, notify_bahaya, notify_offline, notify_baterai_lemah,
        notify_sensor_gagal, notify_normal_kembali, daily_report, last_test_status, last_test_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        bot_token = VALUES(bot_token),
        chat_id = VALUES(chat_id),
        channel_name = VALUES(channel_name),
        enabled = VALUES(enabled),
        notify_siaga = VALUES(notify_siaga),
        notify_bahaya = VALUES(notify_bahaya),
        notify_offline = VALUES(notify_offline),
        notify_baterai_lemah = VALUES(notify_baterai_lemah),
        notify_sensor_gagal = VALUES(notify_sensor_gagal),
        notify_normal_kembali = VALUES(notify_normal_kembali),
        daily_report = VALUES(daily_report),
        last_test_status = VALUES(last_test_status),
        last_test_time = VALUES(last_test_time)`,
      [
        id,
        cleanBotToken,
        cleanChatId,
        cleanChannelName,
        enabled !== undefined ? (enabled ? 1 : 0) : 1,
        notifySiaga !== undefined ? (notifySiaga ? 1 : 0) : 1,
        notifyBahaya !== undefined ? (notifyBahaya ? 1 : 0) : 1,
        notifyOffline !== undefined ? (notifyOffline ? 1 : 0) : 1,
        notifyBateraiLemah !== undefined ? (notifyBateraiLemah ? 1 : 0) : 1,
        notifySensorGagal !== undefined ? (notifySensorGagal ? 1 : 0) : 1,
        notifyNormalKembali !== undefined ? (notifyNormalKembali ? 1 : 0) : 1,
        dailyReport !== undefined ? (dailyReport ? 1 : 0) : 1,
        lastTestStatus || null,
        lastTestTime || null,
      ]
    );

    // Broadcast pembaruan konfigurasi via WebSocket
    wsService.publish('ews/telegram/updated', {
      ewsId: id,
      telegramConfig: {
        ewsId: id,
        botToken: cleanBotToken,
        chatId: cleanChatId,
        channelName: cleanChannelName,
        enabled: Boolean(enabled),
        notifySiaga: Boolean(notifySiaga),
        notifyBahaya: Boolean(notifyBahaya),
        notifyOffline: Boolean(notifyOffline),
        notifyBateraiLemah: Boolean(notifyBateraiLemah),
        notifySensorGagal: Boolean(notifySensorGagal),
        notifyNormalKembali: Boolean(notifyNormalKembali),
        dailyReport: Boolean(dailyReport),
        lastTestStatus: lastTestStatus || null,
        lastTestTime: lastTestTime || null,
      },
    });

    return res.json({
      success: true,
      message: `Konfigurasi Telegram ${id} berhasil disimpan ke database`,
      data: {
        ewsId: id,
        botToken: cleanBotToken,
        chatId: cleanChatId,
        channelName: cleanChannelName,
      },
    });
  } catch (error) {
    console.error('Error updating telegram config:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.testTelegram = async (req, res) => {
  try {
    const { id } = req.params;
    let { botToken, chatId, message } = req.body;
    const pool = db.getPool();

    // Ambil data node EWS
    const [nodes] = await pool.query('SELECT * FROM ews_nodes WHERE id = ?', [id]);
    let ewsData = nodes[0] || { id, name: id, location: 'Stasiun Pantau' };

    // Jika botToken / chatId tidak dikirim dari form, ambil dari DB
    if (!botToken || !chatId) {
      const [telegrams] = await pool.query('SELECT * FROM telegram_configs WHERE ews_id = ?', [id]);
      if (telegrams.length > 0) {
        botToken = botToken || telegrams[0].bot_token;
        chatId = chatId || telegrams[0].chat_id;
      }
    }

    if (!botToken || !chatId) {
      return res.status(400).json({
        success: false,
        message: 'Bot Token dan Chat ID wajib diisi sebelum melakukan pengujian pesan!',
      });
    }

    // Kirim pesan uji ke Telegram Bot API
    let result;
    if (message) {
      result = await TelegramService.sendMessage(botToken, chatId, message);
    } else {
      result = await TelegramService.sendTestMessage(botToken, chatId, {
        id: ewsData.id,
        name: ewsData.name,
        location: ewsData.location,
        sensorData: {
          pitchAngle: parseFloat(ewsData.last_pitch || 0),
          rollAngle: parseFloat(ewsData.last_roll || 0),
          soilMoisture: parseFloat(ewsData.last_soil_moisture || 0),
          rainfallRate: parseFloat(ewsData.last_rainfall_rate || 0),
          batteryVoltage: parseFloat(ewsData.last_battery_voltage || 12.6),
        },
      });
    }

    // Update status uji di database
    const nowStr = new Date().toLocaleString('id-ID');
    const testStatus = result.success ? 'success' : 'failed';

    try {
      await pool.query(
        `UPDATE telegram_configs SET last_test_status = ?, last_test_time = ? WHERE ews_id = ?`,
        [testStatus, nowStr, id]
      );
    } catch (dbErr) {
      // Abaikan jika belum ada row di telegram_configs
    }

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Gagal mengirim pesan ke Telegram',
        rawError: result.rawError,
      });
    }

    return res.json({
      success: true,
      message: `Pesan uji coba berhasil terkirim ke Chat ID ${chatId}! Periksa aplikasi Telegram Anda.`,
      data: result.data,
      lastTestTime: nowStr,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.controlActuator = async (req, res) => {
  try {
    const { id } = req.params;
    const { command, type, siren, strobo, mute } = req.body;
    const pool = db.getPool();

    let newStatus = undefined;
    let sirenActive = undefined;
    let stroboActive = undefined;
    let muted = undefined;

    if (command === 'TRIGGER_ALARM') {
      newStatus = type || 'bahaya';
      sirenActive = type === 'bahaya';
      stroboActive = true;
    } else if (command === 'RESET_ALARM') {
      newStatus = 'aman';
      sirenActive = false;
      stroboActive = false;
      muted = false;
    } else if (command === 'TOGGLE_MUTE') {
      muted = Boolean(mute);
    } else if (command === 'TEST_BUZZER') {
      sirenActive = true;
    }

    // Update state di tabel ews_nodes
    await pool.query(
      `UPDATE ews_nodes SET
        status = COALESCE(?, status),
        siren_active = COALESCE(?, siren_active),
        strobo_active = COALESCE(?, strobo_active),
        muted = COALESCE(?, muted)
      WHERE id = ?`,
      [newStatus, sirenActive !== undefined ? (sirenActive ? 1 : 0) : null, stroboActive !== undefined ? (stroboActive ? 1 : 0) : null, muted !== undefined ? (muted ? 1 : 0) : null, id]
    );

    // Kirim perintah real-time via WebSocket ke ESP32 pada topic ews/{id}/command
    wsService.publish(`ews/${id}/command`, {
      command,
      payload: req.body,
      timestamp: new Date().toISOString(),
    });

    // Kirim juga event status terupdate ke browser
    wsService.publish(`ews/${id}/status`, {
      ewsId: id,
      status: newStatus,
      sirenActive,
      stroboActive,
      muted,
      timestamp: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: `Perintah ${command} berhasil dikirim ke ${id}`,
      data: { ewsId: id, command, newStatus, sirenActive, stroboActive, muted },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createEws = async (req, res) => {
  try {
    const {
      id,
      name,
      location,
      coordinates,
      thresholds,
      telegramConfig,
    } = req.body;

    if (!id || !name) {
      return res.status(400).json({ success: false, message: 'ID dan Nama EWS wajib diisi' });
    }

    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    if (!isDbConnected || !pool) {
      return res.status(503).json({ success: false, message: 'Database belum terhubung' });
    }

    const [existing] = await pool.query('SELECT id FROM ews_nodes WHERE id = ?', [id]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: `EWS dengan ID "${id}" sudah terdaftar` });
    }

    const lat = coordinates?.lat ? parseFloat(coordinates.lat) : -6.9000;
    const lng = coordinates?.lng ? parseFloat(coordinates.lng) : 107.6200;

    await pool.query(
      `INSERT INTO ews_nodes (
        id, name, location, latitude, longitude, status,
        tilt_warning, tilt_danger, rain_warning, rain_danger,
        soil_moisture_warning, vibration_danger, battery_low_voltage,
        last_pitch, last_roll, last_soil_moisture, last_soil_temp,
        last_rainfall_rate, last_rainfall_cumulative, last_vibration,
        last_battery_voltage, last_battery_current, last_solar_current,
        last_gsm_signal, last_gsm_status, microsd_used_mb, microsd_total_mb,
        firmware_version, uptime_hours
      ) VALUES (
        ?, ?, ?, ?, ?, 'aman',
        ?, ?, ?, ?,
        ?, ?, ?,
        0.00, 0.00, 0.00, 0.00,
        0.00, 0.00, 0.00,
        0.00, 0, 0,
        0, 'offline', 0, 30400,
        'v2.4.1-ESP32-A7670C', 0
      )`,
      [
        id,
        name,
        location || 'Lokasi Baru',
        lat,
        lng,
        thresholds?.tiltWarning || 1.5,
        thresholds?.tiltDanger || 3.0,
        thresholds?.rainWarning || 20.0,
        thresholds?.rainDanger || 50.0,
        thresholds?.soilMoistureWarning || 75.0,
        thresholds?.vibrationDanger || 0.25,
        thresholds?.batteryLowVoltage || 11.8,
      ]
    );

    const tele = telegramConfig || {};
    await pool.query(
      `INSERT INTO telegram_configs (
        ews_id, bot_token, chat_id, channel_name, enabled,
        notify_siaga, notify_bahaya, notify_offline, notify_baterai_lemah,
        notify_sensor_gagal, notify_normal_kembali, daily_report, last_test_status, last_test_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [
        id,
        tele.botToken || '',
        tele.chatId || '',
        tele.channelName || `Grup Pantau ${id}`,
        tele.enabled ? 1 : 0,
        tele.notifySiaga !== false ? 1 : 0,
        tele.notifyBahaya !== false ? 1 : 0,
        tele.notifyOffline !== false ? 1 : 0,
        tele.notifyBateraiLemah !== false ? 1 : 0,
        tele.notifySensorGagal !== false ? 1 : 0,
        tele.notifyNormalKembali !== false ? 1 : 0,
        tele.dailyReport ? 1 : 0,
      ]
    );

    const [newNode] = await pool.query('SELECT * FROM ews_nodes WHERE id = ?', [id]);
    const [newTele] = await pool.query('SELECT * FROM telegram_configs WHERE ews_id = ?', [id]);
    const formatted = formatEwsNode(newNode[0], newTele[0] || null);

    wsService.publish('ews/node/created', {
      node: formatted,
      timestamp: new Date().toISOString(),
    });

    return res.status(201).json({
      success: true,
      message: `Titik EWS ${id} berhasil didaftarkan`,
      data: formatted,
    });
  } catch (error) {
    console.error('Error creating EWS:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteEws = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    if (!isDbConnected || !pool) {
      return res.status(503).json({ success: false, message: 'Database belum terhubung' });
    }

    await pool.query('DELETE FROM telegram_configs WHERE ews_id = ?', [id]);
    await pool.query('DELETE FROM alarm_logs WHERE ews_id = ?', [id]);
    await pool.query('DELETE FROM ews_sensor_logs WHERE ews_id = ?', [id]);
    await pool.query('DELETE FROM ews_nodes WHERE id = ?', [id]);

    wsService.publish('ews/node/deleted', {
      ewsId: id,
      timestamp: new Date().toISOString(),
    });

    return res.json({ success: true, message: `Stasiun EWS ${id} berhasil dihapus` });
  } catch (error) {
    console.error('Error deleting EWS:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

