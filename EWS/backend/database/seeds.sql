-- =============================================================================
-- DATA AWAL (SEEDS): SISTEM EWS & PERANGKAP HAMA TERINTEGRASI
-- Kredensial default semua pengguna: ews123
-- =============================================================================

USE `ews_iot_db`;

-- -----------------------------------------------------------------------------
-- 1. SEED PENGGUNA (USERS)
-- Password hash: $2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS (ews123)
-- -----------------------------------------------------------------------------
INSERT INTO `users` (`id`, `username`, `password_hash`, `full_name`, `role`, `assigned_ews_id`, `department`, `avatar_url`, `is_active`)
VALUES
  ('user-01', 'admin_bpbd', '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS', 'Ir. Hendra Wijaya, M.T.', 'superadmin', NULL, 'Pusdalops BPBD & Tim Gabungan Mitigasi', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80', 1),
  ('user-02', 'operator_ews1', '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS', 'Budi Santoso (Pos Pantau 1)', 'operator_ews1', 'EWS-01', 'Pos Pantau Sektor Utara - Lereng Pasir Madu', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80', 1),
  ('user-03', 'operator_ews2', '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS', 'Rian Pratama (Pos Pantau 2)', 'operator_ews2', 'EWS-02', 'Pos Pantau Sektor Barat - Tebing Cikadu', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80', 1),
  ('user-04', 'operator_ews3', '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS', 'Ahmad Fauzi (Pos Pantau 3)', 'operator_ews3', 'EWS-03', 'Pos Pantau Sektor Timur - Jalur Aliran Talaga', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80', 1),
  ('user-05', 'operator_ews4', '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS', 'Agus Setiawan (Pos Pantau 4)', 'operator_ews4', 'EWS-04', 'Pos Pantau Sektor Selatan - Pemukiman Warga', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80', 1),
  ('user-06', 'warga_publik', '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS', 'Akses Portal Terbuka Komunitas', 'public', NULL, 'Warga Masyarakat & Relawan Desa', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80', 1)
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`);

-- -----------------------------------------------------------------------------
-- 2. SEED TITIK EWS (EWS NODES)
-- -----------------------------------------------------------------------------
INSERT INTO `ews_nodes` (
  `id`, `name`, `location`, `latitude`, `longitude`, `status`, `siren_active`, `strobo_active`, `muted`,
  `tilt_warning`, `tilt_danger`, `rain_warning`, `rain_danger`, `soil_moisture_warning`, `vibration_danger`, `battery_low_voltage`,
  `last_pitch`, `last_roll`, `last_soil_moisture`, `last_soil_temp`, `last_rainfall_rate`, `last_rainfall_cumulative`,
  `last_vibration`, `last_battery_voltage`, `last_battery_current`, `last_solar_current`, `last_gsm_signal`, `last_gsm_status`,
  `microsd_used_mb`, `microsd_total_mb`, `firmware_version`, `uptime_hours`, `last_seen_at`
) VALUES
  ('EWS-01', 'EWS 01 - Lereng Pasir Madu', 'Sektor Lereng Utara (KM 14.2) - Lereng Atas Rawan Longsor', -6.8924000, 107.6183000, 'aman', 0, 0, 0,
   1.50, 3.00, 20.00, 50.00, 75.00, 0.25, 11.80,
   0.14, -0.08, 42.50, 24.80, 0.00, 18.40,
   0.020, 12.80, 410, 1820, -68, 'online',
   1420, 30400, 'v2.4.1-ESP32-A7670C', 342, NOW()),

  ('EWS-02', 'EWS 02 - Tebing Cikadu', 'Sektor Barat Tebing Cikadu - Lereng Curam Batuan Vulkanik', -6.8978000, 107.6145000, 'siaga', 0, 1, 0,
   1.50, 3.00, 20.00, 50.00, 75.00, 0.25, 11.80,
   1.82, 0.94, 78.20, 23.20, 26.40, 64.00,
   0.080, 12.40, 520, 640, -74, 'online',
   2180, 30400, 'v2.4.1-ESP32-A7670C', 512, NOW()),

  ('EWS-03', 'EWS 03 - Jalur Aliran Talaga', 'Sektor Lembah Aliran Air Talaga - Rawan Debris & Banjir Bandang', -6.9031000, 107.6210000, 'aman', 0, 0, 0,
   1.50, 3.00, 20.00, 50.00, 75.00, 0.25, 11.80,
   0.28, 0.12, 58.00, 24.10, 2.20, 22.00,
   0.030, 12.90, 390, 1950, -64, 'online',
   950, 30400, 'v2.4.1-ESP32-A7670C', 198, NOW()),

  ('EWS-04', 'EWS 04 - Akses Pemukiman Sukamulya', 'Sektor Selatan Jalan Utama & Pemukiman - Kaki Lereng', -6.9085000, 107.6242000, 'aman', 0, 0, 0,
   1.50, 3.00, 20.00, 50.00, 75.00, 0.25, 11.80,
   0.05, -0.04, 48.00, 25.40, 0.00, 14.20,
   0.010, 12.70, 400, 1780, -62, 'online',
   1120, 30400, 'v2.4.1-ESP32-A7670C', 620, NOW())
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- -----------------------------------------------------------------------------
-- 3. SEED TELEGRAM CONFIGS
-- -----------------------------------------------------------------------------
INSERT INTO `telegram_configs` (
  `ews_id`, `bot_token`, `chat_id`, `channel_name`, `enabled`,
  `notify_siaga`, `notify_bahaya`, `notify_offline`, `notify_baterai_lemah`, `notify_sensor_gagal`, `notify_normal_kembali`, `daily_report`,
  `last_test_status`, `last_test_time`
) VALUES
  ('EWS-01', '6892348121:AAHq_7xL98Kz2w_PasirMaduBot', '-1001928374650', 'Grup Relawan & Warga Lereng Pasir Madu', 1, 1, 1, 1, 1, 1, 1, 1, 'success', 'Hari ini 07:00 WIB'),
  ('EWS-02', '7109283419:BBKk_8wN42Pt9m_TebingCikaduBot', '-1002847591023', 'Komando Lapangan Tebing Cikadu', 1, 1, 1, 1, 1, 1, 1, 0, 'success', 'Kemarin 16:30 WIB'),
  ('EWS-03', '7482910321:CCDd_1uM84Xq3z_TalagaStreamBot', '-1003928174567', 'Grup Pantau Debris & Banjir Talaga', 1, 1, 1, 1, 1, 1, 1, 1, 'success', '2 hari lalu'),
  ('EWS-04', '7920192834:EEFf_5kP67Za1s_SukamulyaAlertBot', '-1004829104821', 'Warga Siaga Bencana Sukamulya', 1, 1, 1, 1, 1, 1, 1, 1, 'success', 'Kemarin 08:15 WIB')
ON DUPLICATE KEY UPDATE `channel_name` = VALUES(`channel_name`);

-- -----------------------------------------------------------------------------
-- 4. SEED PERANGKAP HAMA (PEST TRAPS)
-- -----------------------------------------------------------------------------
INSERT INTO `pest_traps` (
  `id`, `name`, `location`, `uv_led_status`, `blower_status`,
  `pir_trigger_count`, `photoelectric_count`, `container_capacity_percent`,
  `battery_voltage`, `solar_charging_current`, `mode`, `status`, `last_seen_at`
) VALUES
  ('TRAP-01', 'Perangkap Hama 01 - Kebun Kopi Lereng Atas', 'Area Perkebunan Warga Blok A (Elevasi 1,120 mdpl)', 1, 1, 142, 388, 62, 12.60, 1420, 'otomatis_malam', 'aktif', NOW()),
  ('TRAP-02', 'Perangkap Hama 02 - Kebun Sayur Holtikultura', 'Lahan Cabai & Kubis Blok B (Elevasi 1,050 mdpl)', 1, 0, 88, 245, 45, 12.70, 1540, 'otomatis_malam', 'aktif', NOW()),
  ('TRAP-03', 'Perangkap Hama 03 - Pematang Padi Sawah Terasering', 'Sawah Blok C Pasir Cikadu (Elevasi 980 mdpl)', 1, 1, 210, 612, 88, 12.30, 1250, 'otomatis_malam', 'aktif', NOW()),
  ('TRAP-04', 'Perangkap Hama 04 - Kebun Buah & Sengon', 'Zona Penyangga Hutan Rakyat Blok D', 0, 0, 34, 95, 20, 12.80, 1600, 'hemat_energi', 'standby', NOW()),
  ('TRAP-05', 'Perangkap Hama 05 - Bibit Tanaman Vetiver & Bambu', 'Zona Penguat Tebing Kritis Blok E', 1, 1, 115, 310, 54, 12.50, 1380, 'otomatis_malam', 'aktif', NOW())
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- -----------------------------------------------------------------------------
-- 5. SEED RIWAYAT ALARM (ALARM LOGS)
-- -----------------------------------------------------------------------------
INSERT INTO `alarm_logs` (
  `id`, `ews_id`, `alarm_type`, `trigger_cause`, `trigger_value`,
  `duration_minutes`, `acknowledged`, `acknowledged_by`, `acknowledge_note`, `acknowledged_at`, `resolved_at`, `created_at`
) VALUES
  ('ALM-2026-089', 'EWS-02', 'siaga', 'Kemiringan Tanah (Inclinometer Pitch X) & Kelembapan Melebihi Batas', 'Pitch: 1.82° (Ambang: 1.50°) | Kelembapan: 78.2%', 30, 1, 'Rian Pratama (Pos Pantau 2)', 'Pemeriksaan lapangan via visual drone dan patroli warga. Drainase lereng terpantau lancar.', '2026-09-23 18:48:00', NULL, '2026-09-23 18:42:15'),
  ('ALM-2026-088', 'EWS-01', 'siaga', 'Intensitas Curah Hujan Tinggi (Tipping Bucket)', 'Curah Hujan: 28.6 mm/jam (Ambang: 20.0 mm/jam)', 45, 1, 'Budi Santoso (Pos Pantau 1)', 'Hujan reda setelah 40 menit, status kembali aman otomatis.', '2026-09-21 14:20:10', '2026-09-21 15:00:00', '2026-09-21 14:15:00'),
  ('ALM-2026-087', 'EWS-03', 'baterai_lemah', 'Tegangan Baterai VRLA Turun Dibawah Ambang Kritis', 'Tegangan: 11.6V (Ambang: 11.8V)', 120, 1, 'Ahmad Fauzi (Pos Pantau 3)', 'Pembersihan permukaan kaca solar panel dari lumut & serbuk kayu, baterai kembali terisi penuh.', '2026-09-18 10:10:00', '2026-09-18 12:15:00', '2026-09-18 09:30:00')
ON DUPLICATE KEY UPDATE `trigger_cause` = VALUES(`trigger_cause`);

-- -----------------------------------------------------------------------------
-- 6. SEED SAMPEL LOG TELEMETRI SENSOR EWS (EWS SENSOR LOGS)
-- -----------------------------------------------------------------------------
INSERT INTO `ews_sensor_logs` (
  `ews_id`, `pitch_angle`, `roll_angle`, `soil_moisture`, `soil_temperature`, `rainfall_rate`, `rainfall_cumulative`,
  `vibration_level`, `battery_voltage`, `battery_current`, `solar_current`, `gsm_signal_dbm`, `gsm_status`,
  `microsd_used_mb`, `microsd_total_mb`, `firmware_version`, `uptime_hours`, `created_at`
) VALUES
  ('EWS-01', 0.12, -0.07, 41.80, 24.50, 0.00, 18.40, 0.018, 12.80, 400, 1850, -67, 'online', 1420, 30400, 'v2.4.1-ESP32-A7670C', 340, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('EWS-01', 0.13, -0.07, 42.10, 24.70, 0.00, 18.40, 0.019, 12.80, 405, 1840, -68, 'online', 1420, 30400, 'v2.4.1-ESP32-A7670C', 341, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('EWS-01', 0.14, -0.08, 42.50, 24.80, 0.00, 18.40, 0.020, 12.80, 410, 1820, -68, 'online', 1420, 30400, 'v2.4.1-ESP32-A7670C', 342, NOW()),

  ('EWS-02', 1.45, 0.80, 71.00, 23.50, 18.50, 45.00, 0.050, 12.50, 500, 800, -73, 'online', 2180, 30400, 'v2.4.1-ESP32-A7670C', 510, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('EWS-02', 1.70, 0.88, 75.80, 23.30, 24.00, 58.00, 0.070, 12.45, 515, 710, -74, 'online', 2180, 30400, 'v2.4.1-ESP32-A7670C', 511, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('EWS-02', 1.82, 0.94, 78.20, 23.20, 26.40, 64.00, 0.080, 12.40, 520, 640, -74, 'online', 2180, 30400, 'v2.4.1-ESP32-A7670C', 512, NOW());

-- -----------------------------------------------------------------------------
-- 7. SEED SAMPEL LOG PERANGKAP HAMA (PEST TRAP LOGS)
-- -----------------------------------------------------------------------------
INSERT INTO `pest_trap_logs` (
  `trap_id`, `pir_trigger_count`, `photoelectric_count`, `container_capacity_percent`,
  `battery_voltage`, `solar_charging_current`, `uv_led_status`, `blower_status`, `mode`, `status`, `created_at`
) VALUES
  ('TRAP-01', 130, 360, 58, 12.65, 1450, 1, 1, 'otomatis_malam', 'aktif', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  ('TRAP-01', 138, 375, 60, 12.62, 1430, 1, 1, 'otomatis_malam', 'aktif', DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  ('TRAP-01', 142, 388, 62, 12.60, 1420, 1, 1, 'otomatis_malam', 'aktif', NOW());
