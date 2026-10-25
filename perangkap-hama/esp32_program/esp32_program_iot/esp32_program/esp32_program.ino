/**
 * ==============================================================================
 * SISTEM PENGENDALI & PERANGKAP HAMA OTOMATIS BERBASIS IOT (SMART PEST TRAP)
 * FIRMWARE RESMI ESP32 - REFAKTORISASI RINGAN & HEMAT SUMBER DAYA
 * ==============================================================================
 * Fitur Utama:
 * 1. Web Server Lokal (HTTP Port 80) & SoftAP untuk monitoring & konfigurasi.
 * 2. Pembacaan 4 Modul I2C:
 *    - Layar OLED SSD1306 (0x3C)
 *    - Real Time Clock DS3231 (0x68)
 *    - Sensor Tegangan & Arus Baterai INA226 (0x40)
 *    - Sensor Jarak Time-of-Flight VL53L0X (0x29)
 * 3. Lampu Atraktor Hama LED WS2812B NeoPixel dengan 5 Preset Spektrum Warna:
 *    - Bisa diganti & diedit nilai RGB via Web Browser & Web Dashboard EWS.
 * 4. Navigasi 2 Tombol Fisik:
 *    - Tombol 1 (GPIO 25): Pindah / Ganti Preset Warna (0 -> 1 -> 2 -> 3 -> 4 -> 0).
 *    - Tombol 2 (GPIO 26): Ganti Mode Operasional:
 *        * MANUAL       : Aktif terus-menerus.
 *        * OTOMATIS     : Aktif sesuai jadwal jam RTC dengan preset terpilih.
 *        * OTOMATIS-LED : Aktif sesuai jadwal RTC, warna LED berganti otomatis
 *                         setiap interval waktu yang ditentukan (menit).
 *        * SLEEP        : Tahan tombol 2 detik untuk masuk Deep Sleep.
 *    - Tombol 3 (GPIO 27): Reset counter hama (tahan 2 detik) / manual test zap.
 * 5. Mode SLEEP Benar-Benar Mematikan Sistem (True Deep Sleep):
 *    - Matikan LED WS2812B, matikan relay zapper, matikan layar OLED, matikan WiFi.
 *    - ESP32 masuk Deep Sleep dan HANYA bangun saat Tombol Fisik ditekan!
 * 6. Integrasi IoT Real-Time ke Web EWS (WebSocket Client):
 *    - Mengirim seluruh telemetri ke topik: traps/{trapId}/telemetry
 *    - Menerima kontrol jarak jauh dari topik: traps/{trapId}/command
 * ==============================================================================
 */

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <Adafruit_NeoPixel.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_VL53L0X.h>
#include <RTClib.h>
#include <INA226_WE.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "esp_sleep.h"

// ==============================================================================
// 1. PIN DEFINITIONS SESUAI SKEMATIK PCB
// ==============================================================================
#define PIN_I2C_SDA         21   // D21 - I2C SDA
#define PIN_I2C_SCL         22   // D22 - I2C SCL

#define PIN_RELAY_1         13 
#define PIN_RELAY_2         2   // in1 - Relay 1 (Blower Penghisap Hama)
#define PIN_WS2812B         12   // in2 / D12 - Data LED WS2812B Lampu Atraktor
#define NUM_WS2812B         30   // Jumlah mata LED NeoPixel (sesuaikan strip Anda)

#define PIN_BT1             25   // Tombol 1: Ganti Preset Warna
#define PIN_BT2             26   // Tombol 2: Ganti Mode / Bangun dari Sleep
#define PIN_BT3             27   // Tombol 3: Reset Counter Hama / Test Zap

#define PIN_MODEM_TRIGGER   16   // GPIO 16 - Trigger Modem WiFi (aktif LOW)

// Alamat I2C
#define OLED_I2C_ADDR       0x3C
#define INA226_I2C_ADDR     0x40
#define DS3231_I2C_ADDR     0x68
#define VL53_I2C_ADDR       0x29

#define SCREEN_WIDTH        128
#define SCREEN_HEIGHT       64
#define OLED_RESET          -1

// ==============================================================================
// 2. STRUKTUR DATA & MODE OPERASIONAL
// ==============================================================================
enum TrapMode {
  MODE_MANUAL = 0,        // LED nyala terus, blower trigger sensor VL53
  MODE_OTOMATIS = 1,      // LED nyala sesuai jadwal RTC, blower trigger sensor VL53
  MODE_OTOMATIS_LED = 2,  // LED nyala jadwal RTC + warna berganti tiap X menit, blower trigger sensor VL53
  MODE_SLEEP = 3          // Sistem mati total (Deep Sleep)
};

struct ColorPreset {
  char name[24];
  uint8_t r;
  uint8_t g;
  uint8_t b;
};

// 5 Preset Default berdasarkan fototaksis serangga & riset hama pertanian
ColorPreset presets[5] = {
  {"Wereng (Biru-UV)",     30,   0, 255}, // P1: 400-450 nm fototaksis wereng
  {"Kutu Kebul (Kuning)", 255, 190,   0}, // P2: 520-560 nm reflektansi kuning
  {"Penggerek (Cyan)",      0, 220, 255}, // P3: 460-490 nm ngengat batang
  {"Ulat Grayak (Hijau)",   0, 255,  30}, // P4: 510-530 nm fotoreseptor ulat
  {"Putih Terang (Umum)", 255, 255, 255}  // P5: Broad spectrum nokturnal
};

// ==============================================================================
// 3. VARIABEL SISTEM & STATE
// ==============================================================================
String trapId   = "TRAP-01";
String trapName = "Perangkap Hama 01 - Kebun Kopi";
TrapMode currentMode = MODE_OTOMATIS;
uint8_t activePreset = 0;

// Konfigurasi Mode Cerdas
bool ledRunning = false;             // Jika true: LED berganti warna bergiliran sesuai interval. Jika false: 1 warna statis.
String blowerMode = "sensor";        // "sensor" (VL53L0X) atau "time" (interval berkala)
unsigned long lastBlowerTimeCycle = 0; // Waktu siklus terakhir untuk blowerMode == "time"

// Jadwal Operasi (Format 24 Jam)
uint8_t startHour = 18;
uint8_t startMin  = 0;
uint8_t endHour   = 6;
uint8_t endMin    = 0;

// Interval Ganti Warna (Menit) untuk Mode LED Running
uint16_t ledRotationInterval = 15;

// Pengaturan Blower: Durasi nyala, cooldown sensor & interval berkala
uint16_t manualIntervalMin   = 15; // Interval siklus blower saat mode waktu (menit)
uint16_t manualDurationSec   = 3;  // Durasi blower menyala saat deteksi hama / siklus waktu (detik)
uint16_t sensorCooldownSec   = 5;  // Jeda sensor setelah blower mati sebelum bisa mendeteksi lagi (detik)
unsigned long lastBlowerStop = 0;  // Waktu blower mati (untuk menghitung cooldown sensor)

// Pengaturan Modem WiFi Trigger (GPIO 16) - Bisa diatur via Web Server
unsigned long modemPulseMs       = 3000;    // Durasi sinyal LOW untuk trigger modem (ms) - default 3 detik
unsigned long modemBootDelayMs   = 30000;   // Delay sebelum trigger pertama saat boot (ms) - default 30 detik
unsigned long modemRetryIntervalMs = 30000; // Interval retry trigger modem (ms) - default 30 detik
unsigned long modemWaitWifiMs     = 120000; // Tunggu WiFi setelah trigger pertama (ms) - default 2 menit

// Parameter Deteksi Hama
uint16_t distThreshold_mm = 150;   // Ambang batas jarak maksimal deteksi hama (mm)
uint16_t distMin_mm       = 10;    // Batas jarak minimal deteksi hama (mm) filter noise
uint32_t pestCounter      = 0;     // Total hama terperangkap
unsigned long blowerOffTime = 0;   // Waktu mati otomatis blower (ms timestamp)
unsigned long lastBlowerTrigger = 0; // Waktu trigger terakhir (untuk cooldown)

// Status Sensor & Hardware
bool oledReady   = false;
bool rtcReady    = false;
bool inaReady    = false;
bool vl53Ready   = false;

float busVoltage_V  = 12.60;
float current_mA    = 0.0;
float power_mW      = 0.0;
uint16_t currentDistance = 0;
bool ledIsOn        = false;
bool zapperActive   = false; // Status relay blower saat ini (ON/OFF)
bool uvLedEnabled   = true;  // Saklar ON/OFF LED dari Web (penarik hama)
bool blowerEnabled  = false; // Blower sedang aktif karena trigger sensor

// Waktu RTC
uint8_t rtcHour = 0, rtcMinute = 0, rtcSecond = 0;
uint16_t rtcYear = 2026;
uint8_t rtcMonth = 10, rtcDay = 12;

// Kredensial WiFi & IoT Server EWS (Dapat diatur dinamis via Web Server, disimpan di NVS tanpa hardcode)
String wifiSsid       = "test";
String wifiPass       = "11111111";
String wsHost         = "hamakusens.elektrodinus.id";
int    wsPort         = 443;
String wsPath         = "/ws";
bool   wsUseSsl       = true;

// Variabel Kontrol Reboot Tertunda (non-blocking agar respons HTTP terkirim ke klien)
volatile bool shouldRestart = false;
unsigned long restartTriggerTime = 0;

// Konfigurasi Interval Telemetri Cerdas & Hemat Daya
const unsigned long REALTIME_TELEMETRY_INTERVAL   = 3000;    // 3 detik saat Web dibuka / mode cepat on-demand
const unsigned long LOW_POWER_TELEMETRY_INTERVAL  = 300000;  // 5 menit (300.000 ms) mode normal / hemat daya
const unsigned long CLIENT_ACTIVITY_TIMEOUT       = 30000;   // 30 detik: durasi mode cepat sebelum kembali ke 5 menit

volatile unsigned long lastClientActivityTime      = 0;
volatile bool forceTelemetryPublish               = false;

// Timing Non-blocking
unsigned long lastSensorRead       = 0;
unsigned long lastOledUpdate       = 0;
unsigned long lastTelemetryPub     = 0;
unsigned long lastLedRotate        = 0;
unsigned long lastManualCycleStart = 0; // (legacy, tidak dipakai untuk LED lagi)
unsigned long zapOffTime           = 0; // (legacy alias untuk blowerOffTime)

// Modem WiFi Trigger (GPIO 16)
bool modemFirstTriggerDone     = false;  // Apakah trigger pertama (30 detik setelah boot) sudah dilakukan
bool modemPulseActive          = false;  // Apakah sinyal LOW sedang aktif (pulse sedang berjalan)
unsigned long modemPulseStart  = 0;      // Waktu mulai pulse LOW
unsigned long modemFirstTriggerTime = 0; // Waktu trigger pertama selesai
unsigned long modemLastRetryTrigger = 0; // Waktu retry trigger terakhir
bool modemRetryMode            = false;  // Sudah masuk mode retry (setelah 2 menit gagal WiFi)

// Status & State Pengecekan WiFi Sebelum Trigger Modem
enum ModemCheckState {
  MODEM_CHECK_IDLE = 0,       // Tidak sedang melakukan pengecekan
  MODEM_CHECK_SCANNING,       // Sedang memindai jaringan WiFi sekitar secara asinkron
  MODEM_CHECK_CONNECTING      // WiFi tersimpan ditemukan, sedang mencoba menghubungkan ulang
};

ModemCheckState modemCheckState   = MODEM_CHECK_IDLE;
unsigned long modemCheckStartTime = 0;
bool lastWifiConnectedState       = false; // Untuk mendeteksi transisi status WiFi (terhubung/terputus)

// NTP Time Sync
bool ntpSynced                 = false;  // Apakah waktu sudah disinkronkan via NTP
bool ntpSyncAttempted          = false;  // Apakah sudah pernah mencoba sync di loop (tracking transisi WiFi)

// Debounce Tombol
unsigned long bt1LastPress = 0;
unsigned long bt2LastPress = 0;
unsigned long bt2PressStart = 0;
bool bt2IsHolding = false;
unsigned long bt3LastPress = 0;

// ==============================================================================
// 4. INSTANSIASI OBJEK HARDWARE & SERVICES
// ==============================================================================
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Adafruit_VL53L0X sensorVL53;
RTC_DS3231 rtc;
INA226_WE ina226(INA226_I2C_ADDR);
Adafruit_NeoPixel strip(NUM_WS2812B, PIN_WS2812B, NEO_GRB + NEO_KHZ800);
WebServer server(80);
DNSServer dnsServer;
bool dnsRunning = false;
WebSocketsClient webSocket;
Preferences prefs;

// ==============================================================================
// 5. DEKLARASI PROTOTIPE FUNGSI
// ==============================================================================
void loadPreferences();
void savePreferences();
void initHardware();
void readSensors();
void updateActuators();
void updateOledDisplay();
void handlePhysicalButtons();
void enterDeepSleep();
void applyLedColor(uint8_t r, uint8_t g, uint8_t b);
void turnOffLed();
bool isWithinSchedule();
void setupWebServer();
void setupWebSocket();
void sendTelemetryToEws();
void handleWsMessage(uint8_t *payload, size_t length);
void syncTimeFromNTP();
void startModemPulse();
void triggerZapperCycle();

// Helper untuk mengirim sinyal pulse LOW ke pin trigger modem (GPIO 16)
void startModemPulse() {
  modemPulseActive = true;
  modemPulseStart = millis();
  digitalWrite(PIN_MODEM_TRIGGER, LOW);
  Serial.println("[Modem] Trigger modem aktif! Mengirim sinyal LOW ke pin GPIO 16 (3 detik)...");
}

// ==============================================================================
// 6. SETUP & LOOP UTAMA
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n=======================================================");
  Serial.println("  ESP32 SMART PEST TRAP & MONITORING IOT EWS STARTING");
  Serial.println("=======================================================");

  // Periksa apakah bangun dari Deep Sleep karena tombol ditekan
  esp_sleep_wakeup_cause_t wakeup_reason = esp_sleep_get_wakeup_cause();
  if (wakeup_reason == ESP_SLEEP_WAKEUP_EXT0 || wakeup_reason == ESP_SLEEP_WAKEUP_EXT1) {
    Serial.println(" Bangun dari Deep Sleep karena tombol fisik ditekan!");
  }

  // Inisialisasi Pin GPIO
  pinMode(PIN_RELAY_1, OUTPUT);
  pinMode(PIN_RELAY_2, OUTPUT);
  digitalWrite(PIN_RELAY_1, LOW);
  digitalWrite(PIN_RELAY_2, LOW);  // Blower default MATI saat pertama kali nyala

  pinMode(PIN_BT1, INPUT_PULLUP);
  pinMode(PIN_BT2, INPUT_PULLUP);
  pinMode(PIN_BT3, INPUT_PULLUP);

  // Inisialisasi Pin Trigger Modem WiFi (GPIO 16)
  // Default HIGH (modem tidak di-trigger), trigger dengan sinyal LOW
  pinMode(PIN_MODEM_TRIGGER, OUTPUT);
  digitalWrite(PIN_MODEM_TRIGGER, HIGH);
  Serial.println("[Modem] Pin GPIO 16 siap, ketersediaan WiFi tersimpan akan dicek sebelum trigger");

  // Inisialisasi LED NeoPixel WS2812B
  strip.begin();
  strip.setBrightness(100);
  turnOffLed();

  // Load Konfigurasi dari Non-Volatile Storage (Preferences)
  loadPreferences();

  // Inisialisasi Bus I2C & Seluruh 4 Modul
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 100000);
  initHardware();

  // Tampilkan splash screen di OLED
  if (oledReady) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(10, 10);
    display.println("SMART PEST TRAP");
    display.setCursor(10, 25);
    display.print("ID: ");
    display.println(trapId);
    display.setCursor(10, 40);
    display.println("Menghubungkan WiFi...");
    display.display();
  }

  // Konfigurasi Mode WiFi: Hubungkan ke WiFi STA terlebih dahulu (maks 8 detik)
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // Matikan WiFi Modem Sleep agar WebServer merespons instan (<10ms)
  esp_wifi_set_ps(WIFI_PS_NONE);
  bool wifiConnected = false;

  if (wifiSsid.length() > 0) {
    Serial.print(" Menghubungkan ke WiFi: ");
    Serial.println(wifiSsid);
    WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());

    unsigned long startAttemptTime = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startAttemptTime < 8000)) {
      delay(250);
      Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      wifiConnected = true;
      modemFirstTriggerDone = true; // Sudah terhubung, jangan picu modem trigger saat boot delay
      lastWifiConnectedState = true;
      Serial.print(" Terhubung ke WiFi! IP: ");
      Serial.println(WiFi.localIP());

      // Sinkronkan waktu dari NTP segera setelah terhubung ke internet
      syncTimeFromNTP();
    } else {
      Serial.println(" Gagal terhubung ke WiFi dalam 8 detik.");
    }
  }

  // Jika gagal terhubung ke WiFi, aktifkan SoftAP
  if (!wifiConnected) {
    // Putuskan pending connection STA agar radio tidak hopping mencari router
    WiFi.disconnect(false, true);
    WiFi.mode(WIFI_AP_STA); // Mode AP_STA agar scanning WiFi tetap berfungsi
    String apName = "Trap-" + trapId;
    WiFi.softAP(apName.c_str(), "12345678");
    WiFi.setSleep(false);
    esp_wifi_set_ps(WIFI_PS_NONE);
    Serial.print(" Mengaktifkan SoftAP Cadangan: ");
    Serial.print(apName);
    Serial.print(" | IP AP: ");
    Serial.println(WiFi.softAPIP());

    // Aktifkan Captive Portal DNS
    dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
    dnsServer.start(53, "*", WiFi.softAPIP());
    dnsRunning = true;
    Serial.println(" Captive Portal DNS Aktif di Port 53");
  }

  // Setup Web Server Lokal HTTP
  setupWebServer();
  server.begin();
  Serial.println(" Web Server HTTP lokal siap di port 80");

  // Inisialisasi WebSocket hanya jika sudah terhubung ke WiFi STA dengan akses internet
  if (wifiConnected) {
    setupWebSocket();
  }

  // Pastikan blower MATI saat pertama kali boot, lalu terapkan warna LED
  blowerEnabled = false;
  zapperActive = false;
  digitalWrite(PIN_RELAY_1, LOW);
  digitalWrite(PIN_RELAY_2, LOW); 
  updateActuators();
  if (wifiConnected) {
    sendTelemetryToEws(); // Publish status awal ke server jika terhubung
  }
}

void loop() {
  unsigned long now = millis();

  // 1. Tangani Request DNS untuk Captive Portal (proses beberapa paket agar antrean tidak macet)
  if (dnsRunning) {
    for (int i = 0; i < 3; i++) {
      dnsServer.processNextRequest();
    }
  }

  // 2. Tangani Request Web Server Lokal
  server.handleClient();

  // 3. Tangani Komunikasi WebSocket Real-time IoT HANYA jika terhubung ke WiFi STA!
  // Mencegah DNS gethostbyname timeout 5 detik yang membuat WebServer freeze saat di SoftAP
  static bool wsInitDone = false;
  if (WiFi.status() == WL_CONNECTED) {
    if (!wsInitDone) {
      setupWebSocket();
      wsInitDone = true;
    }
    webSocket.loop();
  } else {
    wsInitDone = false;
  }

  // 4. Baca Input Tombol Fisik (Ganti Preset, Ganti Mode, Reset)
  handlePhysicalButtons();

  // 5. Pembacaan Rutin Sensor I2C (INA226, DS3231, VL53L0X) setiap 200ms
  if (now - lastSensorRead >= 200) {
    lastSensorRead = now;
    readSensors();
    updateActuators();
  }

  // 6. Perbarui Layar OLED SSD1306 setiap 500ms
  if (now - lastOledUpdate >= 500) {
    lastOledUpdate = now;
    updateOledDisplay();
  }

  // 7. Adaptive Telemetry: Kirim Telemetri IoT ke Server EWS (hanya jika WiFi terhubung)
  if (WiFi.status() == WL_CONNECTED) {
    bool isClientActive = (lastClientActivityTime > 0) && ((now - lastClientActivityTime) < CLIENT_ACTIVITY_TIMEOUT);
    unsigned long targetInterval = isClientActive ? REALTIME_TELEMETRY_INTERVAL : LOW_POWER_TELEMETRY_INTERVAL;

    bool shouldPublish = false;
    if (forceTelemetryPublish) {
      shouldPublish = true;
      forceTelemetryPublish = false;
    } else if (lastTelemetryPub == 0 || (now - lastTelemetryPub >= targetInterval)) {
      shouldPublish = true;
    }

    if (shouldPublish) {
      lastTelemetryPub = now;
      sendTelemetryToEws();
    }
  }

  // 7. Auto Turn-off Blower setelah durasi habis
  if (blowerEnabled && (now >= blowerOffTime)) {
    digitalWrite(PIN_RELAY_1, LOW);
    digitalWrite(PIN_RELAY_2, LOW);
    blowerEnabled = false;
    zapperActive = false;
    lastBlowerStop = now;
    Serial.println(" [Blower] Durasi habis, blower MATI");
  }

  // 8. TRIGGER MODEM WiFi via GPIO 16 (Aktif LOW) DENGAN CEK KETERSEDIAAN & RECONNECT
  // Alur Baru Sesuai Kebutuhan:
  //   - Saat di mode AP (WiFi belum terhubung), sebelum trigger modem dijalankan:
  //       1. Cek apakah WiFi tersimpan (wifiSsid) tersedia di sekitar (scan async).
  //       2. Jika tersedia: coba hubungkan ulang ke WiFi tersebut (timeout 8 detik).
  //       3. Jika berhasil terhubung: BATALKAN trigger modem (tidak usah di-trigger).
  //       4. Jika belum/gagal terhubung atau SSID tidak ditemukan: baru trigger modem!
  //   - Begitu WiFi tersambung kapan saja, mode retry dihentikan & trigger dibatalkan.

  // Deteksi transisi terputusnya WiFi saat sistem sedang berjalan
  bool currentWifiConnected = (WiFi.status() == WL_CONNECTED);
  if (!currentWifiConnected && lastWifiConnectedState) {
    Serial.println(" [WiFi] Koneksi WiFi terputus! Memulai hitung mundur pantau modem...");
    modemFirstTriggerTime = now;
    modemRetryMode = false;
  }
  lastWifiConnectedState = currentWifiConnected;

  if (modemPulseActive) {
    // Sedang mengirim pulse LOW, cek apakah durasi pulse sudah selesai
    if (now - modemPulseStart >= modemPulseMs) {
      digitalWrite(PIN_MODEM_TRIGGER, HIGH); // Kembalikan ke HIGH (selesai trigger)
      modemPulseActive = false;
      Serial.println("[Modem] Pulse LOW selesai, pin GPIO 16 kembali HIGH");
    }
  } else if (currentWifiConnected) {
    // Jika WiFi sudah terhubung:
    // Jika ada pengecekan atau scan yang masih berjalan, bersihkan dan batalkan trigger
    if (modemCheckState == MODEM_CHECK_SCANNING) {
      WiFi.scanDelete();
    }
    if (modemCheckState != MODEM_CHECK_IDLE) {
      Serial.println("[OK] [Modem] WiFi terhubung! Pengecekan selesai, trigger modem DIBATALKAN.");
      modemCheckState = MODEM_CHECK_IDLE;
    }
    if (!modemFirstTriggerDone) {
      modemFirstTriggerDone = true;
    }
    if (modemRetryMode) {
      modemRetryMode = false;
      Serial.println("[Modem] WiFi terhubung! Retry modem dihentikan.");
    }
  } else {
    // WiFi saat ini BELUM terhubung (misal dalam mode AP)
    if (modemCheckState == MODEM_CHECK_IDLE) {
      // 1. Masuk mode retry jika sudah lewat waktu tunggu (2 menit) dari trigger pertama / putus koneksi
      if (modemFirstTriggerDone && !modemRetryMode && (now - modemFirstTriggerTime >= modemWaitWifiMs)) {
        modemRetryMode = true;
        modemLastRetryTrigger = 0; // Agar langsung trigger pada siklus ini
        Serial.println("[Modem] 2 menit tanpa WiFi, masuk mode retry...");
      }

      // 2. Evaluasi apakah sudah waktunya trigger (trigger pertama 30s boot delay ATAU interval retry 30s)
      bool needFirstTrigger = (!modemFirstTriggerDone && (now >= modemBootDelayMs));
      bool needRetryTrigger = (modemRetryMode && (modemLastRetryTrigger == 0 || (now - modemLastRetryTrigger >= modemRetryIntervalMs)));

      if (needFirstTrigger || needRetryTrigger) {
        // Sebelum trigger modem, cek terlebih dahulu apakah WiFi tersimpan tersedia
        if (wifiSsid.length() == 0) {
          Serial.println("[Modem] Tidak ada SSID WiFi tersimpan, langsung trigger modem...");
          if (!modemFirstTriggerDone) {
            modemFirstTriggerDone = true;
            modemFirstTriggerTime = now;
          } else {
            modemLastRetryTrigger = now;
          }
          startModemPulse();
        } else {
          Serial.printf("[Modem] %s: Memeriksa ketersediaan WiFi tersimpan '%s' sebelum trigger...\n",
                        needRetryTrigger ? "Retry Trigger" : "Trigger Pertama", wifiSsid.c_str());

          // Mulai scan WiFi secara asinkron agar tidak memblokir Web Server & sensor
          int16_t scanStatus = WiFi.scanComplete();
          if (scanStatus != WIFI_SCAN_RUNNING) {
            WiFi.scanDelete();
            WiFi.scanNetworks(true, false);
          }
          modemCheckState = MODEM_CHECK_SCANNING;
          modemCheckStartTime = now;
        }
      }
    } else if (modemCheckState == MODEM_CHECK_SCANNING) {
      // Sedang menunggu hasil pemindaian jaringan WiFi sekitar
      int16_t scanStatus = WiFi.scanComplete();

      if (scanStatus == WIFI_SCAN_RUNNING) {
        // Cek batas waktu scan (maksimal 6 detik)
        if (now - modemCheckStartTime >= 6000) {
          Serial.println("[WARN] [Modem] Scan WiFi timeout (>6s). WiFi belum terhubung, memicu modem...");
          if (!modemFirstTriggerDone) {
            modemFirstTriggerDone = true;
            modemFirstTriggerTime = now;
          } else {
            modemLastRetryTrigger = now;
          }
          modemCheckState = MODEM_CHECK_IDLE;
          startModemPulse();
        }
      } else if (scanStatus == WIFI_SCAN_FAILED || scanStatus < 0) {
        Serial.println("[WARN] [Modem] Scan WiFi gagal. WiFi belum terhubung, memicu modem...");
        if (!modemFirstTriggerDone) {
          modemFirstTriggerDone = true;
          modemFirstTriggerTime = now;
        } else {
          modemLastRetryTrigger = now;
        }
        modemCheckState = MODEM_CHECK_IDLE;
        startModemPulse();
      } else {
        // Scan selesai, periksa apakah WiFi tersimpan (wifiSsid) ada di sekitar
        bool ssidFound = false;
        int rssiFound = -100;
        for (int i = 0; i < scanStatus; ++i) {
          if (WiFi.SSID(i) == wifiSsid) {
            ssidFound = true;
            rssiFound = WiFi.RSSI(i);
            break;
          }
        }
        WiFi.scanDelete(); // Bebaskan memori buffer scan

        if (ssidFound) {
          Serial.printf("[Modem] WiFi tersimpan '%s' TERSEDIA (RSSI: %d dBm)! Mencoba hubungkan ulang...\n",
                        wifiSsid.c_str(), rssiFound);
          WiFi.disconnect(false);
          WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
          modemCheckState = MODEM_CHECK_CONNECTING;
          modemCheckStartTime = now;
        } else {
          Serial.printf("[ERROR] [Modem] WiFi tersimpan '%s' TIDAK TERSEDIA di sekitar.\n", wifiSsid.c_str());
          Serial.println("[Modem] Belum terhubung, menjalankan trigger modem via GPIO 16...");
          if (!modemFirstTriggerDone) {
            modemFirstTriggerDone = true;
            modemFirstTriggerTime = now;
          } else {
            modemLastRetryTrigger = now;
          }
          modemCheckState = MODEM_CHECK_IDLE;
          startModemPulse();
        }
      }
    } else if (modemCheckState == MODEM_CHECK_CONNECTING) {
      // Sedang mencoba menghubungkan ulang ke WiFi tersimpan yang terdeteksi
      if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("[OK] [Modem] BERHASIL TERHUBUNG ke WiFi '%s'!\n", wifiSsid.c_str());
        Serial.println("[Modem] Karena WiFi sudah terhubung, trigger modem DIBATALKAN.");
        if (!modemFirstTriggerDone) {
          modemFirstTriggerDone = true;
        }
        modemRetryMode = false;
        modemCheckState = MODEM_CHECK_IDLE;
      } else if (now - modemCheckStartTime >= 8000) {
        // Timeout 8 detik: WiFi terdeteksi namun gagal terkoneksi (misal auth timeout/router belum siap)
        Serial.println("[ERROR] [Modem] Timeout koneksi ulang (8 detik). WiFi belum berhasil terhubung.");
        Serial.println("[Modem] Menjalankan trigger modem via GPIO 16...");
        WiFi.disconnect(false); // Hentikan attempt agar tidak mengganggu SoftAP
        if (!modemFirstTriggerDone) {
          modemFirstTriggerDone = true;
          modemFirstTriggerTime = now;
        } else {
          modemLastRetryTrigger = now;
        }
        modemCheckState = MODEM_CHECK_IDLE;
        startModemPulse();
      }
    }
  }

  // 9. SINKRONISASI WAKTU NTP SAAT WiFi BARU TERHUBUNG
  // Deteksi transisi WiFi: dari belum tersambung -> tersambung -> langsung sync NTP
  if (WiFi.status() == WL_CONNECTED && !ntpSyncAttempted) {
    ntpSyncAttempted = true;
    if (!ntpSynced) {
      syncTimeFromNTP();
    }
  } else if (WiFi.status() != WL_CONNECTED) {
    // Reset flag jika WiFi terputus, agar sync ulang saat reconnect
    ntpSyncAttempted = false;
  }

  // 10. Eksekusi Restart ESP32 Tertunda (dipicu dari Web Dashboard)
  if (shouldRestart && (now - restartTriggerTime >= 1000)) {
    Serial.println("Merestart ESP32...");
    ESP.restart();
  }
}

// ==============================================================================
// 7. INISIALISASI HARDWARE & SENSOR
// ==============================================================================
void initHardware() {
  // 1. OLED SSD1306 (0x3C)
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    oledReady = true;
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    Serial.println("[OK] OLED SSD1306 (0x3C) Siap");
  } else {
    Serial.println("[WARN] OLED SSD1306 tidak terdeteksi");
  }

  // 2. RTC DS3231 (0x68)
  if (rtc.begin()) {
    rtcReady = true;
    if (rtc.lostPower()) {
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    }
    DateTime now = rtc.now();
    rtcHour = now.hour();
    rtcMinute = now.minute();
    rtcSecond = now.second();
    Serial.println("[OK] RTC DS3231 (0x68) Siap");
  } else {
    Serial.println("[WARN] RTC DS3231 tidak terdeteksi, menggunakan timer internal");
  }

  // 3. INA226 (0x40)
  if (ina226.init()) {
    inaReady = true;
    ina226.waitUntilConversionCompleted();
    ina226.setResistorRange(0.1, 1.3); // Shunt 0.1 Ohm
    Serial.println("[OK] INA226 (0x40) Siap");
  } else {
    Serial.println("[WARN] INA226 tidak terdeteksi");
  }

  // 4. VL53L0X (0x29)
  if (sensorVL53.begin(VL53_I2C_ADDR)) {
    vl53Ready = true;
    Serial.println("[OK] VL53L0X (0x29) Siap");
  } else {
    Serial.println("[WARN] VL53L0X tidak terdeteksi");
  }
}

// ==============================================================================
// 8. PEMBACAAN SENSOR & LOGIKA DETEKSI HAMA
// ==============================================================================
void readSensors() {
  // A. Baca Waktu RTC DS3231 atau fallback ke NTP internal clock
  if (rtcReady) {
    DateTime now = rtc.now();
    rtcHour = now.hour();
    rtcMinute = now.minute();
    rtcSecond = now.second();
    rtcYear = now.year();
    rtcMonth = now.month();
    rtcDay = now.day();
  } else if (ntpSynced) {
    // Fallback: RTC tidak ada, gunakan jam internal ESP32 yang sudah disinkronkan via NTP
    struct tm timeinfo;
    if (getLocalTime(&timeinfo, 0)) {
      rtcHour   = timeinfo.tm_hour;
      rtcMinute = timeinfo.tm_min;
      rtcSecond = timeinfo.tm_sec;
      rtcYear   = timeinfo.tm_year + 1900;
      rtcMonth  = timeinfo.tm_mon + 1;
      rtcDay    = timeinfo.tm_mday;
    }
  }

  // B. Baca Tegangan & Arus Baterai dari INA226
  if (inaReady) {
    busVoltage_V = ina226.getBusVoltage_V();
    current_mA   = ina226.getCurrent_mA();
    power_mW     = ina226.getBusPower();
  }

  // C. Baca Jarak Objek / Hama dari VL53L0X
  if (vl53Ready) {
    VL53L0X_RangingMeasurementData_t measure;
    sensorVL53.rangingTest(&measure, false);
    if (measure.RangeStatus != 4) { // Status 4 = out of range / error
      currentDistance = measure.RangeMilliMeter;

      // Pemicu blower via sensor VL53L0X hanya berjalan jika blowerMode == "sensor"
      if (blowerMode == "sensor") {
        // Cek: Apakah LED sedang aktif (sistem sedang menarik hama)?
        bool canTrigger = false;
        if (currentMode == MODE_MANUAL && uvLedEnabled) {
          canTrigger = true; // Manual mode: LED nyala terus, bisa trigger kapan saja
        } else if ((currentMode == MODE_OTOMATIS || currentMode == MODE_OTOMATIS_LED) && isWithinSchedule()) {
          canTrigger = true; // Otomatis: hanya trigger saat dalam jadwal
        }

        // Cooldown: cek apakah sudah lewat jeda sensorCooldownSec detik sejak blower mati
        unsigned long nowMs = millis();
        unsigned long cooldownMs = (unsigned long)sensorCooldownSec * 1000UL;
        bool cooldownPassed = (lastBlowerStop == 0) || ((nowMs - lastBlowerStop) >= cooldownMs);

        if (canTrigger && !blowerEnabled && cooldownPassed &&
            currentDistance >= distMin_mm && currentDistance <= distThreshold_mm) {
          // TRIGGER BLOWER! Hama terdeteksi mendekat!
          digitalWrite(PIN_RELAY_1, HIGH);
          digitalWrite(PIN_RELAY_2, HIGH);
          blowerEnabled = true;
          zapperActive = true;
          blowerOffTime = nowMs + ((unsigned long)manualDurationSec * 1000UL);
          lastBlowerTrigger = nowMs;
          pestCounter++;
          Serial.print("[DETEKSI] Hama Terdeteksi Sensor! Jarak: ");
          Serial.print(currentDistance);
          Serial.print(" mm | Blower ON selama ");
          Serial.print(manualDurationSec);
          Serial.print(" detik (Jeda: ");
          Serial.print(sensorCooldownSec);
          Serial.print("s) | Total Hama: ");
          Serial.println(pestCounter);
          savePreferences(); // Simpan counter
          sendTelemetryToEws(); // Laporkan ke server
        }
      }
    }
  }
}

// ==============================================================================
// 9. LOGIKA KONTROL AKTUATOR (LED ATRAKTOR & JADWAL OPERASI)
// ==============================================================================
bool isWithinSchedule() {
  int currentTotalMin = rtcHour * 60 + rtcMinute;
  int startTotalMin   = startHour * 60 + startMin;
  int endTotalMin     = endHour * 60 + endMin;

  if (startTotalMin <= endTotalMin) {
    // Rentang waktu normal dalam satu hari (misal 08:00 s/d 17:00)
    return (currentTotalMin >= startTotalMin && currentTotalMin < endTotalMin);
  } else {
    // Rentang waktu lintas tengah malam (misal 18:00 malam s/d 06:00 pagi)
    return (currentTotalMin >= startTotalMin || currentTotalMin < endTotalMin);
  }
}

void updateActuators() {
  unsigned long now = millis();

  // ============================================================
  // LOGIKA LED WS2812B (ATRAKTOR / PENARIK HAMA)
  // - Jika uvLedEnabled == false -> LED MATI
  // - Di MODE_MANUAL -> LED MENYALA TERUS
  // - Di MODE_OTOMATIS -> LED MENYALA SESUAI JADWAL RTC
  // - Jika ledRunning == true -> LED berganti warna tiap ledRotationInterval menit
  // - Jika ledRunning == false -> LED menyala 1 warna statis (activePreset)
  // ============================================================

  if (!uvLedEnabled) {
    turnOffLed();
    ledIsOn = false;
  } else {
    bool shouldLedBeOn = false;
    if (currentMode == MODE_MANUAL) {
      shouldLedBeOn = true;
    } else if (currentMode == MODE_OTOMATIS || currentMode == MODE_OTOMATIS_LED) {
      shouldLedBeOn = isWithinSchedule();
    } else if (currentMode == MODE_SLEEP) {
      enterDeepSleep();
      return;
    }

    if (shouldLedBeOn) {
      // Rotasi warna otomatis hanya jika fitur ledRunning aktif
      if (ledRunning) {
        unsigned long rotIntervalMs = (unsigned long)ledRotationInterval * 60000UL;
        if (rotIntervalMs > 0 && (now - lastLedRotate >= rotIntervalMs)) {
          lastLedRotate = now;
          activePreset = (activePreset + 1) % 5;
          Serial.print("[Auto-Rotate LED] Beralih ke Preset ");
          Serial.print(activePreset + 1);
          Serial.print(": ");
          Serial.println(presets[activePreset].name);
        }
      }

      applyLedColor(presets[activePreset].r, presets[activePreset].g, presets[activePreset].b);
      ledIsOn = true;
    } else {
      turnOffLed();
      ledIsOn = false;
    }
  }

  // ============================================================
  // LOGIKA BLOWER (RELAY 1) UNTUK MODE WAKTU (blowerMode == "time")
  // Blower otomatis menyala berkala setiap manualIntervalMin menit
  // selama manualDurationSec detik tanpa menunggu sensor VL53L0X.
  // ============================================================
  if (blowerMode == "time") {
    bool canBlowerRun = false;
    if (currentMode == MODE_MANUAL && uvLedEnabled) {
      canBlowerRun = true;
    } else if ((currentMode == MODE_OTOMATIS || currentMode == MODE_OTOMATIS_LED) && isWithinSchedule()) {
      canBlowerRun = true;
    }

    if (canBlowerRun && !blowerEnabled) {
      unsigned long cycleIntervalMs = (unsigned long)manualIntervalMin * 60000UL;
      if (cycleIntervalMs > 0 && (now - lastBlowerTimeCycle >= cycleIntervalMs || lastBlowerTimeCycle == 0)) {
        digitalWrite(PIN_RELAY_1, HIGH);
        digitalWrite(PIN_RELAY_2, HIGH);
        blowerEnabled = true;
        zapperActive = true;
        blowerOffTime = now + ((unsigned long)manualDurationSec * 1000UL);
        lastBlowerTimeCycle = now;
        Serial.print("[Blower Siklus Waktu] Blower ON selama ");
        Serial.print(manualDurationSec);
        Serial.println(" detik (Interval Berkala)");
      }
    }
  }
}

void triggerZapperCycle() {
  digitalWrite(PIN_RELAY_1, HIGH);
  digitalWrite(PIN_RELAY_2, HIGH);
  blowerEnabled = true;
  zapperActive = true;
  blowerOffTime = millis() + ((unsigned long)manualDurationSec * 1000UL);
  sendTelemetryToEws();
}

void applyLedColor(uint8_t r, uint8_t g, uint8_t b) {
  for (int i = 0; i < NUM_WS2812B; i++) {
    strip.setPixelColor(i, strip.Color(r, g, b));
  }
  strip.show();
}

void turnOffLed() {
  strip.clear();
  strip.show();
}

// ==============================================================================
// 10. NAVIGASI TOMBOL FISIK
// ==============================================================================
void handlePhysicalButtons() {
  unsigned long now = millis();

  // --- TOMBOL 1 (GPIO 25): PINDAH / GANTI PRESET WARNA ---
  if (digitalRead(PIN_BT1) == LOW) {
    if (now - bt1LastPress > 300) {
      bt1LastPress = now;
      activePreset = (activePreset + 1) % 5;
      Serial.print("[Tombol 1] Ganti Preset ke: ");
      Serial.print(activePreset + 1);
      Serial.print(" - ");
      Serial.println(presets[activePreset].name);

      updateActuators();
      savePreferences();
      sendTelemetryToEws();
    }
  }

  // --- TOMBOL 2 (GPIO 26): GANTI MODE & TAHAN UNTUK MASUK SLEEP ---
  int bt2State = digitalRead(PIN_BT2);
  if (bt2State == LOW) {
    if (!bt2IsHolding) {
      bt2IsHolding = true;
      bt2PressStart = now;
    } else {
      // Jika ditahan lebih dari 2 detik -> Masuk ke MODE SLEEP
      if (now - bt2PressStart >= 2000) {
        Serial.println("[Tombol 2 Tahan 2 Detik] Masuk ke SLEEP MODE!");
        enterDeepSleep();
      }
    }
  } else {
    // Tombol dilepas sebelum 2 detik -> Siklus Ganti Mode
    if (bt2IsHolding) {
      bt2IsHolding = false;
      if (now - bt2PressStart < 2000 && (now - bt2LastPress > 250)) {
        bt2LastPress = now;
        if (currentMode == MODE_MANUAL) currentMode = MODE_OTOMATIS;
        else if (currentMode == MODE_OTOMATIS) currentMode = MODE_OTOMATIS_LED;
        else {
          currentMode = MODE_MANUAL;
          lastManualCycleStart = millis();
        }

        Serial.print("[Tombol 2] Ganti Mode ke: ");
        if (currentMode == MODE_MANUAL) Serial.println("MANUAL");
        else if (currentMode == MODE_OTOMATIS) Serial.println("OTOMATIS");
        else if (currentMode == MODE_OTOMATIS_LED) Serial.println("OTOMATIS-LED");

        updateActuators();
        savePreferences();
        sendTelemetryToEws();
      }
    }
  }

  // --- TOMBOL 3 (GPIO 27): RESET COUNTER HAMA ---
  if (digitalRead(PIN_BT3) == LOW) {
    if (now - bt3LastPress > 2000) {
      bt3LastPress = now;
      pestCounter = 0;
      Serial.println("[Tombol 3] Counter Hama Direset ke 0");
      savePreferences();
      sendTelemetryToEws();
    }
  }
}

// ==============================================================================
// 11. DEEP SLEEP (BENAR-BENAR MEMATIKAN SISTEM)
// ==============================================================================
void enterDeepSleep() {
  Serial.println("\n[SLEEP] Mempersiapkan Sistem untuk Memasuki DEEP SLEEP...");

  // 1. Matikan Beban Lampu LED WS2812B
  turnOffLed();

  // 2. Matikan Relay Zapper
  digitalWrite(PIN_RELAY_1, LOW);
  digitalWrite(PIN_RELAY_2, LOW);

  // 3. Matikan Layar OLED SSD1306
  if (oledReady) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(10, 20);
    display.println("MEMASUKI MODE SLEEP");
    display.setCursor(10, 35);
    display.println("Tekan Tombol utk Bangun");
    display.display();
    delay(1000);
    display.ssd1306_command(SSD1306_DISPLAYOFF);
  }

  // 4. Putuskan dan Matikan Radio WiFi
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  esp_wifi_stop();

  // 5. Simpan Status Terakhir
  currentMode = MODE_MANUAL; // Saat bangun berikutnya, langsung kembali aktif
  savePreferences();

  // 6. Konfigurasi Tombol Wakeup (Bangun dari LOW/GND saat ditekan)
  esp_sleep_enable_ext0_wakeup((gpio_num_t)PIN_BT2, 0); // Tombol 2 sebagai pemicu bangun

  Serial.println("[SLEEP] Sistem Mati. Masuk Deep Sleep sekarang. Tekan Tombol 2 untuk bangun.");
  delay(100);
  esp_deep_sleep_start();
}

// ==============================================================================
// 12. TAMPILAN DISPLAY OLED SSD1306 (128x64)
// ==============================================================================
void updateOledDisplay() {
  if (!oledReady) return;

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  // Baris 1: Mode & Jam RTC
  display.setCursor(0, 0);
  if (currentMode == MODE_MANUAL) display.print("[MAN]");
  else if (currentMode == MODE_OTOMATIS) display.print("[OTO]");
  else if (currentMode == MODE_OTOMATIS_LED) display.print("[ROT]");
  else display.print("[SLP]");

  display.print(" ");
  if (rtcHour < 10) display.print("0");
  display.print(rtcHour);
  display.print(":");
  if (rtcMinute < 10) display.print("0");
  display.print(rtcMinute);

  display.setCursor(85, 0);
  if (WiFi.status() == WL_CONNECTED) display.print("IoT:OK");
  else display.print("IoT:AP");

  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  // Baris 2: Preset Warna
  display.setCursor(0, 12);
  display.print("P");
  display.print(activePreset + 1);
  display.print(": ");
  display.print(presets[activePreset].name);

  // Baris 3: Status Baterai (INA226)
  display.setCursor(0, 24);
  display.print("Bat: ");
  display.print(busVoltage_V, 2);
  display.print("V ");
  display.print((int)current_mA);
  display.print("mA");

  // Baris 4: Sensor Jarak VL53L0X & Counter Hama
  display.setCursor(0, 36);
  display.print("Jarak: ");
  display.print(currentDistance);
  display.print("mm");

  display.setCursor(80, 36);
  display.print("Hama:");
  display.print(pestCounter);

  // Baris 5: Status Lampu & Jadwal
  display.setCursor(0, 48);
  display.print("Lampu: ");
  display.print(ledIsOn ? "ON " : "OFF ");

  if (currentMode == MODE_OTOMATIS_LED) {
    display.print("Rot:");
    display.print(ledRotationInterval);
    display.print("m");
  } else {
    display.print("Jadwal:");
    display.print(startHour);
    display.print("-");
    display.print(endHour);
  }

  display.display();
}

// ==============================================================================
// 13. WEB SERVER HTTP LOKAL ESP32 (PORT 80)
// ==============================================================================

static const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="data:,">
  <title>Smart Pest Trap - Local Control</title>
  <style>
    :root {
      --bg: #0f172a; --card: #1e293b; --card-hover: #24344d; --border: #334155;
      --text: #f8fafc; --text-muted: #94a3b8; --primary: #0284c7; --primary-glow: #38bdf8;
      --success: #10b981; --warning: #f59e0b; --danger: #ef4444; --accent: #8b5cf6;
    }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 12px; line-height: 1.4; }
    .wrap { max-width: 580px; margin: auto; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding: 4px 0; }
    .title-group h2 { margin: 0; font-size: 1.2rem; color: var(--primary-glow); display: flex; align-items: center; gap: 6px; }
    .title-group p { margin: 2px 0 0 0; font-size: 12px; color: var(--text-muted); }
    .badge { font-size: 11px; padding: 3px 8px; border-radius: 6px; font-weight: 600; background: var(--border); }
    .badge-ok { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.4); }
    .badge-bad { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.4); }
    .tabs { display: flex; gap: 6px; margin-bottom: 12px; }
    .tab { flex: 1; padding: 9px 4px; border: none; border-radius: 8px; background: var(--card); color: var(--text-muted); font-weight: 600; font-size: 13px; cursor: pointer; text-align: center; border: 1px solid var(--border); transition: all 0.2s; }
    .tab.active { background: var(--primary); color: #fff; border-color: var(--primary-glow); box-shadow: 0 0 10px rgba(56, 189, 248, 0.3); }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 12px; }
    .card-title { font-size: 13px; font-weight: 700; color: var(--primary-glow); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .stat-tile { background: rgba(15, 23, 42, 0.6); padding: 8px; border-radius: 8px; border: 1px solid var(--border); text-align: center; }
    .stat-lbl { font-size: 10px; color: var(--text-muted); text-transform: uppercase; }
    .stat-val { font-size: 15px; font-weight: bold; margin-top: 2px; color: #fff; }
    .mode-card, .opt-card { border: 1.5px solid var(--border); border-radius: 10px; padding: 10px; cursor: pointer; transition: all 0.2s; background: rgba(15, 23, 42, 0.5); text-align: left; }
    .mode-card:hover, .opt-card:hover { border-color: var(--primary-glow); background: var(--card-hover); }
    .mode-card.selected, .opt-card.selected { border-color: var(--primary-glow); background: rgba(56, 189, 248, 0.12); box-shadow: 0 0 12px rgba(56, 189, 248, 0.2); }
    .mode-card h4, .opt-card h4 { margin: 0; font-size: 13px; color: #fff; display: flex; align-items: center; gap: 6px; }
    .mode-card p, .opt-card p { margin: 4px 0 0 0; font-size: 11px; color: var(--text-muted); }
    .preset-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
    .preset-item { display: flex; align-items: center; justify-content: space-between; background: rgba(15, 23, 42, 0.5); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
    .preset-item.active-preset { border-color: var(--success); background: rgba(16, 185, 129, 0.1); }
    .preset-info { display: flex; align-items: center; gap: 10px; }
    .color-dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 6px rgba(0,0,0,0.5); flex-shrink: 0; }
    .preset-name { font-size: 13px; font-weight: 600; color: #fff; }
    .preset-rgb { font-size: 10px; color: var(--text-muted); }
    .preset-actions { display: flex; gap: 6px; }
    .form-group { margin-bottom: 10px; }
    label { display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; }
    input, select { width: 100%; padding: 8px 10px; background: #0f172a; border: 1px solid var(--border); border-radius: 8px; color: #fff; font-size: 13px; }
    input:focus, select:focus { outline: none; border-color: var(--primary-glow); }
    .slider-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .slider-row input[type="range"] { flex: 1; padding: 0; height: 6px; }
    .slider-row span { width: 35px; text-align: right; font-size: 12px; font-weight: bold; }
    button { padding: 9px 12px; border: none; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
    .btn-primary { background: var(--primary); color: #fff; width: 100%; }
    .btn-primary:hover { background: #0369a1; }
    .btn-success { background: var(--success); color: #fff; width: 100%; }
    .btn-success:hover { background: #059669; }
    .btn-action { background: #334155; color: #f8fafc; font-size: 12px; padding: 6px 10px; }
    .btn-action:hover { background: #475569; }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-danger:hover { background: #dc2626; }
    .btn-warn { background: var(--warning); color: #1e293b; font-weight: 700; }
    .swatch-box { height: 36px; border-radius: 8px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.8); margin-bottom: 8px; }
    .alert-banner { display: none; padding: 10px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; margin-bottom: 10px; }
    .alert-ok { background: rgba(16, 185, 129, 0.15); border: 1px solid var(--success); color: #34d399; }
    .alert-err { background: rgba(239, 68, 68, 0.15); border: 1px solid var(--danger); color: #f87171; }
    .drawer { background: #162032; border: 1px dashed var(--primary-glow); border-radius: 10px; padding: 12px; margin-top: 10px; display: none; }
    .tag-active { font-size: 10px; padding: 3px 8px; border-radius: 4px; background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.4); font-weight: bold; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="title-group">
      <h2><span id="hdr_trap_name">Smart Pest Trap</span></h2>
      <p>ID: <span id="hdr_trap_id">--</span> &bull; <span id="hdr_ws_badge" class="badge">IoT Cloud: --</span></p>
    </div>
    <div style="text-align: right;">
      <span id="hdr_clock" class="badge">--:--:--</span>
    </div>
  </div>

  <div id="alert_box" class="alert-banner"></div>

  <div class="tabs">
    <button class="tab active" onclick="openTab('p_ctrl')">Kontrol & Config</button>
    <button class="tab" onclick="openTab('p_wifi')">WiFi</button>
    <button class="tab" onclick="openTab('p_server')">Server & Modem</button>
  </div>

  <!-- TAB 1: KONTROL & KONFIGURASI LENGKAP -->
  <div id="p_ctrl">
    <!-- Quick Stats -->
    <div class="card">
      <div class="card-title">
        <span>Status Telemetri & Sensor</span>
        <span id="hdr_uv_badge" class="badge badge-bad">UV: OFF</span>
      </div>
      <div class="grid-3" style="margin-bottom: 8px;">
        <div class="stat-tile"><div class="stat-lbl">Tegangan Aki</div><div class="stat-val" id="s_volt">-- V</div></div>
        <div class="stat-tile"><div class="stat-lbl">Arus Beban</div><div class="stat-val" id="s_curr">-- mA</div></div>
        <div class="stat-tile"><div class="stat-lbl">Jarak Wadah</div><div class="stat-val" id="s_dist">-- mm</div></div>
      </div>
      <div class="grid-3">
        <div class="stat-tile"><div class="stat-lbl">Total Hama</div><div class="stat-val" id="s_count" style="color:#38bdf8;">--</div></div>
        <div class="stat-tile"><div class="stat-lbl">Kapasitas</div><div class="stat-val" id="s_cap">-- %</div></div>
        <div class="stat-tile"><div class="stat-lbl">Status Blower</div><div class="stat-val" id="s_blower_txt" style="font-size:13px;">--</div></div>
      </div>
    </div>

    <!-- Ringkasan Aktuator & Parameter Saat Ini -->
    <div class="card" style="background: rgba(15, 23, 42, 0.4); border-style: dashed;">
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
        <div><strong>Warna Aktif:</strong> <span id="sum_color_badge" class="badge">--</span></div>
        <div><strong>Mode Operasi:</strong> <span id="sum_mode_badge" class="badge">--</span></div>
      </div>
    </div>

    <!-- Mode Kerja Operasional (Sama seperti IoT Dashboard) -->
    <div class="card">
      <div class="card-title">
        <span>Pilih Mode Kerja Sistem</span>
        <span class="badge" id="badge_mode_draft" style="font-size:10px;">MODE: MANUAL</span>
      </div>
      <div class="grid-2">
        <div class="mode-card" id="mode_card_manual" onclick="selectMode('manual')">
          <h4>1. Mode Manual</h4>
          <p>Lampu penarik hama aktif menyala terus (24 jam non-stop). Blower dan rotasi lampu bekerja mengikuti parameter yang dikonfigurasi di bawah.</p>
        </div>
        <div class="mode-card" id="mode_card_otomatis" onclick="selectMode('otomatis')">
          <h4>2. Mode Otomatis (Jadwal RTC DS3231)</h4>
          <p>Lampu dan blower aktif otomatis mengikuti jam operasional malam hari (Start s/d End). Di luar jam tersebut sistem hemat daya/standby.</p>
        </div>
      </div>
    </div>

    <!-- Parameter Blower & Lampu LED (Sama persis seperti IoT Dashboard) -->
    <div class="card">
      <div class="card-title">
        <span>Pengaturan Parameter Blower &amp; Lampu LED</span>
        <span style="font-size:10px; color:var(--text-muted); font-weight:normal;">Klik "Simpan Pengaturan" untuk sinkron</span>
      </div>
      
      <div class="grid-2">
        <!-- Opsi Pemicu Blower -->
        <div style="background:rgba(15,23,42,0.5); padding:12px; border-radius:10px; border:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <label style="margin:0; font-weight:bold; color:#fff; font-size:12px;">Pilihan Pemicu Blower</label>
            <span id="badge_blower_mode" class="badge" style="background:rgba(6,182,212,0.15); color:#22d3ee; border:1px solid rgba(6,182,212,0.4); font-size:10px;">Sensor VL53L0X</span>
          </div>
          <div class="grid-2">
            <div class="opt-card" id="opt_bl_sensor" onclick="selectBlowerMode('sensor')">
              <h4>Sensor Jarak</h4>
              <p>Nyala saat hama mendekat</p>
            </div>
            <div class="opt-card" id="opt_bl_time" onclick="selectBlowerMode('time')">
              <h4>Siklus Waktu</h4>
              <p>Nyala berkala tiap interval</p>
            </div>
          </div>
          <p id="txt_blower_desc" style="font-size:11px; color:var(--text-muted); margin:10px 0 0 0; line-height:1.4;">
            --
          </p>
        </div>

        <!-- Opsi Rotasi Lampu LED (Running) -->
        <div style="background:rgba(15,23,42,0.5); padding:12px; border-radius:10px; border:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <label style="margin:0; font-weight:bold; color:#fff; font-size:12px;">Mode Rotasi Warna Lampu (LED Running)</label>
            <span id="badge_led_running" class="badge" style="background:rgba(168,85,247,0.15); color:#c084fc; border:1px solid rgba(168,85,247,0.4); font-size:10px;">ON (Berganti Warna)</span>
          </div>
          <div class="grid-2">
            <div class="opt-card" id="opt_led_running" onclick="selectLedRunning(true)">
              <h4>LED Running: ON</h4>
              <p>Berganti warna otomatis</p>
            </div>
            <div class="opt-card" id="opt_led_fixed" onclick="selectLedRunning(false)">
              <h4>LED Running: OFF</h4>
              <p>1 warna preset tetap</p>
            </div>
          </div>
          <p id="txt_led_desc" style="font-size:11px; color:var(--text-muted); margin:10px 0 0 0; line-height:1.4;">
            --
          </p>
        </div>
      </div>
    </div>

    <!-- Koleksi Preset Warna Lampu (RGB Atraktor) -->
    <div class="card">
      <div class="card-title">
        <span>Koleksi Preset Warna Lampu (Atraktor)</span>
        <span style="font-size:10px; color:var(--text-muted);">Pilih aktif atau edit RGB</span>
      </div>
      <div class="preset-list" id="preset_container">
        <!-- Rendered via JavaScript -->
      </div>

      <!-- Drawer / Editor Preset Warna -->
      <div id="preset_editor" class="drawer">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="color:var(--primary-glow); font-size:13px;" id="edit_preset_title">Edit Preset</strong>
          <button class="btn-action" onclick="closePresetEditor()" style="padding:2px 8px;">X Tutup</button>
        </div>
        <div id="swatch_preview" class="swatch-box">WARNA PREVIEW</div>
        <div class="form-group">
          <label>Nama Preset</label>
          <input type="text" id="edit_p_name" maxlength="15">
        </div>
        <div class="form-group">
          <label style="color:#f87171;">Merah (Red): <span id="val_r">0</span></label>
          <div class="slider-row">
            <input type="range" id="slider_r" min="0" max="255" oninput="onColorSliderChange()">
          </div>
        </div>
        <div class="form-group">
          <label style="color:#4ade80;">Hijau (Green): <span id="val_g">0</span></label>
          <div class="slider-row">
            <input type="range" id="slider_g" min="0" max="255" oninput="onColorSliderChange()">
          </div>
        </div>
        <div class="form-group">
          <label style="color:#60a5fa;">Biru (Blue): <span id="val_b">0</span></label>
          <div class="slider-row">
            <input type="range" id="slider_b" min="0" max="255" oninput="onColorSliderChange()">
          </div>
        </div>
        <button class="btn-primary" onclick="saveEditedPreset()">Simpan Perubahan Preset Ini</button>
      </div>
    </div>

    <!-- Detail Konfigurasi Waktu & Durasi (Sama persis seperti IoT Dashboard) -->
    <div class="card">
      <div class="card-title">
        <span>Detail Konfigurasi Waktu &amp; Durasi</span>
        <span style="font-size:10px; color:var(--text-muted); font-weight:normal;">Sinkron dengan Modul RTC DS3231 &amp; ESP32</span>
      </div>
      
      <div class="grid-2" style="margin-bottom:8px;">
        <div class="form-group">
          <label>Jam Mulai Aktif</label>
          <input type="time" id="cfg_start_time" onchange="markDirty()">
          <small style="font-size:10px; color:var(--text-muted); display:block; margin-top:2px;">Waktu perangkap mulai menyala (Sore/Malam)</small>
        </div>
        <div class="form-group">
          <label>Jam Selesai Aktif</label>
          <input type="time" id="cfg_end_time" onchange="markDirty()">
          <small style="font-size:10px; color:var(--text-muted); display:block; margin-top:2px;">Waktu perangkap otomatis mati (Pagi hari)</small>
        </div>
      </div>

      <div class="form-group">
        <label>Rotasi Lampu (LED Running)</label>
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="number" id="cfg_rot_interval" min="1" max="180" oninput="onTimeConfigChange()" onchange="markDirty()">
          <span style="font-size:12px; color:var(--text-muted); font-weight:600;">Menit</span>
        </div>
        <small style="font-size:10px; color:var(--text-muted); display:block; margin-top:2px;">Warna berganti setiap sekian menit jika LED Running ON</small>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label id="lbl_man_interval">Interval Siklus Blower (Mode Waktu)</label>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="number" id="cfg_man_interval" min="1" max="1440" oninput="onTimeConfigChange()" onchange="markDirty()">
            <span style="font-size:12px; color:var(--text-muted); font-weight:600;">Menit</span>
          </div>
          <small id="hint_man_interval" style="font-size:10px; color:var(--text-muted); display:block; margin-top:2px;">Blower nyala berkala tiap interval ini saat Mode Waktu</small>
        </div>
        <div class="form-group">
          <label>Jeda Sensor Cooldown (Mode Sensor)</label>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="number" id="cfg_sensor_cooldown" min="1" max="300" oninput="onTimeConfigChange()" onchange="markDirty()">
            <span style="font-size:12px; color:var(--text-muted); font-weight:600;">Detik</span>
          </div>
          <small style="font-size:10px; color:var(--text-muted); display:block; margin-top:2px;">Jeda siap deteksi ulang setelah blower mati (default 5 detik)</small>
        </div>
        <div class="form-group">
          <label>Durasi Nyala Blower</label>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="number" id="cfg_man_duration" min="1" max="3600" oninput="onTimeConfigChange()" onchange="markDirty()">
            <span style="font-size:12px; color:var(--text-muted); font-weight:600;">Detik</span>
          </div>
          <small style="font-size:10px; color:var(--text-muted); display:block; margin-top:2px;">Lama blower berputar dalam satu siklus/triger</small>
        </div>
        <div class="form-group">
          <label>Jarak Deteksi Maksimal</label>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="number" id="cfg_dist_threshold" min="10" max="2000" onchange="markDirty()">
            <span style="font-size:12px; color:var(--text-muted); font-weight:600;">mm</span>
          </div>
          <small style="font-size:10px; color:var(--text-muted); display:block; margin-top:2px;">Batas jarak terjauh deteksi hama (default 150 mm / 15 cm)</small>
        </div>
        <div class="form-group">
          <label>Jarak Deteksi Minimal</label>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="number" id="cfg_dist_min" min="0" max="500" onchange="markDirty()">
            <span style="font-size:12px; color:var(--text-muted); font-weight:600;">mm</span>
          </div>
          <small style="font-size:10px; color:var(--text-muted); display:block; margin-top:2px;">Batas jarak minimal filter noise (default 10 mm / 1 cm)</small>
        </div>
      </div>
    </div>

    <!-- Tombol Simpan / Sinkron Utama -->
    <div class="card" style="border-color:var(--primary-glow); background: rgba(2, 132, 199, 0.08);">
      <button class="btn-success" id="btn_save_all" onclick="applyAllControlConfig()" style="font-size:14px; padding:12px;">
        Terapkan & Simpan Semua Pengaturan
      </button>
      <div style="font-size:11px; color:var(--text-muted); text-align:center; margin-top:6px;">
        Pengaturan akan tersimpan di memori ESP32 & disinkronkan ke IoT Cloud secara real-time.
      </div>
    </div>

    <!-- Kontrol Cepat & Saklar Manual Langsung -->
    <div class="card">
      <div class="card-title">Saklar & Uji Manual Langsung</div>
      <div class="grid-2" style="margin-bottom:8px;">
        <button class="btn-action" id="btn_tog_uv" onclick="toggleUv()">Saklar UV LED: --</button>
        <button class="btn-action" id="btn_tog_bl" onclick="toggleBlower()">Saklar Blower: --</button>
      </div>
      <div class="grid-3">
        <button class="btn-action" onclick="triggerZap()">Uji Zap (1x)</button>
        <button class="btn-action" onclick="resetCounter()">Reset Counter</button>
        <button class="btn-warn" onclick="enterSleep()">Mode Sleep</button>
      </div>
    </div>
  </div>

  <!-- TAB 2: PENGATURAN WIFI -->
  <div id="p_wifi" style="display:none;">
    <div class="card">
      <div class="card-title">Koneksi WiFi Lapangan</div>
      <div class="form-group">
        <label>Pilih Jaringan Sekitar</label>
        <div style="display:flex; gap:6px;">
          <select id="wifi_list" onchange="document.getElementById('wifi_ssid').value = this.value"><option>Memindai...</option></select>
          <button class="btn-action" onclick="scanWifi()">Scan</button>
        </div>
      </div>
      <div class="form-group">
        <label>SSID WiFi</label>
        <input type="text" id="wifi_ssid" placeholder="Nama WiFi">
      </div>
      <div class="form-group">
        <label>Password WiFi</label>
        <input type="password" id="wifi_pass" placeholder="Password WiFi">
      </div>
      <button class="btn-primary" onclick="saveWifi()">Hubungkan ke WiFi</button>
    </div>
  </div>

  <!-- TAB 3: PENGATURAN SERVER & MODEM -->
  <div id="p_server" style="display:none;">
    <div class="card">
      <div class="card-title">Konfigurasi IoT WebSocket Server</div>
      <div class="form-group"><label>Trap ID</label><input type="text" id="cfg_trap_id"></div>
      <div class="form-group"><label>Trap Name</label><input type="text" id="cfg_trap_name"></div>
      <div class="form-group"><label>Host WebSocket</label><input type="text" id="cfg_ws_host"></div>
      <div class="grid-2">
        <div class="form-group"><label>Port</label><input type="number" id="cfg_ws_port"></div>
        <div class="form-group"><label>Path</label><input type="text" id="cfg_ws_path"></div>
      </div>
      <div class="form-group">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="cfg_ws_ssl" style="width:auto;"> Gunakan Enkripsi SSL (WSS)
        </label>
      </div>
      <button class="btn-primary" onclick="saveServer()">Simpan Konfigurasi Server</button>
    </div>

    <div class="card">
      <div class="card-title">Manajemen Daya & Modem 4G</div>
      <div class="grid-2">
        <div class="form-group"><label>Pulse Power (ms)</label><input type="number" id="cfg_m_pulse"></div>
        <div class="form-group"><label>Boot Delay (ms)</label><input type="number" id="cfg_m_boot"></div>
        <div class="form-group"><label>Retry Interval (ms)</label><input type="number" id="cfg_m_retry"></div>
        <div class="form-group"><label>Wait WiFi (ms)</label><input type="number" id="cfg_m_wait"></div>
      </div>
      <button class="btn-primary" onclick="saveModem()">Simpan Parameter Modem</button>
      <div style="margin-top:12px;">
        <button class="btn-danger" style="width:100%;" onclick="restartEsp()">Restart ESP32</button>
      </div>
    </div>
  </div>
</div>

<script>
  // Global State Sinkronisasi
  let currentConfig = {
    mode: 'manual',
    blowerMode: 'sensor',
    ledRunning: false,
    activePreset: 0,
    startTime: '18:00',
    endTime: '06:00',
    ledRotationInterval: 30,
    manualIntervalMin: 15,
    manualDurationSec: 30,
    sensorCooldownSec: 5,
    distThresholdMm: 150,
    distMinMm: 10,
    presets: []
  };

  let editingPresetIndex = -1;
  let isDirty = false;
  let pollTimer = null;

  function markDirty() {
    isDirty = true;
  }

  function showAlert(msg, isErr) {
    let b = document.getElementById('alert_box');
    b.className = 'alert-banner ' + (isErr ? 'alert-err' : 'alert-ok');
    b.innerHTML = msg;
    b.style.display = 'block';
    setTimeout(() => { b.style.display = 'none'; }, 4000);
  }

  function openTab(tabId) {
    ['p_ctrl', 'p_wifi', 'p_server'].forEach(id => {
      document.getElementById(id).style.display = (id === tabId) ? 'block' : 'none';
    });
    document.querySelectorAll('.tab').forEach((el, idx) => {
      el.classList.toggle('active', ['p_ctrl', 'p_wifi', 'p_server'][idx] === tabId);
    });
    if (tabId === 'p_wifi') scanWifi();
  }

  // Pilihan Mode Kerja
  function selectMode(m) {
    currentConfig.mode = m;
    markDirty();
    updateModeSelectionUI();
  }

  function updateModeSelectionUI() {
    ['manual', 'otomatis', 'otomatis_led'].forEach(m => {
      let card = document.getElementById('mode_card_' + m);
      if (card) {
        card.classList.toggle('selected', currentConfig.mode === m || (m === 'otomatis_led' && currentConfig.mode === 'otomatis-led'));
      }
    });
  }

  // Pilihan Blower Mode
  function selectBlowerMode(bm) {
    currentConfig.blowerMode = bm;
    markDirty();
    updateBlowerModeUI();
  }

  function updateBlowerModeUI() {
    let s = document.getElementById('opt_bl_sensor');
    let t = document.getElementById('opt_bl_time');
    if (s && t) {
      s.classList.toggle('selected', currentConfig.blowerMode === 'sensor');
      t.classList.toggle('selected', currentConfig.blowerMode === 'time');
    }
  }

  // Pilihan LED Running Mode
  function selectLedRunning(r) {
    currentConfig.ledRunning = r;
    markDirty();
    updateLedRunningUI();
  }

  function updateLedRunningUI() {
    let f = document.getElementById('opt_led_fixed');
    let r = document.getElementById('opt_led_running');
    if (f && r) {
      f.classList.toggle('selected', !currentConfig.ledRunning);
      r.classList.toggle('selected', !!currentConfig.ledRunning);
    }
  }

  function onTimeConfigChange() {
    let manInt = document.getElementById('cfg_man_interval').value || 15;
    let hintInt = document.getElementById('hint_man_interval');
    if (hintInt) hintInt.innerText = 'Blower nyala berkala tiap ' + manInt + ' menit';
  }

  // Render Preset List
  function renderPresets() {
    let c = document.getElementById('preset_container');
    if (!currentConfig.presets || currentConfig.presets.length === 0) return;
    
    let html = '';
    currentConfig.presets.forEach((p, idx) => {
      let isActive = (currentConfig.activePreset === idx);
      let rgbStr = `rgb(${p.r}, ${p.g}, ${p.b})`;
      html += `
        <div class="preset-item ${isActive ? 'active-preset' : ''}">
          <div class="preset-info">
            <div class="color-dot" style="background:${rgbStr};"></div>
            <div>
              <div class="preset-name">${p.name || ('Preset ' + (idx + 1))}</div>
              <div class="preset-rgb">RGB(${p.r}, ${p.g}, ${p.b})</div>
            </div>
          </div>
          <div class="preset-actions">
            ${isActive 
              ? '<span class="tag-active">AKTIF</span>' 
              : `<button class="btn-action" onclick="choosePreset(${idx})">Pilih</button>`}
            <button class="btn-action" onclick="openPresetEditor(${idx})">Edit</button>
          </div>
        </div>
      `;
    });
    c.innerHTML = html;

    // Update Ringkasan Warna
    let curP = currentConfig.presets[currentConfig.activePreset];
    if (curP) {
      document.getElementById('sum_color_badge').innerHTML = 
        `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:rgb(${curP.r},${curP.g},${curP.b});vertical-align:middle;margin-right:4px;"></span> ${curP.name}`;
    }
  }

  function choosePreset(idx) {
    currentConfig.activePreset = idx;
    renderPresets();
    fetch(`/api/preset?val=${idx}`, { method: 'POST' })
      .then(r => r.json())
      .then(() => {
        showAlert('Warna preset berhasil dipilih & diaktifkan');
        refresh();
      });
  }

  // Preset Editor
  function openPresetEditor(idx) {
    editingPresetIndex = idx;
    let p = currentConfig.presets[idx];
    if (!p) return;
    document.getElementById('edit_preset_title').innerText = `Edit Preset #${idx + 1} (${p.name})`;
    document.getElementById('edit_p_name').value = p.name || '';
    document.getElementById('slider_r').value = p.r;
    document.getElementById('slider_g').value = p.g;
    document.getElementById('slider_b').value = p.b;
    document.getElementById('val_r').innerText = p.r;
    document.getElementById('val_g').innerText = p.g;
    document.getElementById('val_b').innerText = p.b;
    updateSwatchPreview();
    document.getElementById('preset_editor').style.display = 'block';
  }

  function closePresetEditor() {
    document.getElementById('preset_editor').style.display = 'none';
    editingPresetIndex = -1;
  }

  function onColorSliderChange() {
    let r = document.getElementById('slider_r').value;
    let g = document.getElementById('slider_g').value;
    let b = document.getElementById('slider_b').value;
    document.getElementById('val_r').innerText = r;
    document.getElementById('val_g').innerText = g;
    document.getElementById('val_b').innerText = b;
    updateSwatchPreview();
  }

  function updateSwatchPreview() {
    let r = document.getElementById('slider_r').value;
    let g = document.getElementById('slider_g').value;
    let b = document.getElementById('slider_b').value;
    let sb = document.getElementById('swatch_preview');
    sb.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    let lum = (0.299 * r + 0.587 * g + 0.114 * b);
    sb.style.color = (lum > 130) ? '#0f172a' : '#ffffff';
    sb.innerText = `RGB(${r}, ${g}, ${b})`;
  }

  function saveEditedPreset() {
    if (editingPresetIndex < 0 || editingPresetIndex >= currentConfig.presets.length) return;
    let name = document.getElementById('edit_p_name').value.trim() || ('Preset ' + (editingPresetIndex + 1));
    let r = parseInt(document.getElementById('slider_r').value);
    let g = parseInt(document.getElementById('slider_g').value);
    let b = parseInt(document.getElementById('slider_b').value);

    currentConfig.presets[editingPresetIndex].name = name;
    currentConfig.presets[editingPresetIndex].r = r;
    currentConfig.presets[editingPresetIndex].g = g;
    currentConfig.presets[editingPresetIndex].b = b;

    let payload = {
      index: editingPresetIndex,
      name: name,
      r: r,
      g: g,
      b: b
    };

    fetch('/api/preset/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      showAlert(`Preset #${editingPresetIndex + 1} berhasil disimpan!`);
      closePresetEditor();
      renderPresets();
      refresh();
    })
    .catch(err => {
      showAlert('Gagal menyimpan preset: ' + err, true);
    });
  }

  // Terapkan & Simpan Semua Pengaturan (Feature Parity dengan IoT Dashboard)
  function applyAllControlConfig() {
    let sTime = document.getElementById('cfg_start_time').value || '18:00';
    let eTime = document.getElementById('cfg_end_time').value || '06:00';
    let rotInt = parseInt(document.getElementById('cfg_rot_interval').value) || 30;
    let manInt = parseInt(document.getElementById('cfg_man_interval').value) || 15;
    let manDur = parseInt(document.getElementById('cfg_man_duration').value) || 30;
    let sensorCd = parseInt(document.getElementById('cfg_sensor_cooldown').value) || 5;
    let distTh = parseInt(document.getElementById('cfg_dist_threshold').value) || 150;
    let distMin = (document.getElementById('cfg_dist_min') && document.getElementById('cfg_dist_min').value !== '') ? parseInt(document.getElementById('cfg_dist_min').value) : 10;

    let payload = {
      mode: currentConfig.mode,
      blowerMode: currentConfig.blowerMode,
      ledRunning: currentConfig.ledRunning,
      activePreset: currentConfig.activePreset,
      startTime: sTime,
      endTime: eTime,
      ledRotationInterval: rotInt,
      manualIntervalMin: manInt,
      manualDurationSec: manDur,
      sensorCooldownSec: sensorCd,
      distThresholdMm: distTh,
      distMinMm: distMin
    };

    let btn = document.getElementById('btn_save_all');
    btn.disabled = true;
    btn.innerText = 'Menyimpan & Mensinkronkan...';

    fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      showAlert('Pengaturan berhasil diterapkan & disinkronkan ke IoT Cloud!');
      isDirty = false;
      btn.disabled = false;
      btn.innerText = 'Terapkan & Simpan Semua Pengaturan';
      refresh();
    })
    .catch(err => {
      showAlert('Gagal menerapkan pengaturan: ' + err, true);
      btn.disabled = false;
      btn.innerText = 'Terapkan & Simpan Semua Pengaturan';
    });
  }

  // Refresh Telemetri dan Status berkala
  function refresh() {
    fetch('/api/status')
      .then(res => res.json())
      .then(d => {
        document.getElementById('hdr_trap_name').innerText = d.trapName || 'Smart Pest Trap';
        document.getElementById('hdr_trap_id').innerText = d.trapId || '--';
        document.getElementById('hdr_clock').innerText = d.currentTime || '--:--:--';

        let wsBadge = document.getElementById('hdr_ws_badge');
        if (d.wsConnected) {
          wsBadge.className = 'badge badge-ok';
          wsBadge.innerText = 'IoT Cloud: Terhubung';
        } else {
          wsBadge.className = 'badge badge-bad';
          wsBadge.innerText = 'IoT Cloud: Terputus';
        }

        let volt = parseFloat(d.batteryVoltage || d.voltage || 0);
        document.getElementById('s_volt').innerText = volt.toFixed(2) + ' V';
        document.getElementById('s_curr').innerText = (d.loadCurrent !== undefined ? d.loadCurrent : (d.current || 0)) + ' mA';
        document.getElementById('s_dist').innerText = (d.currentDistance !== undefined ? d.currentDistance : (d.distance || 0)) + ' mm';
        let cnt = (d.photoelectricCount !== undefined ? d.photoelectricCount : (d.pestCounter || 0));
        document.getElementById('s_count').innerText = cnt;
        let cap = Math.min(100, Math.max(0, Math.round((cnt / 500) * 100)));
        document.getElementById('s_cap').innerText = cap + ' %';
        document.getElementById('s_blower_txt').innerText = (d.blowerStatus || d.blowerEnabled || d.zapperActive) ? 'AKTIF' : 'STANDBY';

        let uvBadge = document.getElementById('hdr_uv_badge');
        let isUvOn = d.ledIsOn || d.ledOn;
        if (isUvOn) {
          uvBadge.className = 'badge badge-ok';
          uvBadge.innerText = 'UV: MENYALA';
        } else {
          uvBadge.className = 'badge badge-bad';
          uvBadge.innerText = 'UV: OFF';
        }

        document.getElementById('btn_tog_uv').innerText = d.uvLedStatus ? 'Lampu UV: ON' : 'Lampu UV: OFF';
        document.getElementById('btn_tog_bl').innerText = d.blowerStatus ? 'Blower: ON' : 'Blower: OFF';

        let curM = d.mode || 'manual';
        let mLabel = curM === 'manual' ? 'MANUAL' : (curM === 'otomatis' ? 'OTOMATIS (JADWAL)' : 'ROTASI LED');
        document.getElementById('sum_mode_badge').innerText = mLabel;

        if (d.presets && Array.isArray(d.presets)) {
          currentConfig.presets = d.presets;
        }

        if (!isDirty) {
          currentConfig.mode = (curM === 'otomatis-led' ? 'otomatis_led' : curM);
          currentConfig.blowerMode = d.blowerMode || 'sensor';
          currentConfig.ledRunning = !!d.ledRunning;
          currentConfig.activePreset = (d.activePreset !== undefined) ? d.activePreset : 0;
          currentConfig.startTime = d.startTime || '18:00';
          currentConfig.endTime = d.endTime || '06:00';
          currentConfig.ledRotationInterval = d.ledRotationInterval || 30;
          currentConfig.manualIntervalMin = d.manualIntervalMin || 15;
          currentConfig.manualDurationSec = d.manualDurationSec || 30;
          currentConfig.sensorCooldownSec = d.sensorCooldownSec || 5;
          currentConfig.distThresholdMm = (d.distThresholdMm !== undefined) ? d.distThresholdMm : 150;
          currentConfig.distMinMm = (d.distMinMm !== undefined) ? d.distMinMm : 10;

          document.getElementById('cfg_start_time').value = currentConfig.startTime;
          document.getElementById('cfg_end_time').value = currentConfig.endTime;
          document.getElementById('cfg_rot_interval').value = currentConfig.ledRotationInterval;
          document.getElementById('cfg_man_interval').value = currentConfig.manualIntervalMin;
          document.getElementById('cfg_man_duration').value = currentConfig.manualDurationSec;
          if (document.getElementById('cfg_sensor_cooldown')) document.getElementById('cfg_sensor_cooldown').value = currentConfig.sensorCooldownSec;
          if (document.getElementById('cfg_dist_threshold')) document.getElementById('cfg_dist_threshold').value = currentConfig.distThresholdMm;
          if (document.getElementById('cfg_dist_min')) document.getElementById('cfg_dist_min').value = currentConfig.distMinMm;

          updateModeSelectionUI();
          updateBlowerModeUI();
          updateLedRunningUI();
          onTimeConfigChange();
        }

        renderPresets();

        if (!document.getElementById('cfg_trap_id').value) document.getElementById('cfg_trap_id').value = d.trapId || '';
        if (!document.getElementById('cfg_trap_name').value) document.getElementById('cfg_trap_name').value = d.trapName || '';
        if (!document.getElementById('cfg_ws_host').value) document.getElementById('cfg_ws_host').value = d.wsHost || '';
        if (!document.getElementById('cfg_ws_port').value) document.getElementById('cfg_ws_port').value = d.wsPort || 8080;
        if (!document.getElementById('cfg_ws_path').value) document.getElementById('cfg_ws_path').value = d.wsPath || '';
        document.getElementById('cfg_ws_ssl').checked = !!d.wsUseSsl;

        if (d.modemPulseSec && !document.getElementById('cfg_m_pulse').value) {
          document.getElementById('cfg_m_pulse').value = d.modemPulseSec * 1000;
          document.getElementById('cfg_m_boot').value = d.modemBootDelaySec * 1000;
          document.getElementById('cfg_m_retry').value = d.modemRetryIntervalSec * 1000;
          document.getElementById('cfg_m_wait').value = d.modemWaitWifiSec * 1000;
        }
      })
      .catch(err => console.log('Poll err:', err));
  }

  // Saklar & Uji Manual
  function toggleUv() {
    fetch('/api/toggle-uv', { method: 'POST' }).then(() => refresh());
  }

  function toggleBlower() {
    fetch('/api/toggle-blower', { method: 'POST' }).then(() => refresh());
  }

  function triggerZap() {
    fetch('/api/zap', { method: 'POST' }).then(() => showAlert('Zap 1 siklus manual dipicu!'));
  }

  function resetCounter() {
    if (confirm('Reset hitungan hama ke 0?')) {
      fetch('/api/reset-counter', { method: 'POST' }).then(() => {
        showAlert('Hitungan hama di-reset');
        refresh();
      });
    }
  }

  function enterSleep() {
    if (confirm('Masukkan ESP32 ke Deep Sleep sekarang? (Akan bangun sesuai timer atau sensor)')) {
      fetch('/api/sleep', { method: 'POST' });
    }
  }

  // WiFi scan & save
  function scanWifi() {
    let s = document.getElementById('wifi_list');
    s.innerHTML = '<option>Memindai jaringan...</option>';
    fetch('/api/wifi-scan')
      .then(r => r.json())
      .then(d => {
        s.innerHTML = '';
        let nets = d.list || [];
        if (!nets || nets.length === 0) {
          s.innerHTML = '<option>Tidak ada WiFi terdeteksi</option>';
          return;
        }
        nets.forEach(n => {
          let o = document.createElement('option');
          o.value = n.ssid;
          o.text = `${n.ssid} (${n.rssi} dBm)${n.sec ? ' [Terkunci]' : ''}`;
          s.appendChild(o);
        });
        if (nets[0]) document.getElementById('wifi_ssid').value = nets[0].ssid;
      });
  }

  function saveWifi() {
    let ssid = document.getElementById('wifi_ssid').value;
    let pass = document.getElementById('wifi_pass').value;
    if (!ssid) return alert('SSID tidak boleh kosong!');
    fetch(`/api/wifi-save?ssid=${encodeURIComponent(ssid)}&pass=${encodeURIComponent(pass)}`, { method: 'POST' })
      .then(() => alert('WiFi disimpan. ESP32 mencoba menghubungkan...'));
  }

  // Server & Modem config
  function saveServer() {
    let p = {
      trapId: document.getElementById('cfg_trap_id').value,
      trapName: document.getElementById('cfg_trap_name').value,
      host: document.getElementById('cfg_ws_host').value,
      port: parseInt(document.getElementById('cfg_ws_port').value) || 8080,
      path: document.getElementById('cfg_ws_path').value,
      ssl: document.getElementById('cfg_ws_ssl').checked
    };
    fetch('/api/server-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    }).then(() => showAlert('Konfigurasi server disimpan!'));
  }

  function saveModem() {
    let p = {
      pulse: parseInt(document.getElementById('cfg_m_pulse').value),
      boot: parseInt(document.getElementById('cfg_m_boot').value),
      retry: parseInt(document.getElementById('cfg_m_retry').value),
      wait: parseInt(document.getElementById('cfg_m_wait').value)
    };
    fetch('/api/modem-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    }).then(() => showAlert('Parameter modem disimpan!'));
  }

  function restartEsp() {
    if (confirm('Yakin ingin restart perangkat ESP32?')) {
      fetch('/api/restart', { method: 'POST' });
    }
  }

  // Auto polling setiap 3 detik
  refresh();
  pollTimer = setInterval(refresh, 3000);
</script>
</body>
</html>
)rawliteral";

void setupWebServer() {
  // Halaman Utama Web Dashboard Lokal
  server.on("/", HTTP_GET, []() {
    server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    server.send_P(200, "text/html", INDEX_HTML);
  });

  // Favicon handler agar browser tidak 404 / 302 redirect loop
  server.on("/favicon.ico", HTTP_GET, []() {
    server.send(204);
  });

  // Captive Portal Redirects untuk Berbagai OS (Android, iOS, Windows)
  auto captiveRedirect = []() {
    server.sendHeader("Location", "/", true);
    server.send(302, "text/plain", "");
  };
  server.on("/generate_204", captiveRedirect);
  server.on("/gen_204", captiveRedirect);
  server.on("/hotspot-detect.html", captiveRedirect);
  server.on("/canonical.html", captiveRedirect);
  server.on("/connecttest.txt", captiveRedirect);
  server.on("/ncsi.txt", captiveRedirect);

  // API Scan WiFi Sekitar (Asinkron & Cepat, Tanpa Freeze CPU)
  server.on("/api/wifi-scan", HTTP_GET, []() {
    if (modemCheckState == MODEM_CHECK_SCANNING) {
      server.send(200, "application/json", "{\"status\":\"scanning\",\"list\":[]}");
      return;
    }
    int16_t scanStatus = WiFi.scanComplete();
    if (scanStatus == WIFI_SCAN_FAILED || scanStatus == -2) {
      // Mulai scan baru secara asinkron (0ms blocking time)
      WiFi.scanNetworks(true, false);
      server.send(200, "application/json", "{\"status\":\"scanning\",\"list\":[]}");
      return;
    }
    if (scanStatus == WIFI_SCAN_RUNNING) {
      server.send(200, "application/json", "{\"status\":\"scanning\",\"list\":[]}");
      return;
    }

    // Scan selesai (scanStatus >= 0)
    StaticJsonDocument<1536> doc;
    doc["status"] = "done";
    JsonArray arr = doc.createNestedArray("list");
    for (int i = 0; i < scanStatus && i < 20; ++i) {
      String s = WiFi.SSID(i);
      if (s.length() == 0) continue;
      JsonObject item = arr.createNestedObject();
      item["ssid"] = s;
      item["rssi"] = WiFi.RSSI(i);
      item["sec"]  = (WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
    }
    WiFi.scanDelete();
    String res;
    serializeJson(doc, res);
    server.send(200, "application/json", res);
  });

  // API Simpan & Sambungkan WiFi
  server.on("/api/wifi-save", HTTP_POST, []() {
    if (server.hasArg("ssid")) {
      wifiSsid = server.arg("ssid");
      wifiSsid.trim();
    }
    if (server.hasArg("pass")) {
      wifiPass = server.arg("pass");
    }
    savePreferences();
    Serial.printf("[WiFi Save] SSID: %s tersimpan. ESP32 merestart...\n", wifiSsid.c_str());
    server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"WiFi tersimpan! ESP32 akan menyambung...\"}");
    shouldRestart = true;
    restartTriggerTime = millis();
  });

  // API Status JSON
  server.on("/api/status", HTTP_GET, []() {
    StaticJsonDocument<1536> doc;
    doc["trapId"] = trapId;
    doc["trapName"] = trapName;
    doc["wsHost"] = wsHost;
    doc["wsPort"] = wsPort;
    doc["wsPath"] = wsPath;
    doc["wsUseSsl"] = wsUseSsl;
    doc["wifiSsid"] = wifiSsid;
    doc["wifiStatus"] = (WiFi.status() == WL_CONNECTED ? "TERKONEKSI" : "HOTSPOT AP");
    doc["wifiIp"] = (WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString());
    doc["wsConnected"] = webSocket.isConnected();

    doc["mode"] = (currentMode == MODE_MANUAL ? "manual" : (currentMode == MODE_OTOMATIS ? "otomatis" : "otomatis-led"));
    doc["activePreset"] = activePreset;
    doc["uvLedStatus"] = uvLedEnabled;
    doc["ledIsOn"] = ledIsOn;
    doc["blowerStatus"] = blowerEnabled || zapperActive;
    doc["batteryVoltage"] = serialized(String(busVoltage_V, 2));
    doc["loadCurrent"] = (int)current_mA;
    doc["currentDistance"] = currentDistance;
    doc["photoelectricCount"] = pestCounter;
    char timeStr[10];
    snprintf(timeStr, sizeof(timeStr), "%02d:%02d:%02d", rtcHour, rtcMinute, rtcSecond);
    doc["currentTime"] = timeStr;
    doc["startTime"] = String(startHour) + ":" + (startMin < 10 ? "0" : "") + String(startMin);
    doc["endTime"] = String(endHour) + ":" + (endMin < 10 ? "0" : "") + String(endMin);
    doc["ledRotationInterval"] = ledRotationInterval;
    doc["manualIntervalMin"] = manualIntervalMin;
    doc["manualDurationSec"] = manualDurationSec;
    doc["sensorCooldownSec"] = sensorCooldownSec;
    doc["distThresholdMm"] = distThreshold_mm;
    doc["distMinMm"] = distMin_mm;
    doc["ledColor"] = presets[activePreset].name;
    doc["blowerMode"] = blowerMode;
    doc["ledRunning"] = ledRunning;
    doc["modemPulseSec"] = (int)(modemPulseMs / 1000);
    doc["modemBootDelaySec"] = (int)(modemBootDelayMs / 1000);
    doc["modemRetryIntervalSec"] = (int)(modemRetryIntervalMs / 1000);
    doc["modemWaitWifiSec"] = (int)(modemWaitWifiMs / 1000);

    JsonArray pArr = doc.createNestedArray("presets");
    for (int i = 0; i < 5; i++) {
      JsonObject pObj = pArr.createNestedObject();
      pObj["id"] = "preset-" + String(i + 1);
      pObj["name"] = presets[i].name;
      pObj["r"] = presets[i].r;
      pObj["g"] = presets[i].g;
      pObj["b"] = presets[i].b;
    }

    String jsonResponse;
    serializeJson(doc, jsonResponse);
    server.send(200, "application/json", jsonResponse);
  });

  // API Konfigurasi JSON
  server.on("/api/config", HTTP_GET, []() {
    StaticJsonDocument<1536> doc;
    doc["trapId"] = trapId;
    doc["trapName"] = trapName;
    doc["wsHost"] = wsHost;
    doc["wsPort"] = wsPort;
    doc["wsPath"] = wsPath;
    doc["wsUseSsl"] = wsUseSsl;
    doc["wifiSsid"] = wifiSsid;
    doc["startTime"] = String(startHour) + ":" + (startMin < 10 ? "0" : "") + String(startMin);
    doc["endTime"] = String(endHour) + ":" + (endMin < 10 ? "0" : "") + String(endMin);
    doc["ledRotationInterval"] = ledRotationInterval;
    doc["manualIntervalMin"] = manualIntervalMin;
    doc["manualDurationSec"] = manualDurationSec;
    doc["sensorCooldownSec"] = sensorCooldownSec;
    doc["distThresholdMm"] = distThreshold_mm;
    doc["distMinMm"] = distMin_mm;
    doc["blowerMode"] = blowerMode;
    doc["ledRunning"] = ledRunning;
    doc["modemPulseSec"] = (int)(modemPulseMs / 1000);
    doc["modemBootDelaySec"] = (int)(modemBootDelayMs / 1000);
    doc["modemRetryIntervalSec"] = (int)(modemRetryIntervalMs / 1000);
    doc["modemWaitWifiSec"] = (int)(modemWaitWifiMs / 1000);

    JsonArray pArr = doc.createNestedArray("presets");
    for (int i = 0; i < 5; i++) {
      JsonObject pObj = pArr.createNestedObject();
      pObj["id"] = "preset-" + String(i + 1);
      pObj["name"] = presets[i].name;
      pObj["r"] = presets[i].r;
      pObj["g"] = presets[i].g;
      pObj["b"] = presets[i].b;
    }

    String jsonResponse;
    serializeJson(doc, jsonResponse);
    server.send(200, "application/json", jsonResponse);
  });

  // API Simpan Konfigurasi Perangkat & Server
  server.on("/api/settings", HTTP_POST, []() {
    bool updated = false;

    if (server.hasArg("plain")) {
      StaticJsonDocument<512> doc;
      if (!deserializeJson(doc, server.arg("plain"))) {
        if (doc.containsKey("trapId"))   { trapId   = doc["trapId"].as<String>(); trapId.trim(); updated = true; }
        if (doc.containsKey("trapName")) { trapName = doc["trapName"].as<String>(); trapName.trim(); updated = true; }
        if (doc.containsKey("wsHost"))   { wsHost   = doc["wsHost"].as<String>(); wsHost.trim(); updated = true; }
        if (doc.containsKey("wsPort"))   { wsPort   = doc["wsPort"].as<int>(); updated = true; }
        if (doc.containsKey("wsPath"))   { wsPath   = doc["wsPath"].as<String>(); wsPath.trim(); updated = true; }
        if (doc.containsKey("wsUseSsl")) { wsUseSsl = doc["wsUseSsl"].as<bool>(); updated = true; }
      }
    }

    if (server.hasArg("trapId"))   { trapId   = server.arg("trapId"); trapId.trim(); updated = true; }
    if (server.hasArg("trapName")) { trapName = server.arg("trapName"); trapName.trim(); updated = true; }
    if (server.hasArg("wsHost"))   { wsHost   = server.arg("wsHost"); wsHost.trim(); updated = true; }
    if (server.hasArg("wsPort"))   { wsPort   = server.arg("wsPort").toInt(); updated = true; }
    if (server.hasArg("wsPath"))   { wsPath   = server.arg("wsPath"); wsPath.trim(); updated = true; }
    if (server.hasArg("wsUseSsl")) {
      String s = server.arg("wsUseSsl");
      wsUseSsl = (s == "1" || s == "true");
      updated = true;
    }

    // Pengaturan Modem WiFi Trigger (dalam detik, konversi ke ms)
    if (server.hasArg("modemPulseSec")) {
      int v = server.arg("modemPulseSec").toInt();
      if (v >= 1 && v <= 30) { modemPulseMs = (unsigned long)v * 1000UL; updated = true; }
    }
    if (server.hasArg("modemBootDelaySec")) {
      int v = server.arg("modemBootDelaySec").toInt();
      if (v >= 5 && v <= 300) { modemBootDelayMs = (unsigned long)v * 1000UL; updated = true; }
    }
    if (server.hasArg("modemRetryIntervalSec")) {
      int v = server.arg("modemRetryIntervalSec").toInt();
      if (v >= 10 && v <= 300) { modemRetryIntervalMs = (unsigned long)v * 1000UL; updated = true; }
    }
    if (server.hasArg("modemWaitWifiSec")) {
      int v = server.arg("modemWaitWifiSec").toInt();
      if (v >= 30 && v <= 600) { modemWaitWifiMs = (unsigned long)v * 1000UL; updated = true; }
    }

    if (updated) {
      savePreferences();
      setupWebSocket();
      Serial.println("[Web Config] Konfigurasi trapId & WebSocket tersimpan!");
      server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Pengaturan server berhasil disimpan!\"}");
    } else {
      server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Tidak ada parameter valid\"}");
    }
  });

  // API Restart ESP32
  server.on("/api/restart", HTTP_POST, []() {
    server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"ESP32 akan merestart dalam 1 detik...\"}");
    shouldRestart = true;
    restartTriggerTime = millis();
  });

  // API Kontrol Komprehensif (Sinkron Penuh dengan IoT Web Dashboard)
  server.on("/api/control", HTTP_POST, []() {
    bool updated = false;

    if (server.hasArg("plain")) {
      StaticJsonDocument<1024> doc;
      if (!deserializeJson(doc, server.arg("plain"))) {
        if (doc.containsKey("mode")) {
          String m = doc["mode"].as<String>();
          if (m == "manual") { currentMode = MODE_MANUAL; lastManualCycleStart = millis(); }
          else if (m == "otomatis") currentMode = MODE_OTOMATIS;
          else if (m == "otomatis-led" || m == "otomatis_led") currentMode = MODE_OTOMATIS_LED;
          updated = true;
        }
        if (doc.containsKey("blowerMode")) {
          blowerMode = doc["blowerMode"].as<String>();
          updated = true;
        }
        if (doc.containsKey("ledRunning")) {
          ledRunning = doc["ledRunning"].as<bool>();
          updated = true;
        }
        if (doc.containsKey("activePreset")) {
          int p = doc["activePreset"].as<int>();
          if (p >= 0 && p < 5) activePreset = p;
          updated = true;
        }
        if (doc.containsKey("startTime")) {
          String s = doc["startTime"].as<String>();
          int c = s.indexOf(':');
          if (c > 0) { startHour = s.substring(0, c).toInt(); startMin = s.substring(c + 1).toInt(); updated = true; }
        }
        if (doc.containsKey("endTime")) {
          String e = doc["endTime"].as<String>();
          int c = e.indexOf(':');
          if (c > 0) { endHour = e.substring(0, c).toInt(); endMin = e.substring(c + 1).toInt(); updated = true; }
        }
        if (doc.containsKey("ledRotationInterval")) {
          int r = doc["ledRotationInterval"].as<int>();
          if (r >= 1 && r <= 180) { ledRotationInterval = r; updated = true; }
        }
        if (doc.containsKey("manualIntervalMin")) {
          int mi = doc["manualIntervalMin"].as<int>();
          if (mi >= 1 && mi <= 1440) { manualIntervalMin = mi; updated = true; }
        }
        if (doc.containsKey("manualDurationSec")) {
          int md = doc["manualDurationSec"].as<int>();
          if (md >= 1 && md <= 3600) { manualDurationSec = md; updated = true; }
        }
        if (doc.containsKey("sensorCooldownSec")) {
          int sc = doc["sensorCooldownSec"].as<int>();
          if (sc >= 1 && sc <= 300) { sensorCooldownSec = sc; updated = true; }
        }
        if (doc.containsKey("distThresholdMm")) {
          int dt = doc["distThresholdMm"].as<int>();
          if (dt >= 10 && dt <= 2000) { distThreshold_mm = dt; updated = true; }
        } else if (doc.containsKey("dist_threshold_mm")) {
          int dt = doc["dist_threshold_mm"].as<int>();
          if (dt >= 10 && dt <= 2000) { distThreshold_mm = dt; updated = true; }
        }
        if (doc.containsKey("distMinMm")) {
          int dm = doc["distMinMm"].as<int>();
          if (dm >= 0 && dm <= 500) { distMin_mm = dm; updated = true; }
        } else if (doc.containsKey("dist_min_mm")) {
          int dm = doc["dist_min_mm"].as<int>();
          if (dm >= 0 && dm <= 500) { distMin_mm = dm; updated = true; }
        }
        if (doc.containsKey("presets")) {
          JsonArray pArr = doc["presets"].as<JsonArray>();
          int i = 0;
          for (JsonObject pItem : pArr) {
            if (i >= 5) break;
            if (pItem.containsKey("name")) {
              String n = pItem["name"].as<String>();
              strncpy(presets[i].name, n.c_str(), sizeof(presets[i].name) - 1);
              presets[i].name[sizeof(presets[i].name) - 1] = '\0';
            }
            if (pItem.containsKey("r")) presets[i].r = pItem["r"].as<int>();
            if (pItem.containsKey("g")) presets[i].g = pItem["g"].as<int>();
            if (pItem.containsKey("b")) presets[i].b = pItem["b"].as<int>();
            i++;
          }
          updated = true;
        }
      }
    }
    
    // Fallback: baca form parameter jika tidak menggunakan JSON body
    if (server.hasArg("mode")) {
      String m = server.arg("mode");
      if (m == "manual") { currentMode = MODE_MANUAL; lastManualCycleStart = millis(); }
      else if (m == "otomatis") currentMode = MODE_OTOMATIS;
      else if (m == "otomatis-led" || m == "otomatis_led") currentMode = MODE_OTOMATIS_LED;
      updated = true;
    }
    if (server.hasArg("blowerMode")) {
      blowerMode = server.arg("blowerMode");
      updated = true;
    }
    if (server.hasArg("ledRunning")) {
      ledRunning = (server.arg("ledRunning") == "true" || server.arg("ledRunning") == "1");
      updated = true;
    }
    if (server.hasArg("activePreset")) {
      int p = server.arg("activePreset").toInt();
      if (p >= 0 && p < 5) { activePreset = p; updated = true; }
    }
    if (server.hasArg("startTime")) {
      String s = server.arg("startTime");
      int c = s.indexOf(':');
      if (c > 0) { startHour = s.substring(0, c).toInt(); startMin = s.substring(c + 1).toInt(); updated = true; }
    }
    if (server.hasArg("endTime")) {
      String e = server.arg("endTime");
      int c = e.indexOf(':');
      if (c > 0) { endHour = e.substring(0, c).toInt(); endMin = e.substring(c + 1).toInt(); updated = true; }
    }
    if (server.hasArg("ledRotationInterval")) {
      int r = server.arg("ledRotationInterval").toInt();
      if (r >= 1 && r <= 180) { ledRotationInterval = r; updated = true; }
    }
    if (server.hasArg("manualIntervalMin")) {
      int mi = server.arg("manualIntervalMin").toInt();
      if (mi >= 1 && mi <= 1440) { manualIntervalMin = mi; updated = true; }
    }
    if (server.hasArg("manualDurationSec")) {
      int md = server.arg("manualDurationSec").toInt();
      if (md >= 1 && md <= 3600) { manualDurationSec = md; updated = true; }
    }
    if (server.hasArg("sensorCooldownSec")) {
      int sc = server.arg("sensorCooldownSec").toInt();
      if (sc >= 1 && sc <= 300) { sensorCooldownSec = sc; updated = true; }
    }
    if (server.hasArg("distThresholdMm")) {
      int dt = server.arg("distThresholdMm").toInt();
      if (dt >= 10 && dt <= 2000) { distThreshold_mm = dt; updated = true; }
    } else if (server.hasArg("dist_threshold_mm")) {
      int dt = server.arg("dist_threshold_mm").toInt();
      if (dt >= 10 && dt <= 2000) { distThreshold_mm = dt; updated = true; }
    }
    if (server.hasArg("distMinMm")) {
      int dm = server.arg("distMinMm").toInt();
      if (dm >= 0 && dm <= 500) { distMin_mm = dm; updated = true; }
    } else if (server.hasArg("dist_min_mm")) {
      int dm = server.arg("dist_min_mm").toInt();
      if (dm >= 0 && dm <= 500) { distMin_mm = dm; updated = true; }
    }

    if (updated) {
      updateActuators();
      savePreferences();
      sendTelemetryToEws();
      server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Semua konfigurasi berhasil diterapkan & disinkronkan\"}");
    } else {
      server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Format JSON tidak valid\"}");
    }
  });

  // API Ganti Mode
  server.on("/api/mode", HTTP_POST, []() {
    String m = "";
    if (server.hasArg("val")) m = server.arg("val");
    else if (server.hasArg("mode")) m = server.arg("mode");

    if (m.length() > 0) {
      if (m == "manual") {
        currentMode = MODE_MANUAL;
        lastManualCycleStart = millis();
      }
      else if (m == "otomatis") currentMode = MODE_OTOMATIS;
      else if (m == "otomatis-led" || m == "otomatis_led") currentMode = MODE_OTOMATIS_LED;
      else if (m == "sleep") {
        server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Entering sleep\"}");
        delay(200);
        enterDeepSleep();
        return;
      }
      updateActuators();
      savePreferences();
      sendTelemetryToEws();
      server.send(200, "application/json", "{\"status\":\"ok\"}");
    } else {
      server.send(400, "application/json", "{\"status\":\"error\"}");
    }
  });

  // API Pilih Preset
  server.on("/api/preset", HTTP_POST, []() {
    int idx = -1;
    if (server.hasArg("val")) idx = server.arg("val").toInt();
    else if (server.hasArg("id")) idx = server.arg("id").toInt();

    if (idx >= 0 && idx < 5) {
      activePreset = idx;
      updateActuators();
      savePreferences();
      sendTelemetryToEws();
      server.send(200, "application/json", "{\"status\":\"ok\"}");
    } else {
      server.send(400, "application/json", "{\"status\":\"error\"}");
    }
  });

  // API Edit Preset Nilai RGB & Nama
  server.on("/api/preset/edit", HTTP_POST, []() {
    int idx = -1;
    String name = "";
    int r = -1, g = -1, b = -1;

    if (server.hasArg("plain")) {
      StaticJsonDocument<256> doc;
      if (!deserializeJson(doc, server.arg("plain"))) {
        if (doc.containsKey("index")) idx = doc["index"].as<int>();
        else if (doc.containsKey("idx")) idx = doc["idx"].as<int>();
        if (doc.containsKey("name")) name = doc["name"].as<String>();
        if (doc.containsKey("r")) r = doc["r"].as<int>();
        if (doc.containsKey("g")) g = doc["g"].as<int>();
        if (doc.containsKey("b")) b = doc["b"].as<int>();
      }
    }

    if (server.hasArg("idx")) idx = server.arg("idx").toInt();
    else if (server.hasArg("index")) idx = server.arg("index").toInt();
    if (server.hasArg("name")) name = server.arg("name");
    if (server.hasArg("r")) r = server.arg("r").toInt();
    if (server.hasArg("g")) g = server.arg("g").toInt();
    if (server.hasArg("b")) b = server.arg("b").toInt();

    if (idx >= 0 && idx < 5) {
      if (name.length() > 0) {
        strncpy(presets[idx].name, name.c_str(), sizeof(presets[idx].name) - 1);
        presets[idx].name[sizeof(presets[idx].name) - 1] = '\0';
      }
      if (r >= 0 && r <= 255) presets[idx].r = r;
      if (g >= 0 && g <= 255) presets[idx].g = g;
      if (b >= 0 && b <= 255) presets[idx].b = b;

      updateActuators();
      savePreferences();
      sendTelemetryToEws();
      server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Preset berhasil diperbarui\"}");
      return;
    }
    server.send(400, "application/json", "{\"status\":\"error\"}");
  });

  // API Simpan Jadwal & Interval
  server.on("/api/schedule", HTTP_POST, []() {
    if (server.hasArg("start")) {
      String s = server.arg("start");
      int colon = s.indexOf(':');
      if (colon > 0) {
        startHour = s.substring(0, colon).toInt();
        startMin = s.substring(colon + 1).toInt();
      }
    }
    if (server.hasArg("end")) {
      String e = server.arg("end");
      int colon = e.indexOf(':');
      if (colon > 0) {
        endHour = e.substring(0, colon).toInt();
        endMin = e.substring(colon + 1).toInt();
      }
    }
    if (server.hasArg("rot")) {
      int rot = server.arg("rot").toInt();
      if (rot >= 1 && rot <= 180) ledRotationInterval = rot;
    }
    if (server.hasArg("m_int")) {
      int mi = server.arg("m_int").toInt();
      if (mi >= 1 && mi <= 1440) manualIntervalMin = mi;
    }
    if (server.hasArg("m_dur")) {
      int md = server.arg("m_dur").toInt();
      if (md >= 1 && md <= 3600) manualDurationSec = md;
    }
    savePreferences();
    sendTelemetryToEws();
    server.send(200, "application/json", "{\"status\":\"ok\"}");
  });

  // API Toggle UV LED
  server.on("/api/toggle-uv", HTTP_POST, []() {
    if (server.hasArg("val")) {
      uvLedEnabled = (server.arg("val") == "true" || server.arg("val") == "1");
    } else {
      uvLedEnabled = !uvLedEnabled;
    }
    if (uvLedEnabled) lastManualCycleStart = millis();
    updateActuators();
    savePreferences();
    sendTelemetryToEws();
    server.send(200, "application/json", "{\"status\":\"ok\",\"uvLedStatus\":" + String(uvLedEnabled ? "true" : "false") + "}");
  });

  // API Toggle Blower
  server.on("/api/toggle-blower", HTTP_POST, []() {
    if (server.hasArg("val")) {
      blowerEnabled = (server.arg("val") == "true" || server.arg("val") == "1");
    } else {
      blowerEnabled = !blowerEnabled;
    }
    digitalWrite(PIN_RELAY_1, blowerEnabled ? HIGH : LOW);
    digitalWrite(PIN_RELAY_2, blowerEnabled ? HIGH : LOW);
    zapperActive = blowerEnabled;
    savePreferences();
    sendTelemetryToEws();
    server.send(200, "application/json", "{\"status\":\"ok\",\"blowerStatus\":" + String(blowerEnabled ? "true" : "false") + "}");
  });

  // API Trigger Zap Manual
  server.on("/api/zap", HTTP_POST, []() {
    triggerZapperCycle();
    server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Siklus zap dipicu\"}");
  });

  // API Reset Counter Hama
  server.on("/api/reset-counter", HTTP_POST, []() {
    pestCounter = 0;
    savePreferences();
    sendTelemetryToEws();
    server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Counter direset\"}");
  });

  // API Masuk Mode Sleep
  server.on("/api/sleep", HTTP_POST, []() {
    server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Entering sleep\"}");
    delay(200);
    enterDeepSleep();
  });

  // API Simpan Konfigurasi Server
  server.on("/api/server-save", HTTP_POST, []() {
    bool updated = false;
    if (server.hasArg("plain")) {
      StaticJsonDocument<512> doc;
      if (!deserializeJson(doc, server.arg("plain"))) {
        if (doc.containsKey("trapId"))   { trapId   = doc["trapId"].as<String>(); trapId.trim(); updated = true; }
        if (doc.containsKey("trapName")) { trapName = doc["trapName"].as<String>(); trapName.trim(); updated = true; }
        if (doc.containsKey("host"))     { wsHost   = doc["host"].as<String>(); wsHost.trim(); updated = true; }
        if (doc.containsKey("port"))     { wsPort   = doc["port"].as<int>(); updated = true; }
        if (doc.containsKey("path"))     { wsPath   = doc["path"].as<String>(); wsPath.trim(); updated = true; }
        if (doc.containsKey("ssl"))      { wsUseSsl = doc["ssl"].as<bool>(); updated = true; }
      }
    }
    if (updated) {
      savePreferences();
      setupWebSocket();
      server.send(200, "application/json", "{\"status\":\"ok\"}");
    } else {
      server.send(400, "application/json", "{\"status\":\"error\"}");
    }
  });

  // API Simpan Parameter Modem
  server.on("/api/modem-save", HTTP_POST, []() {
    bool updated = false;
    if (server.hasArg("plain")) {
      StaticJsonDocument<256> doc;
      if (!deserializeJson(doc, server.arg("plain"))) {
        if (doc.containsKey("pulse")) { modemPulseMs = doc["pulse"].as<unsigned long>(); updated = true; }
        if (doc.containsKey("boot"))  { modemBootDelayMs = doc["boot"].as<unsigned long>(); updated = true; }
        if (doc.containsKey("retry")) { modemRetryIntervalMs = doc["retry"].as<unsigned long>(); updated = true; }
        if (doc.containsKey("wait"))  { modemWaitWifiMs = doc["wait"].as<unsigned long>(); updated = true; }
      }
    }
    if (updated) {
      savePreferences();
      server.send(200, "application/json", "{\"status\":\"ok\"}");
    } else {
      server.send(400, "application/json", "{\"status\":\"error\"}");
    }
  });

  // Catch-all 404 handler untuk redirect captive portal
  server.onNotFound([]() {
    server.sendHeader("Location", "/", true);
    server.send(302, "text/plain", "");
  });
}

// ==============================================================================
// 14. INTEGRASI IOT KE SERVER EWS (WEBSOCKET CLIENT)
// ==============================================================================
void setupWebSocket() {
  if (wsHost.length() == 0) {
    Serial.println("[WARN] [WS] Host WebSocket belum disetting, lewati koneksi.");
    return;
  }

  webSocket.disconnect();
  if (wsUseSsl) {
    webSocket.beginSSL(wsHost.c_str(), wsPort, wsPath.c_str());
  } else {
    webSocket.begin(wsHost.c_str(), wsPort, wsPath.c_str());
  }

  webSocket.onEvent([](WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
      case WStype_DISCONNECTED:
        Serial.println("[ERROR] [WS] Terputus dari Server EWS");
        break;
      case WStype_CONNECTED: {
        Serial.println("[OK] [WS] Terhubung ke Server EWS!");
        // Berlangganan (Subscribe) ke topik perintah kontrol trap: traps/{trapId}/command
        String cmdTopic = "traps/" + trapId + "/command";
        StaticJsonDocument<256> subDoc;
        subDoc["action"] = "subscribe";
        subDoc["topic"] = cmdTopic;
        String subMsg;
        serializeJson(subDoc, subMsg);
        webSocket.sendTXT(subMsg);
        Serial.print("[WS Subscribe] ");
        Serial.println(cmdTopic);

        // Kirim telemetri awal segera setelah koneksi sukses
        sendTelemetryToEws();
        break;
      }
      case WStype_TEXT:
        handleWsMessage(payload, length);
        break;
      case WStype_BIN:
      case WStype_ERROR:
      case WStype_PONG:
      default:
        break;
    }
  });

  webSocket.setReconnectInterval(5000);
}

void handleWsMessage(uint8_t *payload, size_t length) {
  // Catat waktu aktivitas client agar ESP32 masuk/memperpanjang mode telemetri cepat
  lastClientActivityTime = millis();

  StaticJsonDocument<1024> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) {
    Serial.print("[WARN] [WS JSON Error] ");
    Serial.println(error.c_str());
    return;
  }

  // Buka bungkus nested "payload" (bisa berlapis dari backend EWS)
  JsonObject data = doc.as<JsonObject>();
  while (data.containsKey("payload") && data["payload"].is<JsonObject>()) {
    data = data["payload"].as<JsonObject>();
  }

  // 1. Kontrol Saklar LED UV (ON / OFF)
  if (data.containsKey("uvLedStatus")) {
    uvLedEnabled = data["uvLedStatus"].as<bool>();
    if (uvLedEnabled) {
      lastManualCycleStart = millis(); // Reset siklus agar langsung menyala saat diaktifkan
    }
    Serial.print("[WS] Saklar UV LED: ");
    Serial.println(uvLedEnabled ? "ON" : "OFF");
  } else if (data.containsKey("ledIsOn")) {
    uvLedEnabled = data["ledIsOn"].as<bool>();
    if (uvLedEnabled) lastManualCycleStart = millis();
  }

  // 2. Kontrol Blower Manual dari Web (test trigger)
  if (data.containsKey("blowerStatus")) {
    bool blowerCmd = data["blowerStatus"].as<bool>();
    if (blowerCmd && !blowerEnabled) {
      // Nyalakan blower selama manualDurationSec detik (sama seperti trigger sensor)
      digitalWrite(PIN_RELAY_1, HIGH);
      digitalWrite(PIN_RELAY_2, HIGH);
      blowerEnabled = true;
      zapperActive = true;
      blowerOffTime = millis() + ((unsigned long)manualDurationSec * 1000UL);
      Serial.print("[WS] Blower ON selama ");
      Serial.print(manualDurationSec);
      Serial.println(" detik (perintah dari Web)");
    } else if (!blowerCmd) {
      // Matikan blower langsung
      digitalWrite(PIN_RELAY_1, LOW);
      digitalWrite(PIN_RELAY_2, LOW);
      blowerEnabled = false;
      zapperActive = false;
      Serial.println("[WS] Blower MATI (perintah dari Web)");
    }
  }

  // 3. Ubah Mode
  if (data.containsKey("mode")) {
    String m = data["mode"].as<String>();
    if (m == "manual") {
      currentMode = MODE_MANUAL;
      lastManualCycleStart = millis();
    }
    else if (m == "otomatis") currentMode = MODE_OTOMATIS;
    else if (m == "otomatis-led" || m == "otomatis_led") currentMode = MODE_OTOMATIS_LED;
    else if (m == "sleep") {
      enterDeepSleep();
      return;
    }
  }

  // 4. Ubah Preset Aktif
  if (data.containsKey("activePreset")) {
    int p = data["activePreset"].as<int>();
    if (p >= 0 && p < 5) activePreset = p;
  }

  // 5. Ubah Jadwal
  if (data.containsKey("startTime")) {
    String s = data["startTime"].as<String>();
    int colon = s.indexOf(':');
    if (colon > 0) {
      startHour = s.substring(0, colon).toInt();
      startMin = s.substring(colon + 1).toInt();
    }
  }
  if (data.containsKey("endTime")) {
    String e = data["endTime"].as<String>();
    int colon = e.indexOf(':');
    if (colon > 0) {
      endHour = e.substring(0, colon).toInt();
      endMin = e.substring(colon + 1).toInt();
    }
  }

  // 6. Ubah Interval Rotasi LED
  if (data.containsKey("ledRotationInterval")) {
    int rot = data["ledRotationInterval"].as<int>();
    if (rot >= 1 && rot <= 180) ledRotationInterval = rot;
  }

  // 7. Ubah Pengaturan Siklus Manual
  if (data.containsKey("manualIntervalMin")) {
    int mInt = data["manualIntervalMin"].as<int>();
    if (mInt >= 1 && mInt <= 1440) manualIntervalMin = mInt;
  }
  if (data.containsKey("manualDurationSec")) {
    int mDur = data["manualDurationSec"].as<int>();
    if (mDur >= 1 && mDur <= 3600) manualDurationSec = mDur;
  }
  if (data.containsKey("sensorCooldownSec")) {
    int sCd = data["sensorCooldownSec"].as<int>();
    if (sCd >= 1 && sCd <= 300) sensorCooldownSec = sCd;
  } else if (data.containsKey("sensor_cooldown_sec")) {
    int sCd = data["sensor_cooldown_sec"].as<int>();
    if (sCd >= 1 && sCd <= 300) sensorCooldownSec = sCd;
  }
  if (data.containsKey("distThresholdMm")) {
    int dt = data["distThresholdMm"].as<int>();
    if (dt >= 10 && dt <= 2000) distThreshold_mm = dt;
  } else if (data.containsKey("dist_threshold_mm")) {
    int dt = data["dist_threshold_mm"].as<int>();
    if (dt >= 10 && dt <= 2000) distThreshold_mm = dt;
  }
  if (data.containsKey("distMinMm")) {
    int dm = data["distMinMm"].as<int>();
    if (dm >= 0 && dm <= 500) distMin_mm = dm;
  } else if (data.containsKey("dist_min_mm")) {
    int dm = data["dist_min_mm"].as<int>();
    if (dm >= 0 && dm <= 500) distMin_mm = dm;
  }

  // 8. Update Preset Warna dari Web Dashboard
  if (data.containsKey("presets")) {
    JsonArray pArr = data["presets"].as<JsonArray>();
    int i = 0;
    for (JsonObject pItem : pArr) {
      if (i >= 5) break;
      int targetIdx = i;
      if (pItem.containsKey("index")) targetIdx = pItem["index"].as<int>();
      else if (pItem.containsKey("idx")) targetIdx = pItem["idx"].as<int>();
      else if (pItem.containsKey("id")) targetIdx = pItem["id"].as<int>() - 1; // Jika ID berbasis 1..5

      if (targetIdx >= 0 && targetIdx < 5) {
        if (pItem.containsKey("name")) {
          String n = pItem["name"].as<String>();
          strncpy(presets[targetIdx].name, n.c_str(), sizeof(presets[targetIdx].name) - 1);
          presets[targetIdx].name[sizeof(presets[targetIdx].name) - 1] = '\0';
        }
        if (pItem.containsKey("r")) presets[targetIdx].r = pItem["r"].as<int>();
        if (pItem.containsKey("g")) presets[targetIdx].g = pItem["g"].as<int>();
        if (pItem.containsKey("b")) presets[targetIdx].b = pItem["b"].as<int>();
      }
      i++;
    }
  }

  // 9. Manual Zap / Reset Trigger / Request Telemetri Cepat
  if (data.containsKey("command")) {
    String cmd = data["command"].as<String>();
    if (cmd == "FAST_TELEMETRY" || cmd == "REQUEST_DATA" || cmd == "REQUEST_TELEMETRY") {
      lastClientActivityTime = millis();
      forceTelemetryPublish = true;
      Serial.println("[WS] Perintah telemetri cepat on-demand diterima dari Web!");
    } else if (cmd == "CLIENT_HEARTBEAT") {
      lastClientActivityTime = millis();
      Serial.println("[HEARTBEAT] Sinyal client web aktif memantau perangkap.");
    } else if (cmd == "TRIGGER_ZAP") {
      digitalWrite(PIN_RELAY_1, HIGH);
      digitalWrite(PIN_RELAY_2, HIGH);
      blowerEnabled = true;
      zapperActive = true;
      blowerOffTime = millis() + ((unsigned long)manualDurationSec * 1000UL);
    } else if (cmd == "RESET_COUNTER") {
      pestCounter = 0;
    }
  }

  // 10. Konfigurasi Mode Blower (sensor / time) & LED Running (berganti warna / 1 warna)
  if (data.containsKey("blowerMode")) {
    blowerMode = data["blowerMode"].as<String>();
  } else if (data.containsKey("blower_mode")) {
    blowerMode = data["blower_mode"].as<String>();
  }

  if (data.containsKey("ledRunning")) {
    ledRunning = data["ledRunning"].as<bool>();
  } else if (data.containsKey("led_running")) {
    ledRunning = data["led_running"].as<bool>();
  }

  updateActuators();
  savePreferences();
  sendTelemetryToEws();
}

void sendTelemetryToEws() {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<1536> root;
  root["action"] = "publish";
  root["topic"]  = "traps/" + trapId + "/telemetry";

  JsonObject p = root.createNestedObject("payload");
  p["trapId"] = trapId;
  p["uvLedStatus"] = uvLedEnabled;
  p["ledIsOn"] = ledIsOn;
  p["blowerStatus"] = blowerEnabled || zapperActive;
  p["pirTriggerCount"] = pestCounter;
  p["photoelectricCount"] = pestCounter;
  p["containerCapacityPercent"] = constrain(map(pestCounter, 0, 500, 0, 100), 0, 100);
  p["batteryVoltage"] = serialized(String(busVoltage_V, 2));
  p["solarChargingCurrent"] = (int)current_mA;
  p["currentDistance"] = currentDistance;
  p["mode"] = (currentMode == MODE_MANUAL ? "manual" : (currentMode == MODE_OTOMATIS ? "otomatis" : "otomatis_led"));
  p["activePreset"] = activePreset;
  p["ledColor"] = presets[activePreset].name;
  p["manualIntervalMin"] = manualIntervalMin;
  p["manualDurationSec"] = manualDurationSec;
  p["sensorCooldownSec"] = sensorCooldownSec;
  p["distThresholdMm"] = distThreshold_mm;
  p["distMinMm"] = distMin_mm;
  p["blowerMode"] = blowerMode;
  p["ledRunning"] = ledRunning;

  // Sertakan status adaptive telemetry (hemat daya 5 menit vs cepat 3 detik)
  bool isClientActive = (lastClientActivityTime > 0) && ((millis() - lastClientActivityTime) < CLIENT_ACTIVITY_TIMEOUT);
  p["isFastTelemetry"] = isClientActive;
  p["telemetryIntervalSec"] = isClientActive ? 3 : 300;

  char sTime[10], eTime[10];
  snprintf(sTime, sizeof(sTime), "%02d:%02d", startHour, startMin);
  snprintf(eTime, sizeof(eTime), "%02d:%02d", endHour, endMin);
  p["startTime"] = sTime;
  p["endTime"] = eTime;
  p["ledRotationInterval"] = ledRotationInterval;

  JsonArray pArr = p.createNestedArray("presets");
  for (int i = 0; i < 5; i++) {
    JsonObject pObj = pArr.createNestedObject();
    pObj["id"] = "preset-" + String(i + 1);
    pObj["name"] = presets[i].name;
    pObj["r"] = presets[i].r;
    pObj["g"] = presets[i].g;
    pObj["b"] = presets[i].b;
  }

  String out;
  serializeJson(root, out);
  webSocket.sendTXT(out);
}

// ==============================================================================
// 15. PENYIMPANAN KONFIGURASI KE NVS FLASH (PREFERENCES)
// ==============================================================================
void loadPreferences() {
  prefs.begin("pest_trap", true); // Read-only mode
  trapId               = prefs.getString("trap_id", "TRAP-01");
  trapName             = prefs.getString("trap_name", "Perangkap Hama 01 - Kebun Kopi");
  wsHost               = prefs.getString("ws_host", "be-ews.qbyte.web.id");
  wsPort               = prefs.getInt("ws_port", 443);
  wsPath               = prefs.getString("ws_path", "/ws");
  wsUseSsl             = prefs.getBool("ws_ssl", true);
  wifiSsid             = prefs.getString("wf_ssid", "TALAS 1");
  wifiPass             = prefs.getString("wf_pass", "kitahebat");

  currentMode          = (TrapMode)prefs.getUChar("mode", (uint8_t)MODE_OTOMATIS);
  activePreset         = prefs.getUChar("preset", 0);
  startHour            = prefs.getUChar("s_hr", 18);
  startMin             = prefs.getUChar("s_min", 0);
  endHour              = prefs.getUChar("e_hr", 6);
  endMin               = prefs.getUChar("e_min", 0);
  ledRotationInterval  = prefs.getUShort("rot_int", 15);
  manualIntervalMin    = prefs.getUShort("m_int", 15);
  manualDurationSec    = prefs.getUShort("m_dur", 3);
  sensorCooldownSec    = prefs.getUShort("s_cd", 5);
  distThreshold_mm     = prefs.getUShort("dist_th", 150);
  distMin_mm           = prefs.getUShort("dist_min", 10);
  pestCounter          = prefs.getUInt("p_count", 0);
  uvLedEnabled         = prefs.getBool("uv_en", true);
  ledRunning           = prefs.getBool("led_run", false);
  blowerMode           = prefs.getString("bl_mode", "sensor");
  modemPulseMs         = prefs.getULong("mdm_pulse", 3000);
  modemBootDelayMs     = prefs.getULong("mdm_boot", 30000);
  modemRetryIntervalMs = prefs.getULong("mdm_retry", 30000);
  modemWaitWifiMs      = prefs.getULong("mdm_wait", 120000);
  // Blower SELALU mati saat boot (hanya aktif dari trigger sensor VL53 atau waktu)
  blowerEnabled = false;
  zapperActive = false;

  // Load custom presets jika ada
  for (int i = 0; i < 5; i++) {
    String kN = "pr_n_" + String(i);
    String savedName = prefs.getString(kN.c_str(), "");
    if (savedName.length() > 0) {
      strncpy(presets[i].name, savedName.c_str(), sizeof(presets[i].name) - 1);
      presets[i].name[sizeof(presets[i].name) - 1] = '\0';
    }
    String kR = "pr_r_" + String(i);
    String kG = "pr_g_" + String(i);
    String kB = "pr_b_" + String(i);
    presets[i].r = prefs.getUChar(kR.c_str(), presets[i].r);
    presets[i].g = prefs.getUChar(kG.c_str(), presets[i].g);
    presets[i].b = prefs.getUChar(kB.c_str(), presets[i].b);
  }
  prefs.end();
}

void savePreferences() {
  prefs.begin("pest_trap", false); // Read-write mode
  prefs.putString("trap_id", trapId);
  prefs.putString("trap_name", trapName);
  prefs.putString("ws_host", wsHost);
  prefs.putInt("ws_port", wsPort);
  prefs.putString("ws_path", wsPath);
  prefs.putBool("ws_ssl", wsUseSsl);
  prefs.putString("wf_ssid", wifiSsid);
  prefs.putString("wf_pass", wifiPass);

  prefs.putUChar("mode", (uint8_t)currentMode);
  prefs.putUChar("preset", activePreset);
  prefs.putUChar("s_hr", startHour);
  prefs.putUChar("s_min", startMin);
  prefs.putUChar("e_hr", endHour);
  prefs.putUChar("e_min", endMin);
  prefs.putUShort("rot_int", ledRotationInterval);
  prefs.putUShort("m_int", manualIntervalMin);
  prefs.putUShort("m_dur", manualDurationSec);
  prefs.putUShort("s_cd", sensorCooldownSec);
  prefs.putUShort("dist_th", distThreshold_mm);
  prefs.putUShort("dist_min", distMin_mm);
  prefs.putUInt("p_count", pestCounter);
  prefs.putBool("uv_en", uvLedEnabled);
  prefs.putBool("led_run", ledRunning);
  prefs.putString("bl_mode", blowerMode);
  prefs.putULong("mdm_pulse", modemPulseMs);
  prefs.putULong("mdm_boot", modemBootDelayMs);
  prefs.putULong("mdm_retry", modemRetryIntervalMs);
  prefs.putULong("mdm_wait", modemWaitWifiMs);
  // blowerEnabled tidak perlu disimpan karena selalu MATI saat boot

  for (int i = 0; i < 5; i++) {
    String kN = "pr_n_" + String(i);
    prefs.putString(kN.c_str(), presets[i].name);
    String kR = "pr_r_" + String(i);
    String kG = "pr_g_" + String(i);
    String kB = "pr_b_" + String(i);
    prefs.putUChar(kR.c_str(), presets[i].r);
    prefs.putUChar(kG.c_str(), presets[i].g);
    prefs.putUChar(kB.c_str(), presets[i].b);
  }
  prefs.end();
}

// ==============================================================================
// SINKRONISASI WAKTU NTP -> RTC DS3231 (atau internal clock jika tidak ada RTC)
// ==============================================================================
void syncTimeFromNTP() {
  Serial.println("[NTP] Memulai sinkronisasi waktu dari internet...");

  // Konfigurasi NTP: GMT+7 (WIB = 25200 detik), tanpa DST
  configTime(25200, 0, "pool.ntp.org", "time.nist.gov", "id.pool.ntp.org");

  // Tunggu respons NTP (maksimal 10 detik, non-blocking friendly karena dipanggil di momen transisi)
  struct tm timeinfo;
  int retries = 0;
  while (!getLocalTime(&timeinfo, 1000) && retries < 10) {
    retries++;
    Serial.print(".");
  }
  Serial.println();

  if (retries >= 10) {
    Serial.println("[ERROR] [NTP] Gagal mendapatkan waktu dari NTP server");
    return;
  }

  ntpSynced = true;

  // Format waktu untuk log
  char timeBuf[32];
  strftime(timeBuf, sizeof(timeBuf), "%Y-%m-%d %H:%M:%S", &timeinfo);
  Serial.print("[OK] [NTP] Waktu NTP diterima: ");
  Serial.println(timeBuf);

  // Update variabel waktu global
  rtcHour   = timeinfo.tm_hour;
  rtcMinute = timeinfo.tm_min;
  rtcSecond = timeinfo.tm_sec;
  rtcYear   = timeinfo.tm_year + 1900;
  rtcMonth  = timeinfo.tm_mon + 1;
  rtcDay    = timeinfo.tm_mday;

  // Jika RTC DS3231 tersedia, tulis waktu NTP ke RTC agar tersimpan saat ESP32 mati
  if (rtcReady) {
    rtc.adjust(DateTime(
      timeinfo.tm_year + 1900,
      timeinfo.tm_mon + 1,
      timeinfo.tm_mday,
      timeinfo.tm_hour,
      timeinfo.tm_min,
      timeinfo.tm_sec
    ));
    Serial.println("[OK] [NTP->RTC] Waktu RTC DS3231 berhasil disinkronkan dari NTP");
  } else {
    Serial.println("[INFO] [NTP] RTC tidak ada, menggunakan jam internal ESP32 (NTP-synced)");
  }
}