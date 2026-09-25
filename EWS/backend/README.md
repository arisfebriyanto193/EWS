# Backend IoT: Sistem EWS dan Perangkap Hama Terintegrasi

Backend IoT berbasis **Node.js (Express)** dan **WebSocket (`ws`)** untuk komunikasi dua arah antara mikrokontroler **ESP32** (menggunakan modem GSM/4G SIMCom A7670C atau WiFi) dan **Frontend Web Monitoring**, didukung oleh penyimpanan database relasional **MySQL / MariaDB**.

---

## 🏗️ Arsitektur Sistem

```
┌─────────────────────────┐               ┌─────────────────────────┐
│     ESP32 (EWS 01-04)   │               │     Web Dashboard       │
│   Modem GSM SIMCom A7670│               │  (React / Vite HTTPS)   │
│   Inclinometer, ADXL345 │               │  Admin, Operator, Warga │
└────────────┬────────────┘               └────────────▲────────────┘
             │                                         │
             │ ws://server:3440                        │ ws://server:3440 (Pub/Sub)
             │ (Format JSON / RAW)                     │ HTTP REST:5000 (Auth & CRUD)
             ▼                                         ▼
    ┌─────────────────────────────────────────────────────────────┐
    │              Node.js IoT Gateway Server                      │
    │  - WebSocket Server (Port 3440, verifyClient origin & UA)   │
    │  - Express REST API (Port 5000)                             │
    │  - Telemetry Engine (Evaluasi Threshold Siaga / Bahaya)     │
    │  - Audit Trail & Command Dispatcher ke Aktuator             │
    └──────────────────────────────┬──────────────────────────────┘
                                   │
                                   ▼
                   ┌──────────────────────────────┐
                   │    MySQL / MariaDB Database  │
                   │  - users & authentication    │
                   │  - ews_nodes & thresholds    │
                   │  - telegram_configs          │
                   │  - ews_sensor_logs (histori) │
                   │  - pest_traps & trap_logs    │
                   │  - alarm_logs & audit_logs   │
                   └──────────────────────────────┘
```

---

## 🗄️ Struktur Database MySQL (Dari Login hingga Logs)

File DDL lengkap berada di [`backend/database/schema.sql`](file:///home/aris/Dokumen/projeck/45/EWS/backend/database/schema.sql) dan data awal di [`backend/database/seeds.sql`](file:///home/aris/Dokumen/projeck/45/EWS/backend/database/seeds.sql).

### 1. Tabel `users` (Otentikasi & Hak Akses Peran)
Menyimpan akun pengguna, password ter-hash bcrypt, serta penugasan pos pantau operator:
- `id` (VARCHAR 50, PK): ID unik akun (misal `user-01`).
- `username` (VARCHAR 50, UNIQUE): ID masuk (misal `admin_bpbd`, `operator_ews1`, `warga_publik`).
- `password_hash` (VARCHAR 255): Hash Bcrypt (default password demo: `ews123`).
- `full_name` (VARCHAR 100): Nama lengkap operator / personil BPBD.
- `role` (ENUM): `superadmin`, `operator_ews1`, `operator_ews2`, `operator_ews3`, `operator_ews4`, `public`.
- `assigned_ews_id` (VARCHAR 20, NULL): Titik EWS khusus untuk operator EWS terkait.
- `department` (VARCHAR 150): Instansi atau sektor wilayah tugas.
- `avatar_url` (VARCHAR 255): URL foto profil.
- `is_active` (TINYINT 1): Status aktif pengguna.

### 2. Tabel `ews_nodes` (Master Titik Pantau & Parameter)
Menyimpan 4 titik pantau EWS, ambang batas alarm (thresholds), dan cache telemetri terkini:
- `id` (VARCHAR 20, PK): `EWS-01`, `EWS-02`, `EWS-03`, `EWS-04`.
- `name` & `location`: Nama titik dan zonasi rawan longsor.
- `latitude` & `longitude` (DECIMAL 10,7): Koordinat geospasial peta.
- `status` (ENUM): `aman`, `siaga`, `bahaya`, `offline`, `baterai_lemah`, `gangguan_sensor`.
- `siren_active`, `strobo_active`, `muted`: Status aktuator fisik darurat.
- **Thresholds**:
  - `tilt_warning` (default: 1.50°) & `tilt_danger` (default: 3.00°)
  - `rain_warning` (default: 20.00 mm/jam) & `rain_danger` (default: 50.00 mm/jam)
  - `soil_moisture_warning` (default: 75.00 %)
  - `vibration_danger` (default: 0.25 g)
  - `battery_low_voltage` (default: 11.80 V)
- **Cache Nilai Sensor**: `last_pitch`, `last_roll`, `last_soil_moisture`, `last_soil_temp`, `last_rainfall_rate`, `last_rainfall_cumulative`, `last_vibration`, `last_battery_voltage`, `last_gsm_signal`, `last_seen_at`.

### 3. Tabel `telegram_configs` (Konfigurasi Notifikasi Telegram Bot Mandiri)
Tersambung relasional One-to-One dengan `ews_nodes` via Foreign Key `ews_id`:
- `bot_token`, `chat_id`, `channel_name`: Kredensial Bot Telegram per pos pantau.
- `enabled`, `notify_siaga`, `notify_bahaya`, `notify_offline`, `notify_baterai_lemah`, `notify_sensor_gagal`, `daily_report`.

### 4. Tabel `ews_sensor_logs` (Histori Data Telemetri Time-Series)
Penyimpanan deret waktu berkala dari ESP32 untuk grafik monitoring, analisis mitigasi, dan ekspor CSV:
- `ews_id`: Referensi ke `ews_nodes.id`.
- `pitch_angle` & `roll_angle`: Derajat kemiringan tanah dua sumbu (Inclinometer RS485).
- `soil_moisture` (%) & `soil_temperature` (°C): Sensor kelembapan & suhu tanah.
- `rainfall_rate` (mm/jam) & `rainfall_cumulative` (mm 24 jam): Tipping bucket rain gauge.
- `vibration_level` (g): Akselerometer ADXL345.
- `battery_voltage` (V), `battery_current` (mA), `solar_current` (mA): Daya aki VRLA & panel surya 30Wp.
- `gsm_signal_dbm` (dBm) & `gsm_status`: Kualitas sinyal SIMCom A7670C.
- `uptime_hours`, `created_at`: Waktu perekaman data (terindeks `idx_ews_created`).

### 5. Tabel `pest_traps` (Master 5 Unit Perangkap Hama)
Menyimpan konfigurasi 5 unit perangkap hama bertenaga surya 30Wp:
- `id` (VARCHAR 20, PK): `TRAP-01` s/d `TRAP-05`.
- `uv_led_status` (BOOLEAN): Status lampu LED UV 395-405nm (~5W).
- `blower_status` (BOOLEAN): Status motor blower hisap sentrifugal 12V (15-25W).
- `pir_trigger_count` & `photoelectric_count`: Hitungan sensor PIR & optical penghitung hama.
- `container_capacity_percent`: Indikator kepenuhan wadah penampung kasa.
- `battery_voltage` & `solar_charging_current`: Status daya mandiri surya.
- `mode`: `otomatis_malam`, `manual`, `hemat_energi`.
- `status`: `aktif`, `standby`, `wadah_penuh`, `baterai_lemah`.

### 6. Tabel `pest_trap_logs` (Histori Log Sensor Perangkap Hama)
Mencatat dinamika populasi hama tertangkap dan efisiensi penangkapan berbasis waktu.

### 7. Tabel `alarm_logs` (Riwayat Insiden & Lembar Tindak Lanjut Operator)
- `id` (VARCHAR 30, PK): Format `ALM-2026-XXX`.
- `ews_id`: Titik EWS pemicu alarm.
- `alarm_type`: `siaga`, `bahaya`, `baterai_lemah`, `offline`, `sensor_gagal`.
- `trigger_cause`: Deskripsi penyebab (misal: *Kemiringan Tanah Ekstrem & Curah Hujan Tinggi*).
- `trigger_value`: Nilai riil sensor saat alarm terpicu.
- `duration_minutes`: Lama durasi alarm berbunyi.
- `acknowledged` (TINYINT 1): Status konfirmasi operator pos pantau.
- `acknowledged_by`, `acknowledge_note`, `acknowledged_at`: Catatan mitigasi & nama operator.
- `resolved_at`: Waktu normal kembali.

### 8. Tabel `device_command_logs` (Audit Log Perintah Kendali Jarak Jauh)
Mencatat seluruh aksi kontrol yang dikirim dari Web Dashboard ke ESP32 (`TRIGGER_ALARM`, `RESET_ALARM`, `MUTE_SIREN`, `SET_TRAP_MODE`, dll) beserta waktu dan pengguna pengirim.

---

## 🔌 Komunikasi WebSocket (ESP32 <-> Server <-> Web)

Server berjalan di port **3440** (dapat diatur via `WS_PORT` di `.env`).

### 1. Filter Keamanan `verifyClient`
- **Browser Client**: Divalidasi melalui header `Origin` yang terdaftar pada variabel `ALLOWED_ORIGINS`.
- **ESP32 / Mikrokontroler**: Divalidasi melalui header `User-Agent` yang mengandung kata `Arduino`, `ESP32`, atau `SIMCom`, atau koneksi TCP raw tanpa origin.

### 2. Format Pesan JSON
Klien dapat mengirim pesan berformat JSON dengan properti `action`, `topic`, dan `payload`:

#### A. Subscribe ke Topik:
```json
{
  "action": "subscribe",
  "topic": "ews/EWS-01/telemetry"
}
```

#### B. ESP32 Mengirim (Publish) Telemetri Sensor:
```json
{
  "action": "publish",
  "topic": "ews/EWS-01/telemetry",
  "payload": {
    "pitchAngle": 0.14,
    "rollAngle": -0.08,
    "soilMoisture": 42.5,
    "soilTemperature": 24.8,
    "rainfallRate": 0.0,
    "rainfallCumulative": 18.4,
    "vibrationLevel": 0.02,
    "batteryVoltage": 12.8,
    "batteryCurrent": 410,
    "solarCurrent": 1820,
    "gsmSignalDbm": -68,
    "gsmStatus": "online",
    "uptimeHours": 342,
    "firmwareVersion": "v2.4.1-ESP32-A7670C"
  }
}
```
*Ketika data ini diterima, server secara otomatis:*
1. Menyimpan data deret waktu ke `ews_sensor_logs`.
2. Memperbarui tabel `ews_nodes`.
3. Membandingkan dengan ambang batas (threshold). Jika melebihi batas, status diubah menjadi `siaga` atau `bahaya`, sirine diaktifkan, dan pesan dikirim ke topik `alarms`.
4. Meneruskan data ke seluruh Web Browser yang sedang berlangganan topik tersebut.

#### C. Web Dashboard Mengirim Perintah Kontrol ke ESP32:
```json
{
  "action": "publish",
  "topic": "ews/EWS-01/command",
  "payload": {
    "command": "TRIGGER_ALARM",
    "type": "bahaya",
    "siren": true,
    "strobo": true,
    "issuedBy": "Operator BPBD"
  }
}
```

### 3. Format Pesan RAW (Alternatif Hemat Bandwidth ESP32)
Format: `topic|payload`
Contoh:
```text
ews/EWS-01/telemetry|{"pitchAngle":1.82,"soilMoisture":78.2,"rainfallRate":26.4}
```
atau data sederhana:
```text
sensor/temp|25.4
```

---

## 🌐 Endpoint HTTP REST API (Port 5000)

| Metode | Endpoint | Keterangan |
|---|---|---|
| `POST` | `/api/auth/login` | Masuk sistem (kredensial default: `admin_bpbd` / `ews123`) |
| `GET` | `/api/auth/me` | Dapatkan profil operator dari Bearer Token JWT |
| `GET` | `/api/auth/users` | Daftar akun pengguna untuk preset login |
| `GET` | `/api/ews` | Ambil data lengkap 4 titik EWS, status sensor, & threshold |
| `GET` | `/api/ews/:id` | Detail satu titik EWS (misal `/api/ews/EWS-01`) |
| `PUT` | `/api/ews/:id/thresholds` | Perbarui ambang batas sudut, curah hujan, & getaran |
| `PUT` | `/api/ews/:id/telegram` | Perbarui token bot & Chat ID grup Telegram per titik |
| `POST` | `/api/ews/:id/control` | Kontrol sirine lokal 12V 110dB, strobo, mute, reset |
| `GET` | `/api/traps` | Ambil status 5 unit perangkap hama tenaga surya |
| `POST` | `/api/traps/:id/control` | Atur mode perangkap, on/off lampu UV, & on/off blower |
| `GET` | `/api/alarms` | Riwayat log alarm (filter: `?ewsId=EWS-01&acknowledged=0`) |
| `POST` | `/api/alarms/:id/acknowledge` | Konfirmasi tindak lanjut alarm oleh operator |
| `GET` | `/api/logs/sensor` | Ambil rekaman sensor historis untuk grafik deret waktu |
| `GET` | `/api/logs/export/csv` | Unduh rekaman sensor dalam format file CSV |
| `POST` | `/api/telemetry/ews` | *HTTP Fallback Webhook* jika ESP32 mengirim via HTTP POST |
| `GET` | `/health` | Pemeriksaan kesehatan server & status koneksi database |

---

## 🚀 Panduan Menjalankan Backend

### 1. Prasyarat
- Node.js versi 18+ (disarankan Node.js v20+)
- Server database MySQL atau MariaDB (aktif pada port 3306)

### 2. Instalasi Dependensi
```bash
cd backend
npm install
```

### 3. Konfigurasi Variabel Lingkungan (`.env`)
Salin file `.env.example` ke `.env` dan sesuaikan kredensial MySQL Anda:
```env
PORT=5000
WS_PORT=3440
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=ews_iot_db
```

### 4. Migrasi & Seeding Database
Database dan tabel akan dibuat **secara otomatis** saat server pertama kali dijalankan. Namun jika ingin menjalankan secara manual:
```bash
npm run migrate   # Membuat tabel skema database
npm run seed      # Memasukkan data awal pengguna, 4 EWS, 5 perangkap hama
```

### 5. Menjalankan Server
```bash
# Mode Produksi
npm start

# Mode Pengembangan (Hot-reload dengan Watcher)
npm run dev
```

### 6. Menjalankan Tes Simulasi Komunikasi Dua Arah
Tersedia skrip pengujian WebSocket otomatis:
```bash
node test_ws.js
```

---

## 🛠️ Contoh Kode Firmware ESP32
- [`backend/examples/esp32_ews_client.ino`](file:///home/aris/Dokumen/projeck/45/EWS/backend/examples/esp32_ews_client.ino): Skrip firmware Arduino C++ lengkap untuk modul ESP32 EWS.
- [`backend/examples/esp32_trap_client.ino`](file:///home/aris/Dokumen/projeck/45/EWS/backend/examples/esp32_trap_client.ino): Skrip firmware Arduino C++ untuk perangkap hama tenaga surya.
