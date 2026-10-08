# 🦟 Smart Pest Trap - ESP32 Dual-Core & FreeRTOS Mutex

Sistem Pengendali & Perangkap Hama Otomatis (**Smart Pest Trap**) berbasis **ESP32**, dirancang sesuai dengan skematik PCB [`Schematic_perangkap_hama_2026-10-03.pdf`](../pcb/pcb/Schematic_perangkap_hama_2026-10-03.pdf).

Sistem ini menggabungkan sensor jarak presisi laser **Time-of-Flight (VL53L0X)**, modul **RTC DS3231**, sensor daya **INA226**, layar **OLED SSD1306**, pemicu **Relay Zapper & Lampu UV**, serta **Web Server Captive Portal** yang berjalan secara mandiri, anti-crash (*fault-tolerant*), dan responsif.

---

## 🚀 1. Arsitektur Dual-Core & FreeRTOS Mutex

ESP32 memiliki prosesor **Xtensa dual-core 32-bit (Core 0 dan Core 1)**. Pada program ini, seluruh beban komputasi dipisahkan secara asinkron ke masing-masing core menggunakan **FreeRTOS**:

```
+-------------------------------------------------------------------------------+
|                                    ESP32                                      |
+---------------------------------------+---------------------------------------+
|                CORE 0                 |                CORE 1                 |
|       (Networking & Web Server)       |       (Real-Time Control & Sensing)   |
+---------------------------------------+---------------------------------------+
| • WiFi SoftAP ("Perangkap-Hama-ESP32")| • Sensor VL53L0X ToF (Sampling 60ms)  |
| • DNS Captive Portal (Port 53)        | • Pemicu Cepat Relay 1 (Zapper Pulse) |
| • WebServer HTTP (Port 80)            | • Relay 2 Lampu UV (Jadwal DS3231)    |
| • REST API Endpoints (/api/status,    | • Monitoring Aki / Solar via INA226   |
|   /api/schedule, /api/settings, dll)  | • Layar OLED SSD1306 Multi-halaman    |
| • Tampilan Status Tombol & HW di Web  | • Polling Tombol Fisik (Debounced)    |
|                                       | • Smart I2C Auto-Detect & Hot-Plug    |
|                                       | • Print Status Tombol (0/1) ke Serial |
+---------------------------------------+---------------------------------------+
                    │                                       │
                    ▼                                       ▼
            +───────────────────────────────────────────────────────+
            |             FREERTOS MUTEX (dataMutex)                |
            |   Sinkronisasi State Bersama Aman (Thread-Safe)       |
            |   Mencegah Tabrakan Memori & I2C Bus Lockup           |
            +───────────────────────────────────────────────────────+
```

### Keunggulan Arsitektur Ini:
1. **Zero-Lag Deteksi Hama**: Pembacaan sensor laser VL53L0X dan pemicuan Relay 1 di Core 1 tidak pernah tertunda (*non-blocking*) meskipun ada banyak pengguna yang sedang membuka halaman web di Core 0.
2. **I2C Bus Thread-Safety**: Protokol I2C bawaan ESP32 tidak thread-safe. Seluruh komunikasi I2C (OLED, DS3231, INA226, VL53L0X) diisolasi hanya pada **Core 1**. Ketika pengguna web di Core 0 ingin mengubah jam RTC atau reset counter, perintah dikirim via *flag request* yang dilindungi oleh `dataMutex`.

---

## 🧠 2. Fitur Smart Hardware Auto-Detection & Fallback (Anti-Freeze / Crash)

Sistem dirancang dengan arsitektur **Smart Self-Healing**: jika ada modul I2C yang belum dipasang, longgar, atau dicopot saat berjalan (*hot-plugging*), **ESP32 TIDAK AKAN HANG ATAU CRASH**, melainkan beralih otomatis ke mode fallback yang aman:

| Komponen Hardware | Alamat I2C | Perilaku Saat Modul TIDAK Terdeteksi | Pemulihan Otomatis (*Hot-Plug*) |
| :--- | :--- | :--- | :--- |
| **RTC DS3231** | `0x68` | Beralih ke **Software RTC (Internal Millis Timer)**. Jadwal tetap berjalan menggunakan estimasi waktu internal. Web server tetap bisa mengatur jam. | Saat kabel modul RTC terpasang kembali, modul otomatis terdeteksi ulang dan jam disinkronkan kembali. |
| **OLED SSD1306** | `0x3C` | ESP32 mendeteksi ketiadaan layar, melewatkan siklus *I2C display refresh*, sehingga tidak terjadi I2C Bus Lockup / WDT Reset. | Saat OLED ditancapkan, sistem otomatis memanggil `display.begin()` dan layar langsung menyala normal. |
| **VL53L0X (Laser ToF)** | `0x29` | Sensor di-bypass dengan jarak default aman (9999 mm). Relay 1 tidak akan mengalami pemicuan liar (*false trigger*). | Sistem memindai I2C secara berkala. Ketika sensor terpasang, langsung dilakukan `vl53.begin()` otomatis. |
| **INA226 (Daya/Arus)** | `0x40` | Nilai tegangan, arus, dan daya di-set 0.0V / 0.0mA tanpa memblokir pembacaan task utama. | Terdeteksi kembali secara instan dan langsung membaca tegangan baterai/solar panel. |

---

## 🔘 3. Pemetaan Pin & Status Tombol Fisik (Print 0 / 1)

Sirkuit tombol menggunakan resistor **PULL-UP** (Logika: **1 = Lepas / HIGH**, **0 = Ditekan / LOW**).

Program secara aktif mencetak status tombol ke **Serial Monitor (Baudrate: 115200)**:
1. **Event-Driven**: Setiap kali ada tombol yang ditekan/dilepas, langsung muncul notifikasi instan:
   ```text
   [BTN-EVT] BT1 (GPIO25)=0 | BT2 (GPIO26)=1 | BT3 (GPIO27)=1
   [BTN-CLICK] Tombol 1 ditekan -> Pindah Halaman OLED
   ```
2. **Periodic Heartbeat (Setiap 2.5 Detik)**: Menampilkan status biner tombol 0/1 beserta kondisi kesehatan hardware:
   ```text
   [STATUS-PULSE] Tombol(0=Press, 1=Release): BT1=1 | BT2=1 | BT3=1 || HW:[OLED:OK | RTC:OK | TOF:OK | INA:OK] || Jam: 18:30:15 | Mode: AUTO | UV: ON | Hama: 12
   ```

### Tabel Fungsi Pin Tombol & Relay:

| Komponen / Jalur | Pin ESP32 | Logika | Arah | Keterangan Fungsi |
| :--- | :--- | :--- | :--- | :--- |
| **Relay 1 (`in1`)** | **GPIO 14** | Active LOW/HIGH | Output | Pemicu zapper/jebakan hama saat objek terdeteksi |
| **Relay 2 (`in2`)** | **GPIO 12** | Active LOW/HIGH | Output | Pengendali **Lampu UV** (otomatis ON saat mode `RUNNING`) |
| **Relay 3 (`in3`)** | **GPIO 13** | Active LOW/HIGH | Output | Relay auxiliary / cadangan |
| **Tombol 1 (`bt1`)** | **GPIO 25** | 1=Lepas, 0=Tekan | Input | Pindah halaman tampilan layar OLED |
| **Tombol 2 (`bt2`)** | **GPIO 26** | 1=Lepas, 0=Tekan | Input | Ganti mode cepat (`AUTO` / `MANUAL ON` / `MANUAL OFF`) |
| **Tombol 3 (`bt3`)** | **GPIO 27** | 1=Lepas, 0=Tekan | Input | Klik: tes zap \| Tahan 2 detik: **Reset counter hama** |
| **I2C SDA** | **GPIO 21** | 3.3V | I/O | Data I2C (OLED, DS3231, INA226, VL53L0X) |
| **I2C SCL** | **GPIO 22** | 3.3V | Output | Clock I2C (OLED, DS3231, INA226, VL53L0X) |

---

## ⚙️ 4. Fitur Utama Sistem

### 🎯 Deteksi & Hitungan Hama Otomatis
- Menggunakan sensor laser **VL53L0X Time-of-Flight (ToF)** yang kebal terhadap perubahan warna cahaya lingkungan.
- Ambang batas jarak pemicu default: $\le 100\text{ mm}$ (dapat dikalibrasi via Web Server dari $10 - 2000\text{ mm}$).
- Saat hama masuk ke jangkauan:
  1. Relay 1 (in1) aktif selama durasi pulsa (default $500\text{ ms}$).
  2. Hitungan `pestCounter` bertambah $+1$.
  3. Nilai counter langsung disimpan ke **Flash Memory NVS (`Preferences`)**, sehingga tidak akan ter-reset meskipun perangkat mati listrik.

### ⏰ Penjadwalan Waktu Nyata (RTC DS3231 & Software RTC Fallback)
- Waktu akurat terjaga dengan modul baterai koin RTC DS3231 (atau Software RTC jika modul belum terpasang).
- Mendukung **jadwal lintas malam/hari** (*overnight schedule*), contohnya:
  - **Mulai:** `18:00` (sore)
  - **Selesai:** `02:00` (dini hari)
- Di dalam rentang jadwal:
  - Sistem berstatus **`RUNNING`**.
  - **Relay 2 (Lampu UV) otomatis MENYALA**.
  - Sensor perangkap aktif mendeteksi hama.
- Di luar rentang jadwal:
  - Sistem masuk ke mode **`STANDBY`** dan Lampu UV padam untuk menghemat konsumsi aki/solar panel.

### 🔋 Pemantauan Daya & Kelistrikan (INA226)
- Terhubung ke shunt resistor presisi ($0.1\,\Omega$).
- Mengukur tegangan aki/solar panel ($V$), arus beban ($mA$), dan daya total ($mW/W$) secara real-time.
- Ditampilkan pada layar OLED dan dashboard web.

### 🖥️ Tampilan Multi-Halaman Layar OLED (SSD1306 128x64)
Layar otomatis berotasi setiap 5 detik atau dipindah manual via tombol `bt1`:
- **Halaman 1 (Dashboard Utama)**: Jam RTC, status `[RUN:UV]` / `[STBY]`, angka besar total hama, jarak sensor terkini, dan status HW.
- **Halaman 2 (Monitor Daya INA226)**: Tegangan ($V$), Arus ($mA$), dan Daya ($W$).
- **Halaman 3 (Jadwal & WiFi)**: Mode operasional, jam mulai-selesai, IP address Access Point, dan status Lampu UV.

### 📟 Output Serial Monitor Real-Time (115200 Baud)
Serial Monitor menyediakan pemantauan langsung terhadap waktu RTC, sensor, status jadwal, dan tombol fisik:
```text
[RTC WAKTU] 03/10/2026 18:30:00 [DS3231] | Mode: AUTO | Status: RUNNING | UV: ON
[RTC WAKTU] 03/10/2026 18:30:01 [DS3231] | Mode: AUTO | Status: RUNNING | UV: ON
[HEARTBEAT] Jam RTC: 18:30:02 | Tombol: [bt1=1, bt2=1, bt3=1] | Modul: [OLED:OK, RTC:OK, VL53:OK, INA:OK]
[DETEKSI HAMA] Jarak: 82 mm <= 100 mm | Count: 5 | Relay 1 (Zapper) AKTIF 500 ms!
[TOMBOL EVENT] bt1 (D25)=0 (DITEKAN) -> Pindah Halaman OLED
```

---

## 🌐 5. Panduan Web Server & Captive Portal

ESP32 memancarkan jaringan WiFi sendiri tanpa membutuhkan router eksternal:

- **SSID WiFi**: `Perangkap-Hama-ESP32`
- **Password**: `12345678`
- **IP Default**: `http://192.168.4.1`

### Fitur Web Interface:
1. **Live Monitoring Dashboard**: Pembaruan status hitungan hama, tegangan aki, arus, daya, jarak sensor, dan status lampu secara otomatis setiap 1,5 detik via AJAX.
2. **Status Live Tombol Fisik**: Menampilkan kondisi tombol fisik GPIO 25, GPIO 26, dan GPIO 27 secara real-time (`1: RELEASED (HIGH)` / `0: PRESSED (LOW)`).
3. **Pemeriksaan Kesehatan Hardware (Hardware Health Check)**: Indikator visual hijau/merah untuk OLED SSD1306, RTC DS3231, Sensor VL53L0X, dan INA226.
4. **Sinkronisasi RTC 1-Klik**: Tombol *"Sinkronkan dengan Waktu HP / Laptop Ini"* secara otomatis menyamakan tanggal, jam, menit, dan detik DS3231 dengan jam perangkat client.
5. **Konfigurasi Jadwal & Mode**: Form pemilihan jam mulai, jam selesai, serta mode (`AUTO`, `MANUAL ON`, `MANUAL OFF`).
6. **Kalibrasi Sensor & Relay**: Pengaturan ambang batas jarak deteksi ($mm$), durasi pulsa relay ($ms$), jeda cooldown ($ms$), dan polaritas relay (Active LOW / Active HIGH).
7. **Kontrol Manual Interaktif dengan Indikator Warna Dinamis**: 
   - **Relay 1 (Zapper)**: Tombol dilengkapi status live & efek animasi glow merah menyala saat pulsa sengatan aktif.
   - **Relay 2 (Lampu UV)**: Tombol dinamis dengan warna **HIJAU EMERALD (ON / MENYALA)** saat relay aktif, dan **GELAP / BORDER MERAH (OFF / MATI)** saat padam, sehingga pengguna langsung mengetahui status fisik relay tanpa harus menebak.
8. **Reset Counter**: Tombol konfirmasi reset hitungan hama ke 0.

### 📡 Endpoint REST API:
| Method | Endpoint | Fungsi |
| :--- | :--- | :--- |
| `GET` | `/` | Antarmuka web utama (HTML, CSS Glassmorphism, JS) |
| `GET` | `/api/status` | Mengambil data sensor, daya, status relay, RTC, tombol (0/1), dan status HW dalam format JSON |
| `POST` | `/api/schedule` | Menyimpan mode operasi dan jam mulai/selesai |
| `POST` | `/api/settings` | Menyimpan parameter threshold jarak, durasi pulsa, cooldown, dll |
| `POST` | `/api/sync-rtc` | Memperbarui waktu DS3231 berdasarkan input client |
| `POST` | `/api/reset-count` | Mereset hitungan hama menjadi 0 di memori NVS |
| `POST` | `/api/relay-test` | Memicu uji coba relay 1 atau toggle relay 2 |

---

## 🛠️ 6. Cara Kompilasi dan Upload

### Library Arduino yang Dibutuhkan:
1. `Adafruit SSD1306` (oleh Adafruit)
2. `Adafruit GFX Library` (oleh Adafruit)
3. `Adafruit_VL53L0X` (oleh Adafruit)
4. `RTClib` (oleh Adafruit)
5. `INA226_WE` (oleh Wolfgang Ewald)
6. Library standar ESP32: `WiFi`, `WebServer`, `DNSServer`, `Preferences`, `Wire`

### Kompilasi via Arduino CLI:
```bash
arduino-cli compile --fqbn esp32:esp32:esp32 /home/aris/Dokumen/projeck/45/perangkap-hama/esp32_program/
```

### Upload ke Board ESP32:
```bash
arduino-cli upload -p /dev/ttyUSB0 --fqbn esp32:esp32:esp32 /home/aris/Dokumen/projeck/45/perangkap-hama/esp32_program/
```
*(Sesuaikan `/dev/ttyUSB0` dengan port serial ESP32 Anda, misalnya `/dev/ttyUSB1` atau `/dev/ttyACM0`)*

---

## 🔍 7. Troubleshooting & Hot-Plug Guide

| Gejala | Kemungkinan Penyebab | Solusi & Penjelasan Sistem |
| :--- | :--- | :--- |
| Modul RTC belum dipasang saat dinyalakan | DS3231 belum dicolok ke socket PCB | **Sistem tetap beroperasi normal**. Sistem otomatis menggunakan Software RTC internal. Jika RTC dicolok kapan saja, sistem akan langsung mengenali modul tanpa perlu restart ESP32. |
| Layar OLED belum dicolok / dilepas | OLED SSD1306 tidak terhubung | Sistem mendeteksi `0x3C` tidak merespon dan melewatinya secara cerdas. Begitu OLED dicolok, layar langsung menyala otomatis. |
| Sensor laser ToF belum dipasang | Sensor VL53L0X lepas | Sistem tidak akan error atau memicu relay palsu. Serial monitor akan menampilkan `[TOF:MISSING]`. Begitu sensor dicolok, sistem langsung auto-init. |
| Serial Monitor menampilkan `BT1=0` padahal tombol tidak ditekan | Jalur tombol terhubung singkat ke GND | Cek solderan tombol `bt1` di GPIO 25 terhadap pin GND. |
| Web Server tidak bisa dibuka | HP terputus dari WiFi SoftAP | Pastikan HP tetap terhubung ke SSID `Perangkap-Hama-ESP32` (matikan opsi "Alihkan ke Data Seluler Otomatis" di setelan WiFi HP Anda). |
