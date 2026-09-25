const db = require('../database/db');

/**
 * Service untuk memproses telemetri sensor, pengecekan threshold,
 * pencatatan ke database, dan pemicuan alarm otomatis.
 */
class TelemetryService {
  /**
   * Proses data sensor EWS dari ESP32
   */
  static async processEwsTelemetry(ewsId, sensorData) {
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    // Default nilai sensor dengan sanitasi angka
    const data = {
      pitchAngle: parseFloat(sensorData.pitchAngle || sensorData.pitch || 0),
      rollAngle: parseFloat(sensorData.rollAngle || sensorData.roll || 0),
      soilMoisture: parseFloat(sensorData.soilMoisture || 0),
      soilTemperature: parseFloat(sensorData.soilTemperature || sensorData.temp || 0),
      rainfallRate: parseFloat(sensorData.rainfallRate || sensorData.rain || 0),
      rainfallCumulative: parseFloat(sensorData.rainfallCumulative || 0),
      vibrationLevel: parseFloat(sensorData.vibrationLevel || sensorData.vib || 0),
      batteryVoltage: parseFloat(sensorData.batteryVoltage || sensorData.batt || 12.8),
      batteryCurrent: parseInt(sensorData.batteryCurrent || 400, 10),
      solarCurrent: parseInt(sensorData.solarCurrent || 1800, 10),
      gsmSignalDbm: parseInt(sensorData.gsmSignalDbm || -70, 10),
      gsmStatus: sensorData.gsmStatus || 'online',
      microsdUsedMb: parseInt(sensorData.microsdUsedMb || 1000, 10),
      microsdTotalMb: parseInt(sensorData.microsdTotalMb || 30400, 10),
      firmwareVersion: sensorData.firmwareVersion || 'v2.4.1-ESP32-A7670C',
      uptimeHours: parseInt(sensorData.uptimeHours || 1, 10),
    };

    let thresholds = {
      tiltWarning: 1.5,
      tiltDanger: 3.0,
      rainWarning: 20.0,
      rainDanger: 50.0,
      soilMoistureWarning: 75.0,
      vibrationDanger: 0.25,
      batteryLowVoltage: 11.8,
    };

    let currentNode = null;

    if (isDbConnected && pool) {
      try {
        const [nodes] = await pool.query('SELECT * FROM ews_nodes WHERE id = ?', [ewsId]);
        if (nodes.length > 0) {
          currentNode = nodes[0];
          thresholds = {
            tiltWarning: parseFloat(currentNode.tilt_warning),
            tiltDanger: parseFloat(currentNode.tilt_danger),
            rainWarning: parseFloat(currentNode.rain_warning),
            rainDanger: parseFloat(currentNode.rain_danger),
            soilMoistureWarning: parseFloat(currentNode.soil_moisture_warning),
            vibrationDanger: parseFloat(currentNode.vibration_danger),
            batteryLowVoltage: parseFloat(currentNode.battery_low_voltage),
          };
        }
      } catch (err) {
        console.error('Error fetching threshold from DB:', err.message);
      }
    }

    // Evaluasi Status Berdasarkan Batas Ambang (Thresholds)
    let newStatus = 'aman';
    let sirenActive = false;
    let stroboActive = false;
    let alarmTriggered = false;
    let triggerCause = '';
    let triggerValue = '';

    const absPitch = Math.abs(data.pitchAngle);
    const absRoll = Math.abs(data.rollAngle);

    if (
      absPitch >= thresholds.tiltDanger ||
      absRoll >= thresholds.tiltDanger ||
      data.rainfallRate >= thresholds.rainDanger ||
      data.vibrationLevel >= thresholds.vibrationDanger
    ) {
      newStatus = 'bahaya';
      sirenActive = true;
      stroboActive = true;
      alarmTriggered = true;
      triggerCause = 'Kemiringan Tanah Ekstrem / Curah Hujan Bahaya / Getaran Gempa';
      triggerValue = `Pitch: ${data.pitchAngle}°, Roll: ${data.rollAngle}°, Hujan: ${data.rainfallRate}mm/h, Getaran: ${data.vibrationLevel}g`;
    } else if (
      absPitch >= thresholds.tiltWarning ||
      absRoll >= thresholds.tiltWarning ||
      data.rainfallRate >= thresholds.rainWarning ||
      data.soilMoisture >= thresholds.soilMoistureWarning
    ) {
      newStatus = 'siaga';
      sirenActive = false;
      stroboActive = true;
      alarmTriggered = true;
      triggerCause = 'Kemiringan / Curah Hujan / Kelembapan Melebihi Batas Siaga';
      triggerValue = `Pitch: ${data.pitchAngle}°, Hujan: ${data.rainfallRate}mm/h, Kelembapan: ${data.soilMoisture}%`;
    } else if (data.batteryVoltage < thresholds.batteryLowVoltage) {
      newStatus = 'baterai_lemah';
      alarmTriggered = true;
      triggerCause = 'Tegangan Baterai VRLA Dibawah Batas Aman';
      triggerValue = `${data.batteryVoltage} V`;
    }

    // 1. Simpan Log Sensor ke ews_sensor_logs
    if (isDbConnected && pool) {
      try {
        await pool.query(
          `INSERT INTO ews_sensor_logs (
            ews_id, pitch_angle, roll_angle, soil_moisture, soil_temperature,
            rainfall_rate, rainfall_cumulative, vibration_level, battery_voltage,
            battery_current, solar_current, gsm_signal_dbm, gsm_status,
            microsd_used_mb, microsd_total_mb, firmware_version, uptime_hours
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ewsId,
            data.pitchAngle,
            data.rollAngle,
            data.soilMoisture,
            data.soilTemperature,
            data.rainfallRate,
            data.rainfallCumulative,
            data.vibrationLevel,
            data.batteryVoltage,
            data.batteryCurrent,
            data.solarCurrent,
            data.gsmSignalDbm,
            data.gsmStatus,
            data.microsdUsedMb,
            data.microsdTotalMb,
            data.firmwareVersion,
            data.uptimeHours,
          ]
        );

        // 2. Update Cache Status di Tabel ews_nodes
        await pool.query(
          `UPDATE ews_nodes SET
            status = ?,
            siren_active = ?,
            strobo_active = ?,
            last_pitch = ?,
            last_roll = ?,
            last_soil_moisture = ?,
            last_soil_temp = ?,
            last_rainfall_rate = ?,
            last_rainfall_cumulative = ?,
            last_vibration = ?,
            last_battery_voltage = ?,
            last_battery_current = ?,
            last_solar_current = ?,
            last_gsm_signal = ?,
            last_gsm_status = ?,
            uptime_hours = ?,
            last_seen_at = NOW()
          WHERE id = ?`,
          [
            newStatus,
            sirenActive ? 1 : 0,
            stroboActive ? 1 : 0,
            data.pitchAngle,
            data.rollAngle,
            data.soilMoisture,
            data.soilTemperature,
            data.rainfallRate,
            data.rainfallCumulative,
            data.vibrationLevel,
            data.batteryVoltage,
            data.batteryCurrent,
            data.solarCurrent,
            data.gsmSignalDbm,
            data.gsmStatus,
            data.uptimeHours,
            ewsId,
          ]
        );

        // 3. Jika memicu alarm, cek apakah perlu insert ke alarm_logs (hindari duplikasi dalam 15 menit)
        if (alarmTriggered && (newStatus === 'siaga' || newStatus === 'bahaya')) {
          const [recent] = await pool.query(
            `SELECT id FROM alarm_logs 
             WHERE ews_id = ? AND alarm_type = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
             LIMIT 1`,
            [ewsId, newStatus]
          );

          if (recent.length === 0) {
            const alarmId = `ALM-${Date.now().toString().slice(-6)}`;
            await pool.query(
              `INSERT INTO alarm_logs (
                id, ews_id, alarm_type, trigger_cause, trigger_value, duration_minutes, acknowledged
              ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
              [alarmId, ewsId, newStatus, triggerCause, triggerValue, 1]
            );
            console.log(`🚨 [ALARM BARU DICATAT] ${alarmId} pada ${ewsId} (${newStatus.toUpperCase()}): ${triggerCause}`);
          }
        }
      } catch (err) {
        console.error('Error saving EWS telemetry to DB:', err.message);
      }
    }

    return {
      ewsId,
      status: newStatus,
      sirenActive,
      stroboActive,
      sensorData: data,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Proses data sensor tunggal per topik individual (e.g. ews/EWS-01/pitch, ews/EWS-01/rainfall_rate)
   */
  static async processSingleSensor(ewsId, sensorKey, rawValue) {
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    // Normalisasi value
    let numVal = typeof rawValue === 'object' && rawValue !== null && 'value' in rawValue
      ? parseFloat(rawValue.value)
      : parseFloat(rawValue);

    if (isNaN(numVal)) {
      numVal = 0;
    }

    // Mapping key topik ke kolom tabel database & properti objek sensorData
    const keyMap = {
      pitch: { col: 'last_pitch', prop: 'pitchAngle' },
      pitch_angle: { col: 'last_pitch', prop: 'pitchAngle' },
      roll: { col: 'last_roll', prop: 'rollAngle' },
      roll_angle: { col: 'last_roll', prop: 'rollAngle' },
      soil_moisture: { col: 'last_soil_moisture', prop: 'soilMoisture' },
      soil_temp: { col: 'last_soil_temp', prop: 'soilTemperature' },
      soil_temperature: { col: 'last_soil_temp', prop: 'soilTemperature' },
      rainfall_rate: { col: 'last_rainfall_rate', prop: 'rainfallRate' },
      rain: { col: 'last_rainfall_rate', prop: 'rainfallRate' },
      rain_rate: { col: 'last_rainfall_rate', prop: 'rainfallRate' },
      rainfall_cumulative: { col: 'last_rainfall_cumulative', prop: 'rainfallCumulative' },
      vibration: { col: 'last_vibration', prop: 'vibrationLevel' },
      vibration_level: { col: 'last_vibration', prop: 'vibrationLevel' },
      battery: { col: 'last_battery_voltage', prop: 'batteryVoltage' },
      battery_voltage: { col: 'last_battery_voltage', prop: 'batteryVoltage' },
      battery_current: { col: 'last_battery_current', prop: 'batteryCurrent' },
      solar: { col: 'last_solar_current', prop: 'solarCurrent' },
      solar_current: { col: 'last_solar_current', prop: 'solarCurrent' },
      gsm: { col: 'last_gsm_signal', prop: 'gsmSignalDbm' },
      gsm_signal: { col: 'last_gsm_signal', prop: 'gsmSignalDbm' },
      uptime: { col: 'uptime_hours', prop: 'uptimeHours' },
    };

    const target = keyMap[sensorKey.toLowerCase()];
    if (!target) {
      console.warn(`[Telemetry] Sensor key '${sensorKey}' tidak dikenali`);
      return null;
    }

    let currentNode = null;
    if (isDbConnected && pool) {
      try {
        const [rows] = await pool.query('SELECT * FROM ews_nodes WHERE id = ?', [ewsId]);
        if (rows.length > 0) {
          currentNode = rows[0];

          await pool.query(
            `UPDATE ews_nodes SET ${target.col} = ?, last_seen_at = NOW() WHERE id = ?`,
            [numVal, ewsId]
          );

          currentNode[target.col] = numVal;

          const tiltDanger = parseFloat(currentNode.tilt_danger || 3.0);
          const tiltWarning = parseFloat(currentNode.tilt_warning || 1.5);
          const rainDanger = parseFloat(currentNode.rain_danger || 50.0);
          const rainWarning = parseFloat(currentNode.rain_warning || 20.0);
          const soilMoistureWarning = parseFloat(currentNode.soil_moisture_warning || 75.0);
          const vibrationDanger = parseFloat(currentNode.vibration_danger || 0.25);
          const batteryLow = parseFloat(currentNode.battery_low_voltage || 11.8);

          const pitch = Math.abs(parseFloat(currentNode.last_pitch || 0));
          const roll = Math.abs(parseFloat(currentNode.last_roll || 0));
          const rain = parseFloat(currentNode.last_rainfall_rate || 0);
          const soilM = parseFloat(currentNode.last_soil_moisture || 0);
          const vib = parseFloat(currentNode.last_vibration || 0);
          const batt = parseFloat(currentNode.last_battery_voltage || 12.8);

          let newStatus = 'aman';
          let sirenActive = false;
          let stroboActive = false;

          if (pitch >= tiltDanger || roll >= tiltDanger || rain >= rainDanger || vib >= vibrationDanger) {
            newStatus = 'bahaya';
            sirenActive = true;
            stroboActive = true;
          } else if (pitch >= tiltWarning || roll >= tiltWarning || rain >= rainWarning || soilM >= soilMoistureWarning) {
            newStatus = 'siaga';
            sirenActive = false;
            stroboActive = true;
          } else if (batt < batteryLow) {
            newStatus = 'baterai_lemah';
          }

          if (newStatus !== currentNode.status || sirenActive !== Boolean(currentNode.siren_active)) {
            await pool.query(
              `UPDATE ews_nodes SET status = ?, siren_active = ?, strobo_active = ? WHERE id = ?`,
              [newStatus, sirenActive ? 1 : 0, stroboActive ? 1 : 0, ewsId]
            );

            if (newStatus === 'siaga' || newStatus === 'bahaya') {
              const [recent] = await pool.query(
                `SELECT id FROM alarm_logs 
                 WHERE ews_id = ? AND alarm_type = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
                 LIMIT 1`,
                [ewsId, newStatus]
              );
              if (recent.length === 0) {
                const alarmId = `ALM-${Date.now().toString().slice(-6)}`;
                await pool.query(
                  `INSERT INTO alarm_logs (id, ews_id, alarm_type, trigger_cause, trigger_value, duration_minutes, acknowledged)
                   VALUES (?, ?, ?, ?, ?, 1, 0)`,
                  [
                    alarmId,
                    ewsId,
                    newStatus,
                    `Pemicu ${sensorKey} (${numVal}) melebihi ambang batas ${newStatus.toUpperCase()}`,
                    `${sensorKey}: ${numVal}`,
                  ]
                );
                console.log(`🚨 [ALARM BARU] ${alarmId} pada ${ewsId} via topik ${sensorKey}`);
              }
            }
          }

          // Simpan log snapshot berkala
          await pool.query(
            `INSERT INTO ews_sensor_logs (
              ews_id, pitch_angle, roll_angle, soil_moisture, soil_temperature,
              rainfall_rate, rainfall_cumulative, vibration_level, battery_voltage,
              battery_current, solar_current, gsm_signal_dbm, gsm_status, uptime_hours
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              ewsId,
              parseFloat(currentNode.last_pitch || 0),
              parseFloat(currentNode.last_roll || 0),
              parseFloat(currentNode.last_soil_moisture || 0),
              parseFloat(currentNode.last_soil_temp || 0),
              parseFloat(currentNode.last_rainfall_rate || 0),
              parseFloat(currentNode.last_rainfall_cumulative || 0),
              parseFloat(currentNode.last_vibration || 0),
              parseFloat(currentNode.last_battery_voltage || 12.8),
              parseInt(currentNode.last_battery_current || 400, 10),
              parseInt(currentNode.last_solar_current || 1800, 10),
              parseInt(currentNode.last_gsm_signal || -70, 10),
              currentNode.last_gsm_status || 'online',
              parseInt(currentNode.uptime_hours || 0, 10),
            ]
          );

          return {
            ewsId,
            sensorKey: target.prop,
            rawValue: numVal,
            status: newStatus,
            sirenActive,
            stroboActive,
            sensorData: {
              pitchAngle: parseFloat(currentNode.last_pitch || 0),
              rollAngle: parseFloat(currentNode.last_roll || 0),
              soilMoisture: parseFloat(currentNode.last_soil_moisture || 0),
              soilTemperature: parseFloat(currentNode.last_soil_temp || 0),
              rainfallRate: parseFloat(currentNode.last_rainfall_rate || 0),
              rainfallCumulative: parseFloat(currentNode.last_rainfall_cumulative || 0),
              vibrationLevel: parseFloat(currentNode.last_vibration || 0),
              batteryVoltage: parseFloat(currentNode.last_battery_voltage || 12.8),
              solarCurrent: parseInt(currentNode.last_solar_current || 1800, 10),
              gsmSignalDbm: parseInt(currentNode.last_gsm_signal || -70, 10),
              uptimeHours: parseInt(currentNode.uptime_hours || 0, 10),
            },
            timestamp: new Date().toISOString(),
          };
        }
      } catch (err) {
        console.error('Error in processSingleSensor:', err.message);
      }
    }

    return {
      ewsId,
      sensorKey: target.prop,
      rawValue: numVal,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Proses data dari Perangkap Hama (Pest Trap)
   */
  static async processTrapTelemetry(trapId, trapData) {
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    const data = {
      pirTriggerCount: parseInt(trapData.pirTriggerCount || 0, 10),
      photoelectricCount: parseInt(trapData.photoelectricCount || 0, 10),
      containerCapacityPercent: parseInt(trapData.containerCapacityPercent || 0, 10),
      batteryVoltage: parseFloat(trapData.batteryVoltage || 12.6),
      solarChargingCurrent: parseInt(trapData.solarChargingCurrent || 1400, 10),
      uvLedStatus: trapData.uvLedStatus !== undefined ? (trapData.uvLedStatus ? 1 : 0) : 1,
      blowerStatus: trapData.blowerStatus !== undefined ? (trapData.blowerStatus ? 1 : 0) : 1,
      mode: trapData.mode || 'otomatis_malam',
      status: trapData.status || 'aktif',
    };

    if (isDbConnected && pool) {
      try {
        // Simpan log ke pest_trap_logs
        await pool.query(
          `INSERT INTO pest_trap_logs (
            trap_id, pir_trigger_count, photoelectric_count, container_capacity_percent,
            battery_voltage, solar_charging_current, uv_led_status, blower_status, mode, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            trapId,
            data.pirTriggerCount,
            data.photoelectricCount,
            data.containerCapacityPercent,
            data.batteryVoltage,
            data.solarChargingCurrent,
            data.uvLedStatus,
            data.blowerStatus,
            data.mode,
            data.status,
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
            uv_led_status = ?,
            blower_status = ?,
            mode = ?,
            status = ?,
            last_seen_at = NOW()
          WHERE id = ?`,
          [
            data.pirTriggerCount,
            data.photoelectricCount,
            data.containerCapacityPercent,
            data.batteryVoltage,
            data.solarChargingCurrent,
            data.uvLedStatus,
            data.blowerStatus,
            data.mode,
            data.status,
            trapId,
          ]
        );
      } catch (err) {
        console.error('Error saving Trap telemetry to DB:', err.message);
      }
    }

    return {
      trapId,
      ...data,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Catat audit perintah kontrol (Device Command)
   */
  static async recordCommand(deviceId, deviceType, command, payload, issuedBy) {
    const pool = db.getPool();
    const isDbConnected = db.getIsConnected();

    if (isDbConnected && pool) {
      try {
        await pool.query(
          `INSERT INTO device_command_logs (device_id, device_type, command, payload, issued_by, status)
           VALUES (?, ?, ?, ?, ?, 'sent_to_device')`,
          [deviceId, deviceType, command, JSON.stringify(payload || {}), issuedBy || 'web_user']
        );
      } catch (err) {
        console.error('Error logging device command to DB:', err.message);
      }
    }
  }
}

module.exports = TelemetryService;
