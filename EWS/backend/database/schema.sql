-- =============================================================================
-- SKEMA DATABASE MYSQL: SISTEM EWS & PERANGKAP HAMA TERINTEGRASI
-- Platform IoT Real-time: ESP32 + GSM SIMCom A7670C <-> WebSocket Server <-> Web UI
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `ews_iot_db` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `ews_iot_db`;
-- -----------------------------------------------------------------------------
-- 1. TABEL PENGGUNA (USERS & AUTENTIKASI)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(50) NOT NULL,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(100) NOT NULL,
  `role` ENUM('superadmin', 'operator_ews1', 'operator_ews2', 'operator_ews3', 'operator_ews4', 'public') NOT NULL DEFAULT 'public',
  `assigned_ews_id` VARCHAR(20) NULL COMMENT 'Jika operator, terikat ke ID EWS tertentu (misal EWS-01)',
  `department` VARCHAR(150) NOT NULL,
  `avatar_url` VARCHAR(255) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_username` (`username`),
  INDEX `idx_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ----------------------------------------------------------------------------
-- 2. TABEL TITIK EWS (EARLY WARNING SYSTEM NODES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ews_nodes` (
  `id` VARCHAR(20) NOT NULL COMMENT 'Contoh: EWS-01, EWS-02, EWS-03, EWS-04',
  `name` VARCHAR(100) NOT NULL COMMENT 'Nama titik pantau, misal: EWS 01 - Lereng Pasir Madu',
  `location` VARCHAR(255) NOT NULL COMMENT 'Deskripsi wilayah & zonasi rawan longsor',
  `latitude` DECIMAL(10, 7) NOT NULL,
  `longitude` DECIMAL(10, 7) NOT NULL,
  `status` ENUM('aman', 'siaga', 'bahaya', 'offline', 'baterai_lemah', 'gangguan_sensor') NOT NULL DEFAULT 'aman',
  `siren_active` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Status aktuator Sirine 12V 110-120dB',
  `strobo_active` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Status Lampu Strobo Darurat',
  `muted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Status Mute Sirine Lokal oleh Operator',

  -- Parameter Ambang Batas (Thresholds)
  `tilt_warning` DECIMAL(5, 2) NOT NULL DEFAULT 1.50 COMMENT 'Batas Sudut Siaga (derajat)',
  `tilt_danger` DECIMAL(5, 2) NOT NULL DEFAULT 3.00 COMMENT 'Batas Sudut Bahaya (derajat)',
  `rain_warning` DECIMAL(5, 2) NOT NULL DEFAULT 20.00 COMMENT 'Batas Curah Hujan Siaga (mm/jam)',
  `rain_danger` DECIMAL(5, 2) NOT NULL DEFAULT 50.00 COMMENT 'Batas Curah Hujan Bahaya (mm/jam)',
  `soil_moisture_warning` DECIMAL(5, 2) NOT NULL DEFAULT 75.00 COMMENT 'Batas Kelembapan Tanah Siaga (%)',
  `vibration_danger` DECIMAL(5, 2) NOT NULL DEFAULT 0.25 COMMENT 'Batas Getaran ADXL345 Bahaya (g)',
  `battery_low_voltage` DECIMAL(5, 2) NOT NULL DEFAULT 11.80 COMMENT 'Batas Baterai Lemah (V)',

  -- Cache Telemetri Terakhir (untuk respon super cepat saat dashboard dibuka)
  `last_pitch` DECIMAL(6, 2) DEFAULT 0.00,
  `last_roll` DECIMAL(6, 2) DEFAULT 0.00,
  `last_soil_moisture` DECIMAL(5, 2) DEFAULT 0.00,
  `last_soil_temp` DECIMAL(5, 2) DEFAULT 0.00,
  `last_rainfall_rate` DECIMAL(6, 2) DEFAULT 0.00,
  `last_rainfall_cumulative` DECIMAL(7, 2) DEFAULT 0.00,
  `last_vibration` DECIMAL(6, 3) DEFAULT 0.00,
  `last_battery_voltage` DECIMAL(5, 2) DEFAULT 12.80,
  `last_battery_current` INT DEFAULT 400,
  `last_solar_current` INT DEFAULT 1800,
  `last_gsm_signal` INT DEFAULT -70,
  `last_gsm_status` ENUM('online', 'weak', 'offline') DEFAULT 'online',
  `microsd_used_mb` INT DEFAULT 1000,
  `microsd_total_mb` INT DEFAULT 30400,
  `firmware_version` VARCHAR(50) DEFAULT 'v2.4.1-ESP32-A7670C',
  `uptime_hours` INT DEFAULT 0,
  `last_seen_at` TIMESTAMP NULL,

  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 3. TABEL KONFIGURASI TELEGRAM BOT PER TITIK EWS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `telegram_configs` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `ews_id` VARCHAR(20) NOT NULL UNIQUE,
  `bot_token` VARCHAR(255) NOT NULL,
  `chat_id` VARCHAR(100) NOT NULL,
  `channel_name` VARCHAR(150) NOT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `notify_siaga` TINYINT(1) NOT NULL DEFAULT 1,
  `notify_bahaya` TINYINT(1) NOT NULL DEFAULT 1,
  `notify_offline` TINYINT(1) NOT NULL DEFAULT 1,
  `notify_baterai_lemah` TINYINT(1) NOT NULL DEFAULT 1,
  `notify_sensor_gagal` TINYINT(1) NOT NULL DEFAULT 1,
  `notify_normal_kembali` TINYINT(1) NOT NULL DEFAULT 1,
  `daily_report` TINYINT(1) NOT NULL DEFAULT 1,
  `last_test_status` ENUM('success', 'failed') NULL,
  `last_test_time` VARCHAR(100) NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_telegram_ews` FOREIGN KEY (`ews_id`) REFERENCES `ews_nodes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 4. TABEL LOG DATA TELEMETRI SENSOR EWS (TIME SERIES / HISTORI)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ews_sensor_logs` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `ews_id` VARCHAR(20) NOT NULL,
  `pitch_angle` DECIMAL(6, 2) NOT NULL COMMENT 'Inclinometer Kemiringan Sumbu X (derajat)',
  `roll_angle` DECIMAL(6, 2) NOT NULL COMMENT 'Inclinometer Kemiringan Sumbu Y (derajat)',
  `soil_moisture` DECIMAL(5, 2) NOT NULL COMMENT 'Kelembapan Tanah (%)',
  `soil_temperature` DECIMAL(5, 2) NOT NULL COMMENT 'Suhu Tanah (°C)',
  `rainfall_rate` DECIMAL(6, 2) NOT NULL COMMENT 'Curah Hujan Tipping Bucket (mm/jam)',
  `rainfall_cumulative` DECIMAL(7, 2) NOT NULL COMMENT 'Akumulasi Curah Hujan 24 Jam (mm)',
  `vibration_level` DECIMAL(6, 3) NOT NULL COMMENT 'Akselerometer ADXL345 (g)',
  `battery_voltage` DECIMAL(5, 2) NOT NULL COMMENT 'Tegangan Baterai VRLA 12V (V)',
  `battery_current` INT NOT NULL COMMENT 'Arus Konsumsi Sistem (mA)',
  `solar_current` INT NOT NULL COMMENT 'Arus Pengisian Panel Surya 30Wp (mA)',
  `gsm_signal_dbm` INT NOT NULL COMMENT 'Sinyal RSSI SIMCom A7670C (dBm)',
  `gsm_status` ENUM('online', 'weak', 'offline') NOT NULL DEFAULT 'online',
  `microsd_used_mb` INT NOT NULL DEFAULT 0,
  `microsd_total_mb` INT NOT NULL DEFAULT 30400,
  `firmware_version` VARCHAR(50) DEFAULT 'v2.4.1-ESP32-A7670C',
  `uptime_hours` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_sensor_log_ews` FOREIGN KEY (`ews_id`) REFERENCES `ews_nodes` (`id`) ON DELETE CASCADE,
  INDEX `idx_ews_created` (`ews_id`, `created_at`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 5. TABEL PERANGKAP HAMA (PEST TRAP NODES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pest_traps` (
  `id` VARCHAR(20) NOT NULL COMMENT 'Contoh: TRAP-01 s/d TRAP-05',
  `name` VARCHAR(100) NOT NULL,
  `location` VARCHAR(255) NOT NULL,
  `uv_led_status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Lampu LED UV 395-405nm ~5W',
  `blower_status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Blower Sentrifugal 12V 15-25W',
  `pir_trigger_count` INT NOT NULL DEFAULT 0 COMMENT 'Deteksi Sensor Gerak PIR HC-SR501',
  `photoelectric_count` INT NOT NULL DEFAULT 0 COMMENT 'Hitungan Hama Masuk Sensor E3F-DS30C4',
  `container_capacity_percent` INT NOT NULL DEFAULT 0 COMMENT 'Kapasitas Wadah Kasa (%)',
  `battery_voltage` DECIMAL(5, 2) NOT NULL DEFAULT 12.60 COMMENT 'Baterai VRLA 12V 12Ah (V)',
  `solar_charging_current` INT NOT NULL DEFAULT 1400 COMMENT 'Solar Panel 30Wp (mA)',
  `mode` ENUM('otomatis_malam', 'manual', 'hemat_energi') NOT NULL DEFAULT 'otomatis_malam',
  `status` ENUM('aktif', 'standby', 'wadah_penuh', 'baterai_lemah') NOT NULL DEFAULT 'aktif',
  `last_seen_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_trap_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 6. TABEL LOG DATA PERANGKAP HAMA (PEST TRAP LOGS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pest_trap_logs` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `trap_id` VARCHAR(20) NOT NULL,
  `pir_trigger_count` INT NOT NULL,
  `photoelectric_count` INT NOT NULL,
  `container_capacity_percent` INT NOT NULL,
  `battery_voltage` DECIMAL(5, 2) NOT NULL,
  `solar_charging_current` INT NOT NULL,
  `uv_led_status` TINYINT(1) NOT NULL,
  `blower_status` TINYINT(1) NOT NULL,
  `mode` VARCHAR(30) NOT NULL,
  `status` VARCHAR(30) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_log_trap` FOREIGN KEY (`trap_id`) REFERENCES `pest_traps` (`id`) ON DELETE CASCADE,
  INDEX `idx_trap_created` (`trap_id`, `created_at`),
  INDEX `idx_trap_log_time` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 7. TABEL RIWAYAT ALARM & INSIDEN (ALARM LOGS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `alarm_logs` (
  `id` VARCHAR(30) NOT NULL COMMENT 'Format: ALM-2026-XXX',
  `ews_id` VARCHAR(20) NOT NULL,
  `alarm_type` ENUM('siaga', 'bahaya', 'baterai_lemah', 'offline', 'sensor_gagal') NOT NULL,
  `trigger_cause` VARCHAR(255) NOT NULL,
  `trigger_value` VARCHAR(255) NOT NULL,
  `duration_minutes` INT NOT NULL DEFAULT 0,
  `acknowledged` TINYINT(1) NOT NULL DEFAULT 0,
  `acknowledged_by` VARCHAR(100) NULL,
  `acknowledge_note` TEXT NULL,
  `acknowledged_at` TIMESTAMP NULL,
  `resolved_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_alarm_ews` FOREIGN KEY (`ews_id`) REFERENCES `ews_nodes` (`id`) ON DELETE CASCADE,
  INDEX `idx_alarm_ews_created` (`ews_id`, `created_at`),
  INDEX `idx_alarm_ack` (`acknowledged`),
  INDEX `idx_alarm_type` (`alarm_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 8. TABEL AUDIT LOG PERINTAH KONTROL (DEVICE COMMAND LOGS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `device_command_logs` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `device_id` VARCHAR(20) NOT NULL COMMENT 'ID EWS atau ID TRAP',
  `device_type` ENUM('ews', 'trap') NOT NULL,
  `command` VARCHAR(100) NOT NULL COMMENT 'TRIGGER_ALARM, RESET_ALARM, MUTE_SIREN, SET_TRAP_MODE, TOGGLE_UV, TOGGLE_BLOWER',
  `payload` JSON NULL COMMENT 'Data parameter perintah dalam format JSON',
  `issued_by` VARCHAR(100) NOT NULL DEFAULT 'system',
  `status` ENUM('pending', 'sent_to_device', 'acknowledged_by_device', 'failed') NOT NULL DEFAULT 'sent_to_device',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_cmd_device` (`device_id`, `created_at`),
  INDEX `idx_cmd_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- -----------------------------------------------------------------------------
-- 9. TABEL KONFIGURASI MONITORING KUOTA TELKOMSEL PER ALAT EWS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `telkomsel_configs` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `ews_id` VARCHAR(20) NOT NULL UNIQUE,
  `phone_number` VARCHAR(30) NOT NULL,
  `msisdn` VARCHAR(30) NOT NULL,
  `access_token` TEXT NULL,
  `refresh_token` TEXT NULL,
  `id_token` TEXT NULL,
  `token_expires_at` TIMESTAMP NULL,
  `balance` DECIMAL(15,2) DEFAULT 0,
  `balance_unit` VARCHAR(20) DEFAULT 'IDR',
  `expired_date` VARCHAR(100) NULL COMMENT 'Masa aktif kartu',
  `subscription_type` VARCHAR(50) DEFAULT 'PraBayar',
  `quota_data` JSON NULL COMMENT 'Data breakdown kuota internet',
  `last_synced_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_telkomsel_ews` FOREIGN KEY (`ews_id`) REFERENCES `ews_nodes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
