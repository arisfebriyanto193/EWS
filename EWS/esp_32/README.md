# Panduan Firmware ESP32-S3 - Landslide Early Warning System (EWS)

Firmware ini dirancang khusus untuk mikrokontroler **ESP32-S3** (ESP32S3N16R8) sesuai dengan skema PCB `Schematic_EWS45_2026-09-28.pdf` dan terintegrasi penuh dengan **Backend Express** serta **Frontend Next.js** melalui protokol WebSocket dua arah.

---

## 📌 1. Pemetaan Pin Hardware (Berdasarkan Skema PCB)

| Komponen / Sensor | Pin Skema | GPIO ESP32-S3 | Mode I/O | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| **Relay 1 (Sirine 12V)** | `IN1` | **GPIO 3** | OUTPUT | Sirine darurat 110-120dB (Active-LOW / Active-HIGH) |
| **Relay 2 (Lampu Strobo)** | `IN2` | **GPIO 46** | OUTPUT | Lampu strobo peringatan darurat |
| **Sensor Hujan (H2)** | `Dhujan` | **GPIO 5** | INPUT_PULLUP | Digital comparator LM393 (LOW saat basah/hujan) |
| **Sensor Getaran 801S** | `Dgetar` | **GPIO 7** | INPUT_PULLUP | Sensor getaran piezoelektrik dengan interrupt pulsa |
| **Sensor Kelembapan Tanah** | `Ktanah` | **GPIO 17** | ANALOG (ADC2) | Pin A0 analog kelembapan tanah (kedalaman lereng) |
| **Layar OLED 1.3" (SDA)** | `SDAoled` | **GPIO 8** | I2C (Bus 0) | Data I2C Layar OLED 128x64 |
| **Layar OLED 1.3" (SCL)** | `SCLoled` | **GPIO 9** | I2C (Bus 0) | Clock I2C Layar OLED 128x64 |
| **Inclinometer MPU-6050 (SDA)** | `SDAMpu` | **GPIO 11** | I2C (Bus 1) | Data I2C Inclinometer dua sumbu (Pitch & Roll) |
| **Inclinometer MPU-6050 (SCL)** | `SCLMpu` | **GPIO 12** | I2C (Bus 1) | Clock I2C Inclinometer dua sumbu |
| **Monitor Daya INA226 (SDA)** | `SDA2` | **GPIO 13** | Soft-I2C | Data monitor aki 12V & panel surya 30Wp |
| **Monitor Daya INA226 (SCL)** | `SCL2` | **GPIO 14** | Soft-I2C | Clock monitor aki 12V & panel surya 30Wp |

---

## 📡 2. Penyesuaian Topik WebSocket (Backend & Frontend-Next)

Format topik disesuaikan secara presisi dengan sistem backend Express (`websocketService.js`) dan Frontend Next.js (`websocket.ts` & `EWSApp.tsx`):

### A. Topik Perintah Kendali Masuk (Subscribe)
* **Topik:** `ews/EWS-01/command`
* **Format Pesan:**
  ```json
  { "command": "TRIGGER_ALARM", "type": "bahaya" }
  ```
  * `TRIGGER_ALARM` (`bahaya`): Mengaktifkan Sirine (GPIO 3) dan Lampu Strobo (GPIO 46).
  * `TRIGGER_ALARM` (`siaga`): Mengaktifkan Lampu Strobo (GPIO 46).
  * `RESET_ALARM`: Mematikan Sirine dan Strobo kembali ke kondisi normal.
  * `TEST_BUZZER`: Menyalakan sirine selama 2 detik untuk uji coba audio.

### B. Topik Telemetri Keluar (Publish)
ESP32 mengirimkan data telemetri melalui 2 format secara simultan:
1. **JSON Bundle Lengkap** ke topik `ews/EWS-01/telemetry`:
   Tersimpan otomatis ke database MySQL `ews_sensor_logs`, mengevaluasi batas bahaya/siaga, dan memicu notifikasi bot Telegram.
2. **Format RAW Per-Data Sensor** (`topik|nilai`):
   * `ews/EWS-01/pitch|<derajat>` (Kemiringan lereng X)
   * `ews/EWS-01/roll|<derajat>` (Kemiringan lateral Y)
   * `ews/EWS-01/soil_moisture|<persen>` (Kelembapan pori tanah)
   * `ews/EWS-01/rainfall_rate|<mm/jam>` (Intensitas curah hujan)
   * `ews/EWS-01/vibration|<g>` (Amplitudo getaran)
   * `ews/EWS-01/battery_voltage|<Volt>` (Tegangan aki VRLA)
   * `ews/EWS-01/solar_current|<mA>` (Arus pengisian panel surya)

---

## 🛠️ 3. Pengaturan Arduino IDE

### A. Library yang Dibutuhkan
Buka menu **Tools > Manage Libraries...** di Arduino IDE dan instal:
1. **WebSockets** oleh Markus Sattler
2. **ArduinoJson** oleh Benoit Blanchon (Versi 6 atau 7)
3. **Adafruit SSD1306** & **Adafruit GFX Library** (Untuk layar OLED 1.3")

### B. Pengaturan Board
Pilih Board: **ESP32S3 Dev Module**
* **Flash Size:** 16MB (128Mb)
* **Partition Scheme:** 16MB (3MB APP / 9.9MB FAT)
* **PSRAM:** OPI PSRAM (Jika modul N16R8)
* **Upload Speed:** 921600 atau 115200
* **USB CDC On Boot:** Enabled (jika menggunakan USB bawaan ESP32-S3)
