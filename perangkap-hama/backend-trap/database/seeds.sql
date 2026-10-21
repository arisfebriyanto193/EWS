-- =============================================================================
-- SEED DATA AWAL: SISTEM PERANGKAP HAMA CERDAS (SMART PEST TRAP)
-- =============================================================================

USE `ews_iot_db`;

-- 1. Pengguna Awal
INSERT INTO `users` (`id`, `username`, `password_hash`, `full_name`, `role`, `department`, `avatar_url`)
VALUES
  ('user-01', 'admin_bpbd', '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS', 'Ir. Hendra Wijaya, M.T.', 'superadmin', 'Tim Pengendalian Hama & Agrikultur Cerdas', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'),
  ('user-02', 'operator_trap', '$2a$10$xh9nvNW26RqtJ1eoSIItXOPCGv08fG8nxDZ/vqvKJlvhcpWE602TS', 'Budi Santoso', 'operator', 'Operator Lapangan Sektor 1', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80')
ON DUPLICATE KEY UPDATE `username` = VALUES(`username`);

-- 2. Data Master Unit Perangkap Hama
INSERT INTO `pest_traps` (
  `id`, `name`, `location`, `uv_led_status`, `blower_status`,
  `pir_trigger_count`, `photoelectric_count`, `container_capacity_percent`,
  `battery_voltage`, `solar_charging_current`, `current_distance`,
  `mode`, `status`, `active_preset`, `manual_interval_min`, `manual_duration_sec`,
  `blower_mode`, `led_running`, `led_color`, `start_time`, `end_time`, `led_rotation_interval`,
  `presets_json`, `last_seen_at`
)
VALUES
  (
    'TRAP-01',
    'Perangkap Hama 01 - Blok Tanaman Utama',
    'Zona Pertanian Hortikultura Blok A (Sektor Utara)',
    1, 1, 142, 89, 45, 12.74, 1520, 180,
    'otomatis', 'aktif', 0, 15, 3,
    'sensor', 1, 'UV / Ungu', '18:00', '06:00', 15,
    '[{"id":0,"name":"Preset 1 (Wereng & Kutu)","colorName":"UV / Ungu","hex":"#8b5cf6","rgb":[139,92,246],"wavelength":"395nm","brightness":90,"targetPests":["Wereng Coklat","Kutu Kebul"]},{"id":1,"name":"Preset 2 (Penggerek Batang)","colorName":"Kuning Kehijauan","hex":"#84cc16","rgb":[132,204,22],"wavelength":"520nm","brightness":85,"targetPests":["Penggerek Batang Padi","Ulat Grayak"]},{"id":2,"name":"Preset 3 (Lalat Buah & Trips)","colorName":"Biru Terang","hex":"#06b6d4","rgb":[6,182,212],"wavelength":"465nm","brightness":80,"targetPests":["Lalat Buah","Thrips"]},{"id":3,"name":"Preset 4 (Kumbang Malam)","colorName":"Hijau Daun","hex":"#10b981","rgb":[16,185,129],"wavelength":"550nm","brightness":75,"targetPests":["Kumbang Malam","Orong-orong"]},{"id":4,"name":"Preset 5 (Multi Spektrum)","colorName":"Putih Dingin","hex":"#f8fafc","rgb":[248,250,252],"wavelength":"Spektrum Luas","brightness":95,"targetPests":["Serangga Nokturnal Umum"]}]',
    NOW()
  ),
  (
    'TRAP-02',
    'Perangkap Hama 02 - Sektor Pembibitan',
    'Zona Rumah Kaca & Pembibitan Blok B (Sektor Selatan)',
    1, 0, 68, 34, 22, 12.85, 1680, 240,
    'otomatis', 'aktif', 1, 15, 3,
    'sensor', 1, 'Kuning Kehijauan', '18:00', '06:00', 15,
    '[{"id":0,"name":"Preset 1 (Wereng & Kutu)","colorName":"UV / Ungu","hex":"#8b5cf6","rgb":[139,92,246],"wavelength":"395nm","brightness":90,"targetPests":["Wereng Coklat","Kutu Kebul"]},{"id":1,"name":"Preset 2 (Penggerek Batang)","colorName":"Kuning Kehijauan","hex":"#84cc16","rgb":[132,204,22],"wavelength":"520nm","brightness":85,"targetPests":["Penggerek Batang Padi","Ulat Grayak"]},{"id":2,"name":"Preset 3 (Lalat Buah & Trips)","colorName":"Biru Terang","hex":"#06b6d4","rgb":[6,182,212],"wavelength":"465nm","brightness":80,"targetPests":["Lalat Buah","Thrips"]},{"id":3,"name":"Preset 4 (Kumbang Malam)","colorName":"Hijau Daun","hex":"#10b981","rgb":[16,185,129],"wavelength":"550nm","brightness":75,"targetPests":["Kumbang Malam","Orong-orong"]},{"id":4,"name":"Preset 5 (Multi Spektrum)","colorName":"Putih Dingin","hex":"#f8fafc","rgb":[248,250,252],"wavelength":"Spektrum Luas","brightness":95,"targetPests":["Serangga Nokturnal Umum"]}]',
    NOW()
  )
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
