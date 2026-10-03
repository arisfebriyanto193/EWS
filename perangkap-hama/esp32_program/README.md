# 🦟 Smart Pest Trap - ESP32 Dual-Core & FreeRTOS Mutex

Sistem Pengendali & Perangkap Hama Otomatis (**Smart Pest Trap**) berbasis **ESP32**, dirancang sesuai dengan skematik PCB [`Schematic_perangkap_hama_2026-10-03.pdf`](../pcb/pcb/Schematic_perangkap_hama_2026-10-03.pdf).

Sistem ini menggabungkan sensor jarak presisi laser **Time-of-Flight (VL53L0X)**, modul **RTC DS3231**, sensor daya **INA226**, layar **OLED SSD1306**, pemicu **Relay Zapper & Lampu UV**, serta **Web Server Captive Portal** yang berjalan secara mandiri dan responsif.

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
|                                       | • Polling Tombol Fisik (Debounced)    |
|                                       | • Eksklusif I2C Bus Driver (D21, D22) |
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

## 📌 2. Pemetaan Pin Sesuai Skematik PCB

| Komponen / Jalur | Pin ESP32 | Arah | Keterangan Fungsi |
| :--- | :--- | :--- | :--- |
| **Relay 1 (`in1`)** | **GPIO 14** | Output | Pemicu zapper/jebakan hama saat objek terdeteksi |
| **Relay 2 (`in2`)** | **GPIO 12** | Output | Pengendali **Lampu UV** (otomatis ON saat mode `RUNNING`) |
| **Relay 3 (`in3`)** | **GPIO 13** | Output | Relay auxiliary / kipas cadangan |
| **Tombol 1 (`bt1`)** | **GPIO 25** | Input (Pull-up) | Pindah halaman tampilan layar OLED |
| **Tombol 2 (`bt2`)** | **GPIO 26** | Input (Pull-up) | Ganti mode cepat (`AUTO` / `FORCE ON` / `OFF`) |
| **Tombol 3 (`bt3`)** | **GPIO 27** | Input (Pull-up) | Klik: tes zap \| Tahan 2 detik: **Reset counter** |
| **I2C SDA** | **GPIO 21** | I/O | Data I2C (OLED, DS3231, INA226, VL53L0X) |
| **I2C SCL** | **GPIO 22** | Output | Clock I2C (OLED, DS3231, INA226, VL53L0X) |

---

## ⚙️ 3. Fitur Utama Sistem

### 🎯 Deteksi & Hitungan Hama Otomatis
- Menggunakan sensor laser **VL53L0X Time-of-Flight (ToF)** yang kebal terhadap perubahan warna cahaya lingkungan.
- Ambang batas jarak pemicu default: $\le 100\text{ mm}$ (dapat dikalibrasi via Web Server dari $10 - 2000\text{ mm}$).
- Saat hama masuk ke jangkauan:
  1. Relay 1 (in1) aktif selama durasi pulsa (default $500\text{ ms}$).
  2. Hitungan `pestCounter` bertambah $+1$.
  3. Nilai counter langsung disimpan ke **Flash Memory NVS (`Preferences`)**, sehingga tidak akan ter-reset meskipun perangkat mati listrik.

### ⏰ Penjadwalan Waktu Nyata (RTC DS3231)
- Waktu akurat terjaga dengan modul baterai koin RTC DS3231.
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
- **Halaman 1 (Dashboard Utama)**: Jam RTC, status `[RUN:UV]` / `[STBY]`, angka besar total hama, jarak sensor terkini, dan tegangan aki.
- **Halaman 2 (Monitor Daya INA226)**: Tegangan ($V$), Arus ($mA$), dan Daya ($W$).
- **Halaman 3 (Jadwal & WiFi)**: Mode operasional, jam mulai-selesai, IP address Access Point, dan status Lampu UV.

---

## 🌐 4. Panduan Web Server & Captive Portal

ESP32 memancarkan jaringan WiFi sendiri tanpa membutuhkan router eksternal:

- **SSID WiFi**: `Perangkap-Hama-ESP32`
- **Password**: `12345678`
- **IP Default**: `http://192.168.4.1`

### Fitur Web Interface:
1. **Live Monitoring Dashboard**: Pembaruan status hitungan hama, tegangan aki, arus, daya, jarak sensor, dan status lampu secara otomatis setiap 1,5 detik via AJAX.
2. **Sinkronisasi RTC 1-Klik**: Tombol *"Sinkronkan dengan Waktu HP / Laptop Ini"* secara otomatis menyamakan tanggal, bulan, tahun, jam, menit, dan detik DS3231 dengan jam perangkat smartphone/laptop Anda.
3. **Konfigurasi Jadwal & Mode**: Form pemilihan jam mulai, jam selesai, serta mode (`AUTO`, `MANUAL ON`, `MANUAL OFF`).
4. **Kalibrasi Sensor & Relay**: Pengaturan ambang batas jarak deteksi ($mm$), durasi pulsa relay ($ms$), jeda cooldown ($ms$), dan polaritas relay (Active LOW / Active HIGH).
5. **Kontrol Manual**: Tombol pemicu uji coba Relay 1 dan toggle Relay 2 (Lampu UV).
6. **Reset Counter**: Tombol konfirmasi reset hitungan hama ke 0.

### 📡 Endpoint REST API:
| Method | Endpoint | Fungsi |
| :--- | :--- | :--- |
| `GET` | `/` | Antarmuka web utama (HTML, CSS Glassmorphism, JS) |
| `GET` | `/api/status` | Mengambil data sensor, daya, status relay, dan RTC dalam format JSON |
| `POST` | `/api/schedule` | Menyimpan mode operasi dan jam mulai/selesai |
| `POST` | `/api/settings` | Menyimpan parameter threshold jarak, durasi pulsa, cooldown, dll |
| `POST` | `/api/sync-rtc` | Memperbarui waktu DS3231 berdasarkan input client |
| `POST` | `/api/reset-count` | Mereset hitungan hama menjadi 0 di memori NVS |
| `POST` | `/api/relay-test` | Memicu uji coba relay 1 atau toggle relay 2 |

---

## 🔘 5. Fungsi Tombol Fisik (Hardware Buttons)

- **Tombol 1 (`bt1` / GPIO 25)**:
  - Menekan tombol akan berpindah ke halaman OLED berikutnya (`Dashboard` $\rightarrow$ `Monitor Daya` $\rightarrow$ `Info Jadwal`).
- **Tombol 2 (`bt2` / GPIO 26)**:
  - Berganti mode cepat secara berurutan: `AUTO` (sesuai jadwal RTC) $\rightarrow$ `MANUAL ON` (paksa UV nyala terus) $\rightarrow$ `MANUAL OFF` (standby/mati).
- **Tombol 3 (`bt3` / GPIO 27)**:
  - **Tekan Singkat (< 2 detik)**: Menguji coba pemicuan Relay 1 (Zapper pulse).
  - **Tahan ( $\ge$ 2 detik)**: Mereset counter hama kembali ke 0 (disertai konfirmasi `"RESET OK!"` di layar OLED).

---

## 🛠️ 6. Cara Kompilasi dan Upload

### Library Arduino yang Dibutuhkan:
Pastikan library berikut telah terpasang di Arduino IDE / environment Anda:
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
*(Sesuaikan `/dev/ttyUSB0` dengan port serial ESP32 Anda)*

---

## 🔍 7. Troubleshooting

| Gejala | Kemungkinan Penyebab | Solusi |
| :--- | :--- | :--- |
| Layar OLED gelap / tidak tampil teks | Alamat I2C berbeda atau kabel SDA/SCL longgar | Pastikan alamat OLED `0x3C`. Cek koneksi pin D21 (SDA) dan D22 (SCL). |
| Sensor ToF jaraknya selalu `>200cm` atau error | Permukaan sensor kotor atau penutup pelindung belum dilepas | Bersihkan kaca optik sensor VL53L0X dan lepaskan plastik pelindung kuning bawaan sensor. |
| Jam RTC kembali ke tahun default saat reboot | Baterai koin CR2032 pada modul DS3231 habis/belum terpasang | Pasang atau ganti baterai koin CR2032 pada modul DS3231. Lakukan sinkronisasi waktu via Web Server. |
| Relay 1 selalu aktif / terbalik | Modul relay yang digunakan berlogika Active HIGH | Buka web `192.168.4.1`, pada menu *Pengaturan Parameter Sensor*, ubah tipe modul relay menjadi *Active HIGH* lalu simpan. |
| Web Server tidak bisa dibuka | HP terputus dari WiFi SoftAP | Pastikan HP tetap terhubung ke SSID `Perangkap-Hama-ESP32` (matikan opsi "Alihkan ke Data Seluler Otomatis" di setelan WiFi HP Anda). |
