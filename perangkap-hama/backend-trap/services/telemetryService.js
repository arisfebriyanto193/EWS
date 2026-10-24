const db = require('../database/db');

class TelemetryService {
  /**
   * Pemrosesan Telemetri Perangkat Perangkap Hama Cerdas (Smart Pest Trap)
   */
  static async processTrapTelemetry(trapId, trapData) {
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    const normalizedMode = trapData.mode ? String(trapData.mode).replace('-', '_') : 'otomatis';

    const data = {
      pirTriggerCount: parseInt(trapData.pirTriggerCount || 0, 10),
      photoelectricCount: parseInt(trapData.photoelectricCount || 0, 10),
      containerCapacityPercent: parseInt(trapData.containerCapacityPercent || 0, 10),
      batteryVoltage: parseFloat(trapData.batteryVoltage || 12.6),
      solarChargingCurrent: parseInt(trapData.solarChargingCurrent || 0, 10),
      currentDistance: parseInt(trapData.currentDistance || 0, 10),
      uvLedStatus: trapData.uvLedStatus !== undefined ? (trapData.uvLedStatus ? 1 : 0) : 1,
      blowerStatus: trapData.blowerStatus !== undefined ? (trapData.blowerStatus ? 1 : 0) : 0,
      mode: normalizedMode,
      status: trapData.status || 'aktif',
      activePreset: trapData.activePreset !== undefined ? parseInt(trapData.activePreset, 10) : undefined,
      manualIntervalMin: trapData.manualIntervalMin !== undefined ? parseInt(trapData.manualIntervalMin, 10) : (trapData.manualInterval !== undefined ? parseInt(trapData.manualInterval, 10) : undefined),
      manualDurationSec: trapData.manualDurationSec !== undefined ? parseInt(trapData.manualDurationSec, 10) : (trapData.manualDuration !== undefined ? parseInt(trapData.manualDuration, 10) : undefined),
      sensorCooldownSec: trapData.sensorCooldownSec !== undefined ? parseInt(trapData.sensorCooldownSec, 10) : (trapData.sensor_cooldown_sec !== undefined ? parseInt(trapData.sensor_cooldown_sec, 10) : undefined),
      ledColor: trapData.ledColor || undefined,
      blowerMode: trapData.blowerMode || (trapData.blower_mode || undefined),
      ledRunning: trapData.ledRunning !== undefined ? Boolean(trapData.ledRunning) : (trapData.led_running !== undefined ? Boolean(trapData.led_running) : undefined),
      startTime: trapData.startTime || undefined,
      endTime: trapData.endTime || undefined,
      ledRotationInterval: trapData.ledRotationInterval !== undefined ? parseInt(trapData.ledRotationInterval, 10) : undefined,
      presets: trapData.presets || undefined,
    };

    if (isDbConnected && pool) {
      try {
        const presetsJsonStr = data.presets ? JSON.stringify(data.presets) : undefined;

        // Pastikan node trap terdaftar di pest_traps sebelum insert log
        const [existing] = await pool.query('SELECT id FROM pest_traps WHERE id = ?', [trapId]);
        if (existing.length === 0) {
          await pool.query(
            `INSERT INTO pest_traps (
              id, name, location, uv_led_status, blower_status,
              pir_trigger_count, photoelectric_count, container_capacity_percent,
              battery_voltage, solar_charging_current, current_distance,
              mode, status, active_preset, manual_interval_min, manual_duration_sec, sensor_cooldown_sec, led_color,
              start_time, end_time, led_rotation_interval, presets_json, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              trapId,
              `Perangkap Hama ${trapId}`,
              'Lokasi Lahan Terpasang',
              data.uvLedStatus,
              data.blowerStatus,
              data.pirTriggerCount,
              data.photoelectricCount,
              data.containerCapacityPercent,
              data.batteryVoltage,
              data.solarChargingCurrent,
              data.currentDistance,
              data.mode,
              data.status,
              data.activePreset !== undefined ? data.activePreset : 0,
              data.manualIntervalMin !== undefined ? data.manualIntervalMin : 15,
              data.manualDurationSec !== undefined ? data.manualDurationSec : 3,
              data.sensorCooldownSec !== undefined ? data.sensorCooldownSec : 5,
              data.ledColor || 'UV / Ungu',
              data.startTime || '18:00',
              data.endTime || '06:00',
              data.ledRotationInterval !== undefined ? data.ledRotationInterval : 15,
              presetsJsonStr || null,
            ]
          );
        }

        // Simpan log ke pest_trap_logs
        await pool.query(
          `INSERT INTO pest_trap_logs (
            trap_id, pir_trigger_count, photoelectric_count, container_capacity_percent,
            battery_voltage, solar_charging_current, current_distance, uv_led_status, led_color, blower_status, mode, status, active_preset
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            trapId,
            data.pirTriggerCount,
            data.photoelectricCount,
            data.containerCapacityPercent,
            data.batteryVoltage,
            data.solarChargingCurrent,
            data.currentDistance,
            data.uvLedStatus,
            data.ledColor || 'UV / Ungu',
            data.blowerStatus,
            data.mode,
            data.status,
            data.activePreset !== undefined ? data.activePreset : 0,
          ]
        );

        // Update status master di tabel pest_traps
        await pool.query(
          `UPDATE pest_traps SET
            pir_trigger_count = ?,
            photoelectric_count = ?,
            container_capacity_percent = ?,
            battery_voltage = ?,
            solar_charging_current = ?,
            current_distance = ?,
            uv_led_status = ?,
            blower_status = ?,
            mode = ?,
            status = ?,
            active_preset = COALESCE(?, active_preset),
            manual_interval_min = COALESCE(?, manual_interval_min),
            manual_duration_sec = COALESCE(?, manual_duration_sec),
            sensor_cooldown_sec = COALESCE(?, sensor_cooldown_sec),
            led_color = COALESCE(?, led_color),
            start_time = COALESCE(?, start_time),
            end_time = COALESCE(?, end_time),
            led_rotation_interval = COALESCE(?, led_rotation_interval),
            blower_mode = COALESCE(?, blower_mode),
            led_running = COALESCE(?, led_running),
            presets_json = COALESCE(?, presets_json),
            last_seen_at = NOW()
          WHERE id = ?`,
          [
            data.pirTriggerCount,
            data.photoelectricCount,
            data.containerCapacityPercent,
            data.batteryVoltage,
            data.solarChargingCurrent,
            data.currentDistance,
            data.uvLedStatus,
            data.blowerStatus,
            data.mode,
            data.status,
            data.activePreset !== undefined ? data.activePreset : null,
            data.manualIntervalMin !== undefined ? data.manualIntervalMin : null,
            data.manualDurationSec !== undefined ? data.manualDurationSec : null,
            data.sensorCooldownSec !== undefined ? data.sensorCooldownSec : null,
            data.ledColor || null,
            data.startTime || null,
            data.endTime || null,
            data.ledRotationInterval !== undefined ? data.ledRotationInterval : null,
            data.blowerMode !== undefined ? data.blowerMode : null,
            data.ledRunning !== undefined ? (data.ledRunning ? 1 : 0) : null,
            presetsJsonStr || null,
            trapId,
          ]
        );
      } catch (err) {
        console.error('Error saving Trap telemetry to DB:', err.message);
      }
    } else {
      // In-Memory store fallback
      db.memoryStore.pestTraps[trapId] = {
        id: trapId,
        ...data,
        lastSeenAt: new Date().toISOString(),
      };
      db.memoryStore.trapLogs.unshift({
        id: Date.now(),
        trap_id: trapId,
        ...data,
        created_at: new Date().toISOString(),
      });
    }

    return {
      trapId,
      ...data,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Catat audit log perintah kontrol ke perangkat
   */
  static async recordCommand(deviceId, deviceType, command, payload, issuedBy) {
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    if (isDbConnected && pool) {
      try {
        await pool.query(
          `INSERT INTO device_command_logs (device_id, device_type, command, payload, issued_by, status)
           VALUES (?, ?, ?, ?, ?, 'sent_to_device')`,
          [deviceId, deviceType || 'trap', command, JSON.stringify(payload || {}), issuedBy || 'web_user']
        );
      } catch (err) {
        console.error('Error logging device command to DB:', err.message);
      }
    }
  }
}

module.exports = TelemetryService;
