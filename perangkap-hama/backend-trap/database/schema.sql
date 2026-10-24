-- =============================================================================
-- SKEMA DATABASE MYSQL: SISTEM PERANGKAP HAMA CERDAS (SMART PEST TRAP)
-- Platform IoT Real-time: ESP32 + WebSocket Server + Web UI
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
  `role` ENUM('superadmin', 'operator', 'public') NOT NULL DEFAULT 'superadmin',
  `assigned_trap_id` VARCHAR(20) NULL,
  `department` VARCHAR(150) NOT NULL,
  `avatar_url` VARCHAR(255) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_username` (`username`),
  INDEX `idx_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 2. TABEL PERANGKAP HAMA (PEST TRAP NODES)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pest_traps` (
  `id` VARCHAR(20) NOT NULL COMMENT 'Contoh: TRAP-01 s/d TRAP-05',
  `name` VARCHAR(100) NOT NULL,
  `location` VARCHAR(255) NOT NULL,
  `uv_led_status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Lampu LED WS2812B / Atraktor',
  `blower_status` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Relay Zapper / Blower',
  `pir_trigger_count` INT NOT NULL DEFAULT 0 COMMENT 'Deteksi Sensor Gerak PIR',
  `photoelectric_count` INT NOT NULL DEFAULT 0 COMMENT 'Hitungan Hama Masuk (Counter)',
  `container_capacity_percent` INT NOT NULL DEFAULT 0 COMMENT 'Kapasitas Wadah Kasa (%)',
  `battery_voltage` DECIMAL(5, 2) NOT NULL DEFAULT 12.60 COMMENT 'Tegangan Baterai / Aki INA226 (V)',
  `solar_charging_current` INT NOT NULL DEFAULT 1400 COMMENT 'Arus Panel / Beban INA226 (mA)',
  `current_distance` INT NOT NULL DEFAULT 0 COMMENT 'Jarak Deteksi VL53L0X (mm)',
  `mode` VARCHAR(30) NOT NULL DEFAULT 'otomatis' COMMENT 'manual, otomatis, otomatis-led',
  `status` ENUM('aktif', 'standby', 'wadah_penuh', 'baterai_lemah', 'offline') NOT NULL DEFAULT 'aktif',
  `active_preset` INT NOT NULL DEFAULT 0 COMMENT 'Indeks Preset Warna LED (0-4)',
  `manual_interval_min` INT NOT NULL DEFAULT 15 COMMENT 'Interval Siklus Mode Manual (menit)',
  `manual_duration_sec` INT NOT NULL DEFAULT 3 COMMENT 'Durasi Nyala Mode Manual (detik)',
  `sensor_cooldown_sec` INT NOT NULL DEFAULT 5 COMMENT 'Jeda Sensor Cooldown Setelah Blower Mati (detik)',
  `blower_mode` VARCHAR(20) NOT NULL DEFAULT 'sensor' COMMENT 'sensor / time',
  `led_running` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1: ganti warna per rotasi, 0: 1 warna statis',
  `led_color` VARCHAR(50) DEFAULT 'UV / Ungu' COMMENT 'Nama/Label Spektrum Warna LED Aktif',
  `start_time` VARCHAR(10) NOT NULL DEFAULT '18:00' COMMENT 'Jam Mulai Operasi Jadwal',
  `end_time` VARCHAR(10) NOT NULL DEFAULT '06:00' COMMENT 'Jam Selesai Operasi Jadwal',
  `led_rotation_interval` INT NOT NULL DEFAULT 15 COMMENT 'Interval Rotasi Preset LED (menit)',
  `presets_json` TEXT NULL COMMENT 'Konfigurasi 5 Preset Warna RGB & Brightness',
  `last_seen_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_trap_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 3. TABEL LOG DATA PERANGKAP HAMA (PEST TRAP LOGS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pest_trap_logs` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `trap_id` VARCHAR(20) NOT NULL,
  `pir_trigger_count` INT NOT NULL,
  `photoelectric_count` INT NOT NULL,
  `container_capacity_percent` INT NOT NULL,
  `battery_voltage` DECIMAL(5, 2) NULL DEFAULT 0.00,
  `solar_charging_current` INT NULL DEFAULT 0,
  `current_distance` INT NOT NULL DEFAULT 0,
  `active_preset` INT NOT NULL DEFAULT 0,
  `uv_led_status` TINYINT(1) NOT NULL,
  `led_color` VARCHAR(50) DEFAULT 'UV / Ungu' COMMENT 'Warna Lampu LED Saat Log Dicatat',
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
-- 4. TABEL AUDIT LOG PERINTAH KONTROL AKTIS (DEVICE COMMAND LOGS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `device_command_logs` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `device_id` VARCHAR(20) NOT NULL COMMENT 'ID TRAP',
  `device_type` ENUM('trap', 'ews') NOT NULL DEFAULT 'trap',
  `command` VARCHAR(100) NOT NULL COMMENT 'SET_MODE, TOGGLE_UV, TOGGLE_BLOWER, SET_PRESET, FAST_TELEMETRY',
  `payload` JSON NULL COMMENT 'Data parameter perintah dalam format JSON',
  `issued_by` VARCHAR(100) NOT NULL DEFAULT 'system',
  `status` ENUM('pending', 'sent_to_device', 'acknowledged_by_device', 'failed') NOT NULL DEFAULT 'sent_to_device',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_cmd_device` (`device_id`, `created_at`),
  INDEX `idx_cmd_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
