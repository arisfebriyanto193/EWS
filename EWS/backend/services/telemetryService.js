const db = require('../database/db');
const TelegramService = require('./telegramService');
const { get5MinuteSlot, formatWib } = require('../utils/dateUtils');

/**
 * Service untuk memproses telemetri sensor, pengecekan threshold,
 * pencatatan ke database, dan pemicuan alarm otomatis.
 */
class TelemetryService {
  // Cache slot 5-menit terakhir yang sudah dicatat ke database per ewsId
  static lastRecordedSlot = new Map();
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
      batteryVoltage: (sensorData.batteryVoltage !== undefined && sensorData.batteryVoltage !== null && !isNaN(Number(sensorData.batteryVoltage)))
        ? Number(sensorData.batteryVoltage)
        : (sensorData.batt !== undefined && sensorData.batt !== null && !isNaN(Number(sensorData.batt)) ? Number(sensorData.batt) : 0),
      batteryCurrent: (sensorData.batteryCurrent !== undefined && sensorData.batteryCurrent !== null && !isNaN(Number(sensorData.batteryCurrent)))
        ? parseInt(sensorData.batteryCurrent, 10)
        : 0,
      solarCurrent: (sensorData.solarCurrent !== undefined && sensorData.solarCurrent !== null && !isNaN(Number(sensorData.solarCurrent)))
        ? parseInt(sensorData.solarCurrent, 10)
        : 0,
      gsmSignalDbm: parseInt(sensorData.gsmSignalDbm || -70, 10),
      gsmStatus: sensorData.gsmStatus || 'online',
      ipAddress: sensorData.ipAddress || sensorData.ip || null,
      wifiSsid: sensorData.wifiSsid || sensorData.ssid || null,
      wifiRssi: sensorData.wifiRssi !== undefined ? parseInt(sensorData.wifiRssi, 10) : (sensorData.gsmSignalDbm ? parseInt(sensorData.gsmSignalDbm, 10) : -65),
      alarmDuration: sensorData.alarmDuration ? parseInt(sensorData.alarmDuration, 10) : undefined,
      alarmPause: sensorData.alarmPause ? parseInt(sensorData.alarmPause, 10) : undefined,
      publishMode: sensorData.publishMode || (sensorData.isClientActive ? 'realtime' : 'low_power_5m'),
      microsdUsedMb: parseInt(sensorData.microsdUsedMb || 1000, 10),
      microsdTotalMb: parseInt(sensorData.microsdTotalMb || 30400, 10),
      firmwareVersion: sensorData.firmwareVersion || 'v2.4.1-ESP32-A7670C',
      uptimeHours: parseInt(sensorData.uptimeHours || 1, 10),
    };

    let thresholds = {
      safeTiltPitch: 0.0,
      safeTiltRoll: 0.0,
      tiltTolerance: 2.0,
      tiltWarning: 5.0,
      tiltDanger: 10.0,
      rainWarning: 20.0,
      rainDanger: 50.0,
      rainCalibPerTip: 0.70,
      safeSoilMoisture: 50.0,
      soilMoistureTolerance: 15.0,
      soilMoistureWarning: 75.0,
      soilAdcDry: 3300,
      soilAdcWet: 1200,
      vibrationDanger: 0.25,
      batteryLowVoltage: 11.8,
      alarmDuration: 60,
      alarmPause: 30,
    };

    let currentNode = null;

    if (isDbConnected && pool) {
      try {
        const [nodes] = await pool.query('SELECT * FROM ews_nodes WHERE id = ?', [ewsId]);
        if (nodes.length > 0) {
          currentNode = nodes[0];
          thresholds = {
            safeTiltPitch: parseFloat(currentNode.safe_pitch ?? 0.0),
            safeTiltRoll: parseFloat(currentNode.safe_roll ?? 0.0),
            tiltTolerance: parseFloat(currentNode.tilt_tolerance ?? 2.0),
            tiltWarning: parseFloat(currentNode.tilt_warning ?? 5.0),
            tiltDanger: parseFloat(currentNode.tilt_danger ?? 10.0),
            rainWarning: parseFloat(currentNode.rain_warning ?? 20.0),
            rainDanger: parseFloat(currentNode.rain_danger ?? 50.0),
            rainCalibPerTip: parseFloat(currentNode.rain_calib_per_tip ?? 0.70),
            safeSoilMoisture: parseFloat(currentNode.safe_soil_moisture ?? 50.0),
            soilMoistureTolerance: parseFloat(currentNode.soil_moisture_tolerance ?? 15.0),
            soilMoistureWarning: parseFloat(currentNode.soil_moisture_warning ?? 75.0),
            soilAdcDry: parseInt(currentNode.soil_adc_dry ?? 3300, 10),
            soilAdcWet: parseInt(currentNode.soil_adc_wet ?? 1200, 10),
            vibrationDanger: parseFloat(currentNode.vibration_danger ?? 0.25),
            batteryLowVoltage: parseFloat(currentNode.battery_low_voltage ?? 11.8),
            alarmDuration: parseInt(currentNode.alarm_duration ?? 60, 10),
            alarmPause: parseInt(currentNode.alarm_pause ?? 30, 10),
          };
        }
      } catch (err) {
        console.error('Error fetching threshold from DB:', err.message);
      }
    }

    // Jika ESP32 mengirimkan konfigurasi ambang batas / titik aman lokalnya
    if (sensorData.thresholds && typeof sensorData.thresholds === 'object') {
      const incomingT = sensorData.thresholds;
      if (incomingT.safeTiltPitch !== undefined || incomingT.safePitch !== undefined)
        thresholds.safeTiltPitch = parseFloat(incomingT.safeTiltPitch ?? incomingT.safePitch);
      if (incomingT.safeTiltRoll !== undefined || incomingT.safeRoll !== undefined)
        thresholds.safeTiltRoll = parseFloat(incomingT.safeTiltRoll ?? incomingT.safeRoll);
      if (incomingT.tiltTolerance !== undefined || incomingT.tiltTol !== undefined)
        thresholds.tiltTolerance = parseFloat(incomingT.tiltTolerance ?? incomingT.tiltTol);
      if (incomingT.tiltWarning !== undefined || incomingT.tiltWarn !== undefined)
        thresholds.tiltWarning = parseFloat(incomingT.tiltWarning ?? incomingT.tiltWarn);
      if (incomingT.tiltDanger !== undefined || incomingT.tiltDang !== undefined)
        thresholds.tiltDanger = parseFloat(incomingT.tiltDanger ?? incomingT.tiltDang);
      if (incomingT.rainWarning !== undefined || incomingT.rainWarn !== undefined)
        thresholds.rainWarning = parseFloat(incomingT.rainWarning ?? incomingT.rainWarn);
      if (incomingT.rainDanger !== undefined || incomingT.rainDang !== undefined)
        thresholds.rainDanger = parseFloat(incomingT.rainDanger ?? incomingT.rainDang);
      if (incomingT.rainCalibPerTip !== undefined || incomingT.rainCalib !== undefined)
        thresholds.rainCalibPerTip = parseFloat(incomingT.rainCalibPerTip ?? incomingT.rainCalib);
      if (incomingT.safeSoilMoisture !== undefined || incomingT.safeSoil !== undefined)
        thresholds.safeSoilMoisture = parseFloat(incomingT.safeSoilMoisture ?? incomingT.safeSoil);
      if (incomingT.soilMoistureTolerance !== undefined || incomingT.soilTol !== undefined)
        thresholds.soilMoistureTolerance = parseFloat(incomingT.soilMoistureTolerance ?? incomingT.soilTol);
      if (incomingT.soilMoistureWarning !== undefined || incomingT.soilWarn !== undefined)
        thresholds.soilMoistureWarning = parseFloat(incomingT.soilMoistureWarning ?? incomingT.soilWarn);
      if (incomingT.soilAdcDry !== undefined)
        thresholds.soilAdcDry = parseInt(incomingT.soilAdcDry, 10);
      if (incomingT.soilAdcWet !== undefined)
        thresholds.soilAdcWet = parseInt(incomingT.soilAdcWet, 10);
      if (incomingT.vibrationDanger !== undefined || incomingT.vibDang !== undefined)
        thresholds.vibrationDanger = parseFloat(incomingT.vibrationDanger ?? incomingT.vibDang);
      if (incomingT.batteryLowVoltage !== undefined || incomingT.battLow !== undefined)
        thresholds.batteryLowVoltage = parseFloat(incomingT.batteryLowVoltage ?? incomingT.battLow);
      if (incomingT.alarmDuration !== undefined || incomingT.alarmDur !== undefined)
        thresholds.alarmDuration = parseInt(incomingT.alarmDuration ?? incomingT.alarmDur, 10);
      if (incomingT.alarmPause !== undefined || incomingT.alarmPau !== undefined)
        thresholds.alarmPause = parseInt(incomingT.alarmPause ?? incomingT.alarmPau, 10);

      // Sinkronkan ke database ews_nodes secara asinkron
      if (isDbConnected && pool) {
        pool.query(
          `UPDATE ews_nodes SET
            safe_pitch = ?, safe_roll = ?, tilt_tolerance = ?, tilt_warning = ?, tilt_danger = ?,
            rain_warning = ?, rain_danger = ?, rain_calib_per_tip = ?,
            safe_soil_moisture = ?, soil_moisture_tolerance = ?, soil_moisture_warning = ?,
            soil_adc_dry = ?, soil_adc_wet = ?, vibration_danger = ?, battery_low_voltage = ?,
            alarm_duration = ?, alarm_pause = ?
           WHERE id = ?`,
          [
            thresholds.safeTiltPitch, thresholds.safeTiltRoll, thresholds.tiltTolerance, thresholds.tiltWarning, thresholds.tiltDanger,
            thresholds.rainWarning, thresholds.rainDanger, thresholds.rainCalibPerTip,
            thresholds.safeSoilMoisture, thresholds.soilMoistureTolerance, thresholds.soilMoistureWarning,
            thresholds.soilAdcDry, thresholds.soilAdcWet, thresholds.vibrationDanger, thresholds.batteryLowVoltage,
            thresholds.alarmDuration, thresholds.alarmPause,
            ewsId
          ]
        ).catch((err) => console.error('Error syncing ESP32 thresholds to ews_nodes:', err.message));
      }
    }

    // Evaluasi Status Berdasarkan Batas Ambang (Thresholds) & Titik Acuan Aman
    let newStatus = 'aman';
    let sirenActive = false;
    let stroboActive = false;
    let alarmTriggered = false;
    let triggerCause = sensorData.alarmReason || 'Semua parameter sensor dalam batas aman';
    let triggerValue = 'Normal';

    const safePitch = parseFloat(thresholds.safeTiltPitch ?? 0.0);
    const safeRoll = parseFloat(thresholds.safeTiltRoll ?? 0.0);
    const pitchDev = Math.abs(data.pitchAngle - safePitch);
    const rollDev = Math.abs(data.rollAngle - safeRoll);

    if (
      pitchDev >= thresholds.tiltDanger ||
      rollDev >= thresholds.tiltDanger ||
      data.rainfallRate >= thresholds.rainDanger ||
      data.vibrationLevel >= (thresholds.vibrationDanger * 2.0)
    ) {
      newStatus = 'bahaya';
      sirenActive = true;
      stroboActive = true;
      alarmTriggered = true;
      triggerCause = sensorData.alarmReason || 'Kemiringan Tanah Ekstrem / Curah Hujan Bahaya / Getaran Gempa';
      triggerValue = `Pitch: ${data.pitchAngle}°, Roll: ${data.rollAngle}°, Hujan: ${data.rainfallRate}mm/h, Getaran: ${data.vibrationLevel}g`;
    } else if (
      pitchDev >= thresholds.tiltWarning ||
      rollDev >= thresholds.tiltWarning ||
      data.rainfallRate >= thresholds.rainWarning ||
      data.soilMoisture >= thresholds.soilMoistureWarning ||
      data.vibrationLevel >= thresholds.vibrationDanger
    ) {
      newStatus = 'siaga';
      sirenActive = false;
      stroboActive = false;
      alarmTriggered = true;
      triggerCause = sensorData.alarmReason || 'Kemiringan / Curah Hujan / Getaran Melebihi Batas Siaga [Relay Lapangan OFF]';
      triggerValue = `Pitch: ${data.pitchAngle}°, Hujan: ${data.rainfallRate}mm/h, Kelembapan: ${data.soilMoisture}%, Getaran: ${data.vibrationLevel}g`;
    } else if (data.batteryVoltage <= 0.5) {
      // Sensor arus/tegangan INA atau pembagi resistor tidak terbaca / 0V: BUKAN tanda bahaya bencana!
      // Relay sirine & strobo WAJIB OFF, hanya warning visual di web dashboard!
      newStatus = 'baterai_lemah';
      sirenActive = false;
      stroboActive = false;
      alarmTriggered = false;
      triggerCause = sensorData.alarmReason || 'Tegangan Baterai / Sensor Daya Tidak Terdeteksi (0.00V) [Warning Web Saja, Relay OFF]';
      triggerValue = `${data.batteryVoltage} V`;
    } else if (data.batteryVoltage < thresholds.batteryLowVoltage) {
      newStatus = 'baterai_lemah';
      sirenActive = false;
      stroboActive = false;
      alarmTriggered = false; // BUKAN alarm bencana alam, relay tetap OFF
      triggerCause = sensorData.alarmReason || `Tegangan Baterai Lemah (${data.batteryVoltage}V < ${thresholds.batteryLowVoltage}V) [Warning Web Saja, Relay OFF]`;
      triggerValue = `${data.batteryVoltage} V`;
    }

    // Jika ESP32 telah menyertakan status dan alasan spesifik dari firmware
    if (sensorData.status && ['aman', 'siaga', 'bahaya', 'baterai_lemah'].includes(sensorData.status)) {
      newStatus = sensorData.status;
      if (newStatus === 'bahaya') {
        sirenActive = true;
        stroboActive = true;
        alarmTriggered = true;
      } else if (newStatus === 'siaga') {
        // Status siaga: Relay Lapangan dipastikan MATI (OFF), hanya peringatan web & telegram
        sirenActive = false;
        stroboActive = false;
        alarmTriggered = true;
      } else {
        // 'aman' atau 'baterai_lemah': sirine dan strobo dipastikan MATI
        sirenActive = false;
        stroboActive = false;
        alarmTriggered = false;
      }
      if (sensorData.alarmReason) {
        triggerCause = sensorData.alarmReason;
      }
    }

    // 1. Simpan Log Sensor ke ews_sensor_logs (HANYA 5 MENIT SEKALI: misal 01.00, 01.05, 01.10, dst)
    if (isDbConnected && pool) {
      try {
        const slot = get5MinuteSlot(new Date());
        let lastSlot = TelemetryService.lastRecordedSlot.get(ewsId);

        // Jika memory cache masih kosong (misal setelah server restart), cek DB agar tidak duplikat slot yang sama
        if (lastSlot === undefined) {
          try {
            const [recent] = await pool.query(
              'SELECT created_at FROM ews_sensor_logs WHERE ews_id = ? ORDER BY created_at DESC LIMIT 1',
              [ewsId]
            );
            if (recent.length > 0) {
              lastSlot = Math.floor(new Date(recent[0].created_at).getTime() / (5 * 60 * 1000));
              TelemetryService.lastRecordedSlot.set(ewsId, lastSlot);
            }
          } catch (slotCheckErr) {
            // Abaikan jika query check gagal
          }
        }

        if (lastSlot !== slot.slotIndex) {
          TelemetryService.lastRecordedSlot.set(ewsId, slot.slotIndex);
          await pool.query(
            `INSERT INTO ews_sensor_logs (
              ews_id, pitch_angle, roll_angle, soil_moisture, soil_temperature,
              rainfall_rate, rainfall_cumulative, vibration_level, battery_voltage,
              battery_current, solar_current, gsm_signal_dbm, gsm_status,
              microsd_used_mb, microsd_total_mb, firmware_version, uptime_hours,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
              slot.slotDate, // Tanggal presisi pada interval 5 menit (01.00, 01.05, dst)
            ]
          );
          console.log(`📝 [Log EWS 5-Menit] Data telemetri ${ewsId} dicatat pada ${slot.formattedWib}`);
        }

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
            ip_address = COALESCE(?, ip_address),
            wifi_ssid = COALESCE(?, wifi_ssid),
            wifi_rssi = COALESCE(?, wifi_rssi),
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
            data.ipAddress,
            data.wifiSsid,
            data.wifiRssi,
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

            // Dispatch Telegram Alert Otomatis jika dikonfigurasi
            try {
              const [teleRows] = await pool.query('SELECT * FROM telegram_configs WHERE ews_id = ?', [ewsId]);
              if (teleRows.length > 0 && teleRows[0].enabled) {
                TelegramService.sendAlarmAlert(
                  teleRows[0],
                  currentNode || { id: ewsId, name: ewsId },
                  newStatus,
                  triggerCause,
                  triggerValue
                ).catch((err) => console.error('Telegram alert dispatch error:', err.message));
              }
            } catch (teleErr) {
              console.error('Error fetching telegram config for alarm:', teleErr.message);
            }
          }
        } else if (newStatus === 'baterai_lemah') {
          // Dispatch notifikasi pemeliharaan baterai/INA ke Telegram (jika diaktifkan) maksimal 1x per 30 menit
          try {
            const [recentBattAlert] = await pool.query(
              `SELECT id FROM alarm_logs 
               WHERE ews_id = ? AND alarm_type = 'baterai_lemah' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
               LIMIT 1`,
              [ewsId]
            );

            if (recentBattAlert.length === 0) {
              const alarmId = `BAT-${Date.now().toString().slice(-6)}`;
              await pool.query(
                `INSERT INTO alarm_logs (
                  id, ews_id, alarm_type, trigger_cause, trigger_value, duration_minutes, acknowledged
                ) VALUES (?, ?, 'baterai_lemah', ?, ?, 0, 0)`,
                [alarmId, ewsId, triggerCause, triggerValue]
              );

              const [teleRows] = await pool.query('SELECT * FROM telegram_configs WHERE ews_id = ?', [ewsId]);
              if (teleRows.length > 0 && teleRows[0].enabled) {
                TelegramService.sendAlarmAlert(
                  teleRows[0],
                  currentNode || { id: ewsId, name: ewsId },
                  'baterai_lemah',
                  triggerCause,
                  triggerValue
                ).catch((err) => console.error('Telegram battery alert dispatch error:', err.message));
              }
            }
          } catch (teleErr) {
            console.error('Error dispatching telegram battery alert:', teleErr.message);
          }
        }

        // 4. Deteksi Pemulihan (Recovery) jika node sebelumnya berstatus OFFLINE
        if (currentNode && currentNode.status === 'offline') {
          console.log(`✅ [Watchdog] Node ${ewsId} (${currentNode.name || ewsId}) KEMBALI ONLINE dari status OFFLINE!`);
          try {
            const [teleRows] = await pool.query('SELECT * FROM telegram_configs WHERE ews_id = ?', [ewsId]);
            if (
              teleRows.length > 0 &&
              teleRows[0].enabled &&
              (teleRows[0].notify_normal_kembali || teleRows[0].notifyNormalKembali)
            ) {
              TelegramService.sendOnlineRecoveryAlert(teleRows[0], currentNode || { id: ewsId, name: ewsId }).catch(
                (err) => console.error('Telegram recovery dispatch error:', err.message)
              );
            }
          } catch (teleErr) {
            console.error('Error fetching telegram config for recovery:', teleErr.message);
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
      alarmReason: triggerCause,
      sensorData: {
        ...data,
        alarmReason: triggerCause,
        inaAvailable: sensorData.inaAvailable !== undefined ? Boolean(sensorData.inaAvailable) : (data.batteryVoltage > 0.5),
      },
      thresholds,
      timestamp: new Date().toISOString(),
      timestampWib: formatWib(new Date(), true),
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
      ip: { col: 'ip_address', prop: 'ipAddress', isString: true },
      wifi_ssid: { col: 'wifi_ssid', prop: 'wifiSsid', isString: true },
      wifi_rssi: { col: 'wifi_rssi', prop: 'wifiRssi' },
      uptime: { col: 'uptime_hours', prop: 'uptimeHours' },
    };

    const target = keyMap[sensorKey.toLowerCase()];
    if (!target) {
      console.warn(`[Telemetry] Sensor key '${sensorKey}' tidak dikenali`);
      return null;
    }

    const valToSave = target.isString
      ? (typeof rawValue === 'object' && rawValue !== null && 'value' in rawValue ? String(rawValue.value) : String(rawValue))
      : numVal;

    let currentNode = null;
    if (isDbConnected && pool) {
      try {
        const [rows] = await pool.query('SELECT * FROM ews_nodes WHERE id = ?', [ewsId]);
        if (rows.length > 0) {
          currentNode = rows[0];

          await pool.query(
            `UPDATE ews_nodes SET ${target.col} = ?, last_seen_at = NOW() WHERE id = ?`,
            [valToSave, ewsId]
          );

          currentNode[target.col] = valToSave;

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
          const rawBatt = currentNode.last_battery_voltage;
          const batt = (rawBatt !== null && rawBatt !== undefined && rawBatt !== '' && !isNaN(Number(rawBatt)))
            ? Number(rawBatt)
            : 12.8;

          let newStatus = 'aman';
          let sirenActive = false;
          let stroboActive = false;
          let triggerCause = 'Semua parameter sensor dalam batas aman';

          if (pitch >= tiltDanger || roll >= tiltDanger || rain >= rainDanger || vib >= (vibrationDanger * 2.0)) {
            newStatus = 'bahaya';
            sirenActive = true;
            stroboActive = true;
            triggerCause = currentNode.alarm_reason || `Pemicu ${sensorKey} (${numVal}) melebihi ambang batas BAHAYA`;
          } else if (pitch >= tiltWarning || roll >= tiltWarning || rain >= rainWarning || soilM >= soilMoistureWarning || vib >= vibrationDanger) {
            newStatus = 'siaga';
            sirenActive = false;
            stroboActive = false;
            triggerCause = currentNode.alarm_reason || `Pemicu ${sensorKey} (${numVal}) melebihi ambang batas SIAGA [Relay Lapangan OFF]`;
          } else if (batt <= 0.5) {
            // Sensor arus/tegangan INA tidak terbaca / 0V: BUKAN bahaya bencana, relay wajib OFF
            newStatus = 'baterai_lemah';
            sirenActive = false;
            stroboActive = false;
            triggerCause = 'Tegangan Baterai / Sensor Daya 0.00V [Warning Web Saja, Relay OFF]';
          } else if (batt < batteryLow) {
            newStatus = 'baterai_lemah';
            sirenActive = false;
            stroboActive = false;
            triggerCause = `Tegangan Baterai Lemah (${batt.toFixed(2)}V < ${batteryLow}V) [Warning Web Saja, Relay OFF]`;
          } else {
            newStatus = 'aman';
            sirenActive = false;
            stroboActive = false;
          }

          if (
            newStatus !== currentNode.status ||
            sirenActive !== Boolean(currentNode.siren_active) ||
            stroboActive !== Boolean(currentNode.strobo_active)
          ) {
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
                    triggerCause,
                    `${sensorKey}: ${numVal}`,
                  ]
                );
                console.log(`🚨 [ALARM BARU] ${alarmId} pada ${ewsId} via topik ${sensorKey}`);
              }
            }
          }

          // Simpan log snapshot hanya jika slot 5-menit belum tercatat
          const singleSlot = get5MinuteSlot(new Date());
          const lastSingleSlot = TelemetryService.lastRecordedSlot.get(ewsId);
          if (lastSingleSlot !== singleSlot.slotIndex) {
            TelemetryService.lastRecordedSlot.set(ewsId, singleSlot.slotIndex);
            await pool.query(
              `INSERT INTO ews_sensor_logs (
                ews_id, pitch_angle, roll_angle, soil_moisture, soil_temperature,
                rainfall_rate, rainfall_cumulative, vibration_level, battery_voltage,
                battery_current, solar_current, gsm_signal_dbm, gsm_status, uptime_hours,
                created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                ewsId,
                parseFloat(currentNode.last_pitch || 0),
                parseFloat(currentNode.last_roll || 0),
                parseFloat(currentNode.last_soil_moisture || 0),
                parseFloat(currentNode.last_soil_temp || 0),
                parseFloat(currentNode.last_rainfall_rate || 0),
                parseFloat(currentNode.last_rainfall_cumulative || 0),
                parseFloat(currentNode.last_vibration || 0),
                batt,
                parseInt(currentNode.last_battery_current || 0, 10),
                parseInt(currentNode.last_solar_current || 0, 10),
                parseInt(currentNode.last_gsm_signal || -70, 10),
                currentNode.last_gsm_status || 'online',
                parseInt(currentNode.uptime_hours || 0, 10),
                singleSlot.slotDate,
              ]
            );
          }

          return {
            ewsId,
            sensorKey: target.prop,
            rawValue: numVal,
            status: newStatus,
            alarmReason: triggerCause,
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
              batteryVoltage: batt,
              batteryCurrent: parseInt(currentNode.last_battery_current || 0, 10),
              solarCurrent: parseInt(currentNode.last_solar_current || 0, 10),
              gsmSignalDbm: parseInt(currentNode.last_gsm_signal || -70, 10),
              uptimeHours: parseInt(currentNode.uptime_hours || 0, 10),
              alarmReason: triggerCause,
              inaAvailable: batt > 0.5,
            },
            timestamp: new Date().toISOString(),
            timestampWib: formatWib(new Date(), true),
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
      timestampWib: formatWib(new Date(), true),
    };
  }

  /**
   * Proses data dari Perangkap Hama (Pest Trap)
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
      distThresholdMm: trapData.distThresholdMm !== undefined ? parseInt(trapData.distThresholdMm, 10) : (trapData.dist_threshold_mm !== undefined ? parseInt(trapData.dist_threshold_mm, 10) : (trapData.distThreshold_mm !== undefined ? parseInt(trapData.distThreshold_mm, 10) : undefined)),
      distMinMm: trapData.distMinMm !== undefined ? parseInt(trapData.distMinMm, 10) : (trapData.dist_min_mm !== undefined ? parseInt(trapData.dist_min_mm, 10) : (trapData.distMin_mm !== undefined ? parseInt(trapData.distMin_mm, 10) : undefined)),
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

        // Pastikan node trap terdaftar di pest_traps sebelum insert log (cegah FK error)
        const [existing] = await pool.query('SELECT id FROM pest_traps WHERE id = ?', [trapId]);
        if (existing.length === 0) {
          await pool.query(
            `INSERT INTO pest_traps (
              id, name, location, uv_led_status, blower_status,
              pir_trigger_count, photoelectric_count, container_capacity_percent,
              battery_voltage, solar_charging_current, current_distance, dist_threshold_mm, dist_min_mm,
              mode, status, active_preset, manual_interval_min, manual_duration_sec, sensor_cooldown_sec, led_color,
              start_time, end_time, led_rotation_interval, presets_json, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              trapId,
              `Perangkap Hama ${trapId}`,
              'Lokasi Terpasang',
              data.uvLedStatus,
              data.blowerStatus,
              data.pirTriggerCount,
              data.photoelectricCount,
              data.containerCapacityPercent,
              data.batteryVoltage,
              data.solarChargingCurrent,
              data.currentDistance,
              data.distThresholdMm !== undefined ? data.distThresholdMm : 150,
              data.distMinMm !== undefined ? data.distMinMm : 10,
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

        // Simpan log ke pest_trap_logs (termasuk status led dan warna led saat log dicatat)
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
            dist_threshold_mm = COALESCE(?, dist_threshold_mm),
            dist_min_mm = COALESCE(?, dist_min_mm),
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
            data.distThresholdMm !== undefined ? data.distThresholdMm : null,
            data.distMinMm !== undefined ? data.distMinMm : null,
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
