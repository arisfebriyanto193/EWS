# 🦗 ESP32 Smart Pest Trap - Python WebSocket Simulator

Program simulator Python ini dirancang khusus untuk menguji **Website Dashboard IoT Monitoring & Pengendalian Perangkap Hama Cerdas (EWS)**. Program ini berperan sebagai **ESP32 Virtual (klien WebSocket)** yang mengirimkan data sensor telemetri realistis dan merespons perintah kontrol dari Web secara dua arah (*two-way synchronization*).

---

## 🎯 Fitur Simulator

1. **Koneksi WebSocket Lengkap (WS & WSS):**
   - Mendukung koneksi lokal (`ws://localhost:5001/ws`) maupun server online (`wss://hamakusens.elektrodinus.id/ws`).
   - Otomatis melakukan *reconnect* jika jaringan terputus.
   - Mengikuti pola pub/sub topik:
     - **Publish Telemetri:** `traps/{trapId}/telemetry`
     - **Subscribe Perintah:** `traps/{trapId}/command`

2. **Data Sensor Realistis & Masuk Akal (*Sensible Dummy Data*):**
   - **Tegangan Baterai:** 11.8V - 12.8V dengan fluktuasi halus dan penyesuaian penurunan voltase saat blower atau lampu LED menyala.
   - **Arus Pengisian Solar Panel:** Menghasilkan arus saat jam siang (06:00 - 18:00) hingga 550 mA dengan fluktuasi cuaca acak; 0 mA saat malam hari.
   - **Jarak Sensor VL53L0X & Kapasitas Wadah:** Jarak 180 mm saat kosong, dan berkurang realistis seiring bertambahnya populasi hama di wadah tampung (persentase kapasitas 0% - 100%).
   - **Siklus Blower Otomatis:** Ketika hama terdeteksi (baik secara acak maupun manual), blower akan aktif selama durasi yang ditentukan (default 3 detik) untuk menghisap hama, lalu mati secara otomatis.

3. **Sinkronisasi Dua Arah dengan Web Dashboard:**
   - Menerima saklar **Lampu UV** (ON / OFF).
   - Menerima saklar **Blower** (Manual ON / OFF).
   - Menerima pergantian **Mode Kerja** (`otomatis`, `manual`, `otomatis_led`).
   - Menerima pergantian **Preset Spektrum Warna LED** (5 preset RGB).
   - Menerima pengaturan **Jadwal Waktu**, **Interval Rotasi**, **Interval Manual**, dan **Durasi Blower**.
   - Menerima perintah instan: `TRIGGER_ZAP` (hisap manual), `RESET_COUNTER` (reset hitungan), dan `FAST_TELEMETRY`.

4. **Kontrol Interaktif Langsung via Terminal (Keyboard Shortcuts):**
   - Tekan **`H`** atau **`T`** : Memicu deteksi hama masuk (+1 Hama & Blower hisap otomatis).
   - Tekan **`B`** : Toggle saklar Blower ON / OFF.
   - Tekan **`L`** : Toggle saklar Lampu Atraktor UV ON / OFF.
   - Tekan **`M`** : Mengganti mode kerja (`otomatis` -> `manual` -> `otomatis_led`).
   - Tekan **`P`** : Mengganti preset warna LED NeoPixel.
   - Tekan **`R`** : Reset counter hama kembali ke 0.
   - Tekan **`S`** : Memaksa pengiriman telemetri instan ke server.
   - Tekan **`Q`** : Keluar dari simulator.

---

## 🚀 Panduan Penggunaan

### 1. Install Dependensi
Pastikan modul `websockets` sudah terpasang:
```bash
pip install -r requirements.txt
```

### 2. Menjalankan Simulator ke Backend Lokal
Jika Anda sedang menjalankan backend Node.js lokal di port 5001:
```bash
python3 simulator.py
```
*(Default URL: `ws://localhost:5001/ws` dan Device ID: `TRAP-01`)*

### 3. Menjalankan Simulator ke Server Online
Jika ingin menghubungkan langsung ke server IoT cloud EWS:
```bash
python3 simulator.py --url wss://hamakusens.elektrodinus.id/ws --trap-id TRAP-01
```

### 4. Parameter / Opsi CLI Tambahan
| Parameter | Deskripsi | Default |
|-----------|-----------|---------|
| `--url` | Alamat WebSocket Gateway Backend | `ws://localhost:5001/ws` |
| `--trap-id` | ID unik perangkat perangkap | `TRAP-01` |
| `--interval` | Frekuensi pengiriman data telemetri (detik) | `3.0` |
| `--duration` | Durasi aktif blower saat mendeteksi hama (detik) | `3` |
| `--no-auto-pest` | Nonaktifkan deteksi hama acak alami (hanya terpicu via tombol keyboard/web) | `False` |

**Contoh kustom:**
```bash
# Menjalankan untuk TRAP-02 dengan interval 5 detik tanpa trigger hama acak:
python3 simulator.py --trap-id TRAP-02 --interval 5 --no-auto-pest
```

---

## 📊 Contoh Tampilan Terminal Saat Berjalan
```text
╔══════════════════════════════════════════════════════════════════════════╗
║     🦗 SIMULATOR PERANGKAP HAMA PINTAR (SMART PEST TRAP) ESP32 🦗        ║
╚══════════════════════════════════════════════════════════════════════════╝
  Target Server   : ws://localhost:5001/ws
  Trap Device ID  : TRAP-01
  Interval Kirim  : 3.0 detik
  Simulasi Alami  : Aktif (Hama Masuk Acak)
--------------------------------------------------------------------------
[19:50:12] [ CONNECT ] Menghubungkan ke WebSocket Gateway: ws://localhost:5001/ws ...
[19:50:12] [ ONLINE  ] Terhubung ke Server EWS! Trap ID: TRAP-01
[19:50:12] [SUBSCRIBE] Berlangganan ke topik perintah: traps/TRAP-01/command
[19:50:12] [ INIT-TX ] Telemetri awal berhasil disinkronkan ke Web.
[19:50:15] [TELEMETRY] Terkirim ke Server -> V: 12.61V | Solar: 450mA | Hama: 12 | Wadah: 3% | Blower: OFF | LED: ON (UV / Ungu (395nm))
[19:50:18] [  HAMA!  ] Sensor Alami VL53L0X / PIR mendeteksi hama masuk! Total Hama: 13 | Blower AKTIF selama 3 detik.
[19:50:18] [TELEMETRY] Terkirim ke Server -> V: 12.36V | Solar: 450mA | Hama: 13 | Wadah: 3% | Blower: ON | LED: ON (UV / Ungu (395nm))
[19:50:21] [ BLOWER  ] Blower dinonaktifkan (durasi hisap selesai).
[19:50:25] [ COMMAND ] Menerima pesan dari Web: {"topic":"traps/TRAP-01/command","payload":{"uvLedStatus":false}}
[19:50:25] [ CONTROL ] Saklar UV LED diubah -> OFF
[19:50:25] [TELEMETRY] Terkirim ke Server -> V: 12.62V | Solar: 450mA | Hama: 13 | Wadah: 3% | Blower: OFF | LED: OFF (UV / Ungu (395nm))
```
