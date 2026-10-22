# 🛰️ Platform IoT Terintegrasi: EWS & Perangkap Hama Cerdas (Smart Pest Trap)

Dokumentasi arsitektur, struktur proyek, dan panduan menjalankan sistem pemantauan mitigasi bencana (**Early Warning System - EWS**) dan sistem kendali **Perangkap Hama Cerdas Berbasis IoT & Fototaksis UV**.

---

## 📌 Ringkasan Pemisahan Sistem

Awalnya, modul EWS dan modul Perangkap Hama digabung dalam satu aplikasi web. Untuk meningkatkan modularitas, keandalan, dan kemudahan deployment di lapangan, sistem kini **dipisahkan menjadi 2 ekosistem mandiri dengan logika 1:1 identik**:

1. **Sistem EWS (Early Warning System)**  
   - Fokus: Mitigasi bencana tanah longsor, pergerakan tanah, dan banjir lahar/aliran sungai.  
   - Backend berjalan di **Port 5000** | Frontend di **Port 3000**.
2. **Sistem Perangkap Hama Pintar (Smart Pest Trap)**  
   - Fokus: Pengendalian hama tanaman terpadu berbasis fototaksis LED UV (WS2812B), blower/zapper, sensor PIR, counter fotolistrik, monitoring baterai surya INA226, dan ketinggian wadah.  
   - Backend berjalan di **Port 5001** | Frontend di **Port 3001**.

---

## 📂 Struktur Direktori Repositori

```
/home/aris/Dokumen/projeck/45/
│
├── README.md                      # Dokumentasi komprehensif sistem (file ini)
├── up.sh                          # Skrip otomatisasi commit & push Git
│
├── EWS/                           # 🚨 EKOSISTEM SISTEM PERINGATAN DINI (EWS)
│   ├── backend/                   # REST API & WebSocket Server EWS (Port 5000)
│   │   ├── controllers/           # Logika controller node EWS, alarm, threshold, auth
│   │   ├── database/              # Skema & seeds MySQL (ews_nodes, telemetry, alarms)
│   │   ├── routes/                # Rute API (/api/ews, /api/auth, /api/alarms, dll.)
│   │   ├── services/              # Watchdog service, alert/SMS/Telegram dispatcher
│   │   ├── server.js              # Entrypoint server Express & WS
│   │   └── .env                   # PORT=5000, DB konfigurasi
│   ├── frontend-next/             # UI Dashboard EWS berbasis Next.js (Port 3000)
│   │   ├── src/app/               # App Router Next.js (halaman peta, dashboard, alarm)
│   │   ├── src/components/        # Komponen peta GIS, grafik telemetri, modal konfigurasi
│   │   └── package.json           # Skrip frontend Next.js EWS
│   ├── esp32-program/             # Source code firmware ESP32 untuk node sensor EWS
│   ├── PCB/                       # Desain skematik & layout PCB modul EWS
│   └── 3d/                        # File desain box panel pelindung IP65 EWS
│
└── perangkap-hama/                # 🦗 EKOSISTEM PERANGKAP HAMA PINTAR (SMART PEST TRAP)
    ├── backend-trap/              # REST API & WebSocket Gateway Pest Trap (Port 5001)
    │   ├── controllers/           # trapController, authController, logController
    │   ├── database/              # Skema & seeds tabel pest_traps, trap_logs, users
    │   ├── routes/                # Rute API (/api/traps, /api/auth, /api/logs/traps)
    │   ├── services/              # WebSocket gateway & watchdog koneksi 15s node trap
    │   ├── server.js              # Entrypoint server Express & WS (Port 5001)
    │   └── .env                   # PORT=5001, konfigurasi database & JWT
    ├── trap-next/                 # UI Dashboard Perangkap Hama Next.js (Port 3001)
    │   ├── src/app/               # Rute halaman: dashboard utama, settings akun
    │   ├── src/components/        # PestTrapDashboard, Header, Sidebar, LoginModal
    │   ├── src/context/           # TrapContext (State real-time & listener WebSocket)
    │   ├── src/services/          # api.ts (Axios client), websocket.ts
    │   ├── next.config.ts         # Proxy rewrite otomatis ke backend port 5001
    │   └── package.json           # Next.js dev & start skrip (port 3001)
    ├── esp32_program/             # Firmware Arduino/ESP32 untuk unit perangkap hama
    ├── pcb/                       # Desain rangkaian kontroler LED WS2812B & relay
    └── gcode/                     # Berkas fabrikasi box & corong penampung hama
```

---

## ⚡ Pemetaan Port & Alokasi Jaringan

Kedua sistem dirancang agar dapat dijalankan secara bersamaan (*concurrent*) pada mesin/server yang sama tanpa bentrok port:

| Modul | Aplikasi | Tipe | Port Default | URL Lokal |
|---|---|---|---|---|
| **EWS** | `backend` | REST API & WebSocket | `5000` | `http://localhost:5000`<br>`ws://localhost:5000/ws` |
| **EWS** | `frontend-next` | Web Dashboard | `3000` | `http://localhost:3000` |
| **Perangkap Hama** | `backend-trap` | REST API & WebSocket Gateway | `5001` | `http://localhost:5001`<br>`ws://localhost:5001/ws` |
| **Perangkap Hama** | `trap-next` | Web Dashboard | `3001` | `http://localhost:3001` |
| **Database** | MySQL Server | Database Relasional | `3306` | Database: `ews_iot_db` |

---

## 🗄️ Konfigurasi Basis Data (MySQL)

Kedua backend menggunakan MySQL database `ews_iot_db`.

### Kredensial Database Default
- **Host**: `localhost`
- **Port**: `3306`
- **User**: `root`
- **Password**: ``
- **Nama Database**: `ews_iot_db`

### Tabel Khusus Perangkap Hama:
1. `pest_traps`: Data master 5 unit node perangkap hama (status UV LED, blower, PIR count, photoelectric counter, kapasitas wadah %, tegangan aki/baterai, arus panel surya, preset warna, dan jadwal operasi).
2. `trap_logs`: Riwayat log telemetri dan aktivitas aktuasi.
3. `users`: Akun operator dan superadmin untuk otentikasi JWT.

---

## 🔑 Kredensial Akun Web Default

Untuk masuk ke panel kontrol dan pengaturan:

| Role | Username | Password | Hak Akses |
|---|---|---|---|
| **Super Admin** | `admin_bpbd` | `ews123` | Akses penuh seluruh node EWS & Perangkap Hama, kontrol aktuator, dan konfigurasi sistem |
| **Operator Trap** | `operator_trap` | `ews123` | Akses monitoring dan kendali unit perangkap hama di lapangan |
| **Warga / Tamu** | *Tanpa Login* | - | Mode tampilan publik (read-only telemetri) |

---

## 🚀 Panduan Menjalankan Sistem

### 1. Menjalankan Sistem Perangkap Hama (Smart Pest Trap)

#### A. Menjalankan Backend (`backend-trap`)
```bash
cd /home/aris/Dokumen/projeck/45/perangkap-hama/backend-trap
# Install dependency jika pertama kali
npm install

# Jalankan dalam mode development (auto-reload)
npm run dev
```
*Backend akan berjalan di `http://localhost:5001` dengan WebSocket di `ws://localhost:5001/ws`.*

#### B. Menjalankan Frontend (`trap-next`)
Buka terminal baru:
```bash
cd /home/aris/Dokumen/projeck/45/perangkap-hama/trap-next
# Install dependency jika pertama kali
npm install

# Jalankan dalam mode development (Port 3001)
npm run dev
```
*Akses dashboard perangkap hama di browser: **`http://localhost:3001`**.*

---

### 2. Menjalankan Sistem Peringatan Dini (EWS)

#### A. Menjalankan Backend (`EWS/backend`)
```bash
cd /home/aris/Dokumen/projeck/45/EWS/backend
npm install
npm run dev
```
*Backend EWS akan berjalan di `http://localhost:5000`.*

#### B. Menjalankan Frontend (`EWS/frontend-next`)
Buka terminal baru:
```bash
cd /home/aris/Dokumen/projeck/45/EWS/frontend-next
npm install
npm run dev
```
*Akses dashboard EWS di browser: **`http://localhost:3000`**.*

---

## 📡 Protokol Komunikasi IoT & WebSocket (Perangkap Hama)

### Topik WebSocket (`ws://localhost:5001/ws`):

1. **Pengiriman Telemetri ESP32 -> Server**:
   - **Topic**: `traps/{id}/telemetry` (Contoh: `traps/TRAP-01/telemetry`)
   - **Format JSON**:
   ```json
   {
     "uvLedStatus": true,
     "blowerStatus": false,
     "pirTriggerCount": 145,
     "photoelectricCount": 390,
     "containerCapacityPercent": 63,
     "batteryVoltage": 12.58,
     "solarChargingCurrent": 1450,
     "currentDistance": 185,
     "mode": "otomatis",
     "status": "aktif",
     "activePreset": 0,
     "ledColor": "UV / Ungu"
   }
   ```

2. **Perintah Kontrol Web -> ESP32**:
   - **Topic**: `traps/{id}/command` (Contoh: `traps/TRAP-01/command`)
   - **Format JSON**:
   ```json
   {
     "action": "SET_MODE",
     "payload": {
       "mode": "otomatis",
       "uvLed": true,
       "blower": true,
       "activePreset": 1
     }
   }
   ```

3. **Status Ketersediaan Node**:
   - **Topic**: `traps/{id}/status`
   - **Nilai**: `"online"` atau `"offline"` (diperbarui otomatis oleh Watchdog Service setiap 15 detik).

---

## 🛠️ Catatan Pemeliharaan & Troubleshooting

1. **Koneksi Database Gagal**:
   - Pastikan service MySQL/MariaDB berjalan: `sudo systemctl status mysql`
   - Cek kredensial di file `.env` masing-masing backend (`DB_USER`, `DB_PASSWORD`, `DB_NAME`).
2. **Port Sudah Terpakai**:
   - Cek proses yang menduduki port: `lsof -i :3001` atau `lsof -i :5001`
   - Hentikan proses jika perlu: `kill -9 <PID>`
3. **Build Frontend Produksi**:
   - Jalankan `npm run build` di direktori `trap-next` atau `frontend-next` untuk memastikan validitas TypeScript dan bundling Next.js.
