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

#define PIN_RELAY_1         13   // in1 - Relay 1 (Blower Penghisap Hama)
#define PIN_WS2812B         12   // in2 / D12 - Data LED WS2812B Lampu Atraktor
#define NUM_WS2812B         30   // Jumlah mata LED NeoPixel (sesuaikan strip Anda)

#define PIN_BT1             25   // Tombol 1: Ganti Preset Warna
#define PIN_BT2             26   // Tombol 2: Ganti Mode / Bangun dari Sleep
#define PIN_BT3             27   // Tombol 3: Reset Counter Hama / Test Zap

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

// Pengaturan Blower: Durasi nyala & cooldown / interval berkala
uint16_t manualIntervalMin   = 15; // Cooldown minimal antar trigger sensor atau interval siklus blower (menit)
uint16_t manualDurationSec   = 3;  // Durasi blower menyala saat deteksi hama / siklus waktu (detik)

// Parameter Deteksi Hama
uint16_t distThreshold_mm = 150;   // Ambang batas deteksi hama (mm)
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
String wifiSsid       = "TALAS 1";
String wifiPass       = "kitahebat";
String wsHost         = "be-ews.qbyte.web.id";
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
    Serial.println("⚡ Bangun dari Deep Sleep karena tombol fisik ditekan!");
  }

  // Inisialisasi Pin GPIO
  pinMode(PIN_RELAY_1, OUTPUT);
  digitalWrite(PIN_RELAY_1, LOW); // Blower default MATI saat pertama kali nyala

  pinMode(PIN_BT1, INPUT_PULLUP);
  pinMode(PIN_BT2, INPUT_PULLUP);
  pinMode(PIN_BT3, INPUT_PULLUP);

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

  // Konfigurasi Mode WiFi: Hubungkan ke WiFi STA terlebih dahulu (maks 10 detik)
  WiFi.mode(WIFI_STA);
  bool wifiConnected = false;

  if (wifiSsid.length() > 0) {
    Serial.print("🌐 Menghubungkan ke WiFi: ");
    Serial.println(wifiSsid);
    WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());

    unsigned long startAttemptTime = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startAttemptTime < 10000)) {
      delay(500);
      Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      wifiConnected = true;
      Serial.print("✅ Terhubung ke WiFi! IP: ");
      Serial.println(WiFi.localIP());
    } else {
      Serial.println("❌ Gagal terhubung ke WiFi dalam 10 detik.");
    }
  }

  // Jika gagal terhubung ke WiFi selama 10 detik, aktifkan SoftAP
  if (!wifiConnected) {
    WiFi.mode(WIFI_AP_STA);
    String apName = "Trap-" + trapId;
    WiFi.softAP(apName.c_str(), "12345678");
    Serial.print("📶 Mengaktifkan SoftAP Cadangan: ");
    Serial.print(apName);
    Serial.print(" | IP AP: ");
    Serial.println(WiFi.softAPIP());

    // Aktifkan Captive Portal DNS
    dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
    dnsServer.start(53, "*", WiFi.softAPIP());
    dnsRunning = true;
    Serial.println("🌐 Captive Portal DNS Aktif di Port 53");
  }

  // Setup Web Server Lokal HTTP
  setupWebServer();
  server.begin();
  Serial.println("🌐 Web Server HTTP lokal siap di port 80");

  // Setup WebSocket Client ke Server Backend EWS
  setupWebSocket();

  // Pastikan blower MATI saat pertama kali boot, lalu terapkan warna LED
  blowerEnabled = false;
  zapperActive = false;
  digitalWrite(PIN_RELAY_1, LOW);
  updateActuators();
  sendTelemetryToEws(); // Publish status awal (blower OFF) ke server
}

void loop() {
  unsigned long now = millis();

  // 1. Tangani Request DNS untuk Captive Portal
  if (dnsRunning) {
    dnsServer.processNextRequest();
  }

  // 2. Tangani Request Web Server Lokal
  server.handleClient();

  // 2. Tangani Komunikasi WebSocket Real-time IoT
  webSocket.loop();

  // 3. Baca Input Tombol Fisik (Ganti Preset, Ganti Mode, Reset)
  handlePhysicalButtons();

  // 4. Pembacaan Rutin Sensor I2C (INA226, DS3231, VL53L0X) setiap 100ms
  if (now - lastSensorRead >= 100) {
    lastSensorRead = now;
    readSensors();
    updateActuators();
  }

  // 5. Perbarui Layar OLED SSD1306 setiap 250ms
  if (now - lastOledUpdate >= 250) {
    lastOledUpdate = now;
    updateOledDisplay();
  }

  // 6. Adaptive Telemetry: Kirim Telemetri IoT ke Server EWS
  // Mode Cepat (3 detik) jika Web meminta data cepat / client aktif (30 detik terakhir),
  // Mode Hemat Daya (5 menit) jika idle untuk menghemat daya baterai & kuota data.
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

  // 7. Auto Turn-off Blower setelah durasi habis
  if (blowerEnabled && (now >= blowerOffTime)) {
    digitalWrite(PIN_RELAY_1, LOW);
    blowerEnabled = false;
    zapperActive = false;
    Serial.println("🌀 [Blower] Durasi habis, blower MATI");
  }

  // 8. Eksekusi Restart ESP32 Tertunda (dipicu dari Web Dashboard)
  if (shouldRestart && (now - restartTriggerTime >= 1000)) {
    Serial.println("🔄 Merestart ESP32...");
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
    Serial.println("✅ OLED SSD1306 (0x3C) Siap");
  } else {
    Serial.println("⚠️ OLED SSD1306 tidak terdeteksi");
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
    Serial.println("✅ RTC DS3231 (0x68) Siap");
  } else {
    Serial.println("⚠️ RTC DS3231 tidak terdeteksi, menggunakan timer internal");
  }

  // 3. INA226 (0x40)
  if (ina226.init()) {
    inaReady = true;
    ina226.waitUntilConversionCompleted();
    ina226.setResistorRange(0.1, 1.3); // Shunt 0.1 Ohm
    Serial.println("✅ INA226 (0x40) Siap");
  } else {
    Serial.println("⚠️ INA226 tidak terdeteksi");
  }

  // 4. VL53L0X (0x29)
  if (sensorVL53.begin(VL53_I2C_ADDR)) {
    vl53Ready = true;
    Serial.println("✅ VL53L0X (0x29) Siap");
  } else {
    Serial.println("⚠️ VL53L0X tidak terdeteksi");
  }
}

// ==============================================================================
// 8. PEMBACAAN SENSOR & LOGIKA DETEKSI HAMA
// ==============================================================================
void readSensors() {
  // A. Baca Waktu RTC DS3231
  if (rtcReady) {
    DateTime now = rtc.now();
    rtcHour = now.hour();
    rtcMinute = now.minute();
    rtcSecond = now.second();
    rtcYear = now.year();
    rtcMonth = now.month();
    rtcDay = now.day();
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

        // Cooldown: cek apakah sudah lewat interval minimum antar trigger
        unsigned long nowMs = millis();
        unsigned long cooldownMs = (unsigned long)manualIntervalMin * 60000UL;
        bool cooldownPassed = (nowMs - lastBlowerTrigger >= cooldownMs) || (lastBlowerTrigger == 0);

        if (canTrigger && !blowerEnabled && cooldownPassed &&
            currentDistance > 10 && currentDistance <= distThreshold_mm) {
          // TRIGGER BLOWER! Hama terdeteksi mendekat!
          digitalWrite(PIN_RELAY_1, HIGH);
          blowerEnabled = true;
          zapperActive = true;
          blowerOffTime = nowMs + ((unsigned long)manualDurationSec * 1000UL);
          lastBlowerTrigger = nowMs;
          pestCounter++;
          Serial.print("⚡🌀 Hama Terdeteksi Sensor! Jarak: ");
          Serial.print(currentDistance);
          Serial.print(" mm | Blower ON selama ");
          Serial.print(manualDurationSec);
          Serial.print(" detik | Total Hama: ");
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
          Serial.print("🎨 [Auto-Rotate LED] Beralih ke Preset ");
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
        blowerEnabled = true;
        zapperActive = true;
        blowerOffTime = now + ((unsigned long)manualDurationSec * 1000UL);
        lastBlowerTimeCycle = now;
        Serial.print("🌀 [Blower Siklus Waktu] Blower ON selama ");
        Serial.print(manualDurationSec);
        Serial.println(" detik (Interval Berkala)");
      }
    }
  }
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
      Serial.print("🔘 [Tombol 1] Ganti Preset ke: ");
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
        Serial.println("💤 [Tombol 2 Tahan 2 Detik] Masuk ke SLEEP MODE!");
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

        Serial.print("🔘 [Tombol 2] Ganti Mode ke: ");
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
      Serial.println("🔄 [Tombol 3] Counter Hama Direset ke 0");
      savePreferences();
      sendTelemetryToEws();
    }
  }
}

// ==============================================================================
// 11. DEEP SLEEP (BENAR-BENAR MEMATIKAN SISTEM)
// ==============================================================================
void enterDeepSleep() {
  Serial.println("\n💤 Mempersiapkan Sistem untuk Memasuki DEEP SLEEP...");

  // 1. Matikan Beban Lampu LED WS2812B
  turnOffLed();

  // 2. Matikan Relay Zapper
  digitalWrite(PIN_RELAY_1, LOW);

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

  Serial.println("💤 Sistem Mati. Masuk Deep Sleep sekarang. Tekan Tombol 2 untuk bangun.");
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
  <title>Smart Pest Trap</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 12px; line-height: 1.4; }
    .wrap { max-width: 520px; margin: auto; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    h2 { margin: 0; font-size: 1.25rem; color: #38bdf8; }
    .badge { font-size: 11px; padding: 3px 8px; border-radius: 6px; font-weight: bold; background: #334155; }
    .badge-ok { background: #065f46; color: #34d399; }
    .badge-bad { background: #991b1b; color: #f87171; }
    .tabs { display: flex; gap: 6px; margin-bottom: 12px; }
    .tab { flex: 1; padding: 8px 4px; border: none; border-radius: 8px; background: #1e293b; color: #94a3b8; font-weight: 600; font-size: 13px; cursor: pointer; text-align: center; border: 1px solid #334155; }
    .tab.active { background: #0284c7; color: #fff; border-color: #38bdf8; }
    .card { background: #1e293b; border-radius: 10px; padding: 14px; border: 1px solid #334155; margin-bottom: 12px; }
    .panel { display: none; }
    .panel.active { display: block; }
    .row { margin-bottom: 10px; }
    label { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 4px; font-weight: 500; }
    input, select { width: 100%; box-sizing: border-box; padding: 8px 10px; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: #fff; font-size: 14px; }
    input:focus, select:focus { outline: none; border-color: #38bdf8; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .btn { display: block; width: 100%; padding: 10px; border: none; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer; text-align: center; margin-top: 6px; box-sizing: border-box; }
    .btn-blue { background: #0284c7; color: #fff; }
    .btn-green { background: #059669; color: #fff; }
    .btn-amber { background: #d97706; color: #fff; }
    .btn-red { background: #dc2626; color: #fff; }
    .btn-gray { background: #475569; color: #fff; }
    .btn-sm { padding: 6px 10px; font-size: 12px; margin-top: 0; }
    .stat-val { font-size: 17px; font-weight: bold; color: #f1f5f9; }
    .stat-label { font-size: 11px; color: #94a3b8; }
    .msg { font-size: 12px; text-align: center; margin-top: 8px; min-height: 18px; }
    .preset-item { display: flex; align-items: center; gap: 8px; background: #0f172a; padding: 6px 10px; border-radius: 6px; margin-bottom: 5px; font-size: 13px; }
    .dot { width: 16px; height: 16px; border-radius: 50%; border: 1px solid #fff; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h2>🌾 Smart Pest Trap</h2>
    <span id="txt_trap" class="badge">TRAP</span>
  </div>

  <!-- NAVIGASI TAB RINGAN -->
  <div class="tabs">
    <button class="tab active" onclick="goTab('wifi', this)">📶 WiFi</button>
    <button class="tab" onclick="goTab('server', this)">⚙️ Server</button>
    <button class="tab" onclick="goTab('ctrl', this)">📊 Kontrol</button>
  </div>

  <!-- TAB 1: WIFI MANAGER -->
  <div id="p_wifi" class="panel active">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-weight:bold;font-size:14px;color:#38bdf8">📶 Pengaturan WiFi</span>
        <span id="wifi_badge" class="badge">...</span>
      </div>
      <div class="row" style="font-size:12px;color:#cbd5e1;background:#0f172a;padding:8px;border-radius:6px">
        IP: <b id="txt_ip">-</b> | SSID: <b id="txt_cur_ssid">-</b>
      </div>

      <div class="row" style="margin-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <label style="margin:0">Daftar WiFi Terdekat:</label>
          <button class="btn btn-blue btn-sm" id="btn_scan" onclick="scanWifi()">🔍 Scan Ulang</button>
        </div>
        <select id="sel_wifi" onchange="pickWifi(this.value)">
          <option value="">-- Tekan Scan WiFi --</option>
        </select>
      </div>

      <div class="row">
        <label>SSID WiFi:</label>
        <input type="text" id="w_ssid" placeholder="Nama WiFi / Hotspot">
      </div>
      <div class="row">
        <label>Password WiFi:</label>
        <input type="password" id="w_pass" placeholder="Password WiFi">
      </div>
      <button class="btn btn-green" onclick="saveWifi()">💾 Simpan &amp; Hubungkan WiFi</button>
      <div id="msg_wifi" class="msg"></div>
    </div>
  </div>

  <!-- TAB 2: SERVER & IDENTITAS -->
  <div id="p_server" class="panel">
    <div class="card">
      <span style="font-weight:bold;font-size:14px;color:#38bdf8;display:block;margin-bottom:10px">⚙️ WebSocket &amp; Identitas</span>
      
      <div class="grid">
        <div class="row">
          <label>Trap ID (ID Unik):</label>
          <input type="text" id="s_id" placeholder="TRAP-01">
        </div>
        <div class="row">
          <label>Nama Perangkap:</label>
          <input type="text" id="s_name" placeholder="Kebun Kopi">
        </div>
      </div>

      <div class="grid">
        <div class="row">
          <label>Host WebSocket:</label>
          <input type="text" id="s_host" placeholder="be-ews.qbyte.web.id">
        </div>
        <div class="row">
          <label>Port:</label>
          <input type="number" id="s_port" placeholder="443">
        </div>
      </div>

      <div class="grid">
        <div class="row">
          <label>Path:</label>
          <input type="text" id="s_path" placeholder="/ws">
        </div>
        <div class="row">
          <label>SSL (WSS):</label>
          <select id="s_ssl">
            <option value="1">WSS (SSL Port 443)</option>
            <option value="0">WS Biasa (Port 80)</option>
          </select>
        </div>
      </div>

      <button class="btn btn-blue" onclick="saveServer()">💾 Simpan Konfigurasi Server</button>
      <button class="btn btn-red" onclick="rebootEsp()">🔄 Restart ESP32</button>
      <div id="msg_server" class="msg"></div>
    </div>
  </div>

  <!-- TAB 3: KONTROL & MONITORING -->
  <div id="p_ctrl" class="panel">
    <div class="card">
      <div class="grid" style="text-align:center">
        <div><div class="stat-label">Tegangan Aki</div><div class="stat-val" id="d_bat">-</div></div>
        <div><div class="stat-label">Arus Beban</div><div class="stat-val" id="d_curr">-</div></div>
        <div><div class="stat-label">Jarak Objek</div><div class="stat-val" id="d_dist">-</div></div>
        <div><div class="stat-label">Total Hama</div><div class="stat-val" id="d_pest">-</div></div>
        <div><div class="stat-label">Jam RTC</div><div class="stat-val" id="d_rtc" style="font-size:15px">-</div></div>
        <div><div class="stat-label">IoT Cloud</div><div class="stat-val" id="d_ws" style="font-size:14px">-</div></div>
      </div>
    </div>

    <div class="card">
      <label>Mode Operasional:</label>
      <div class="grid">
        <button class="btn btn-green btn-sm" onclick="setMode('manual')">MANUAL</button>
        <button class="btn btn-blue btn-sm" onclick="setMode('otomatis')">OTOMATIS</button>
        <button class="btn btn-amber btn-sm" onclick="setMode('otomatis-led')">ROTASI LED</button>
        <button class="btn btn-red btn-sm" onclick="setMode('sleep')">SLEEP</button>
      </div>
      <div class="grid" style="margin-top:6px">
        <button class="btn btn-amber btn-sm" onclick="toggleUv()">💡 Saklar LED UV</button>
        <button class="btn btn-gray btn-sm" onclick="toggleBlower()">🌀 Test Blower</button>
      </div>
    </div>

    <div class="card">
      <label>Preset Warna Atraktor:</label>
      <div id="preset_boxes"></div>
      <div class="grid" style="margin-top:8px">
        <div><label>Mulai:</label><input type="time" id="c_start"></div>
        <div><label>Selesai:</label><input type="time" id="c_end"></div>
      </div>
      <button class="btn btn-blue btn-sm" style="margin-top:8px" onclick="saveSched()">💾 Simpan Jadwal</button>
    </div>
  </div>
</div>

<script>
  let loaded = false;
  function goTab(name, btn) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('p_' + name).classList.add('active');
    btn.classList.add('active');
  }

  function refresh() {
    fetch('/api/status').then(r => r.json()).then(d => {
      document.getElementById('d_bat').innerText = d.batteryVoltage + ' V';
      document.getElementById('d_curr').innerText = d.loadCurrent + ' mA';
      document.getElementById('d_dist').innerText = d.currentDistance + ' mm';
      document.getElementById('d_pest').innerText = d.photoelectricCount;
      document.getElementById('d_rtc').innerText = d.currentTime;
      
      let ws = document.getElementById('d_ws');
      ws.innerText = d.wsConnected ? 'CONNECT' : 'DISCONNECT';
      ws.style.color = d.wsConnected ? '#34d399' : '#f87171';

      let wb = document.getElementById('wifi_badge');
      wb.innerText = d.wifiStatus;
      wb.className = 'badge ' + (d.wifiStatus === 'TERKONEKSI' ? 'badge-ok' : 'badge-bad');

      document.getElementById('txt_ip').innerText = d.wifiIp;
      document.getElementById('txt_cur_ssid').innerText = d.wifiSsid || '-';
      document.getElementById('txt_trap').innerText = d.trapId;

      if (!loaded) {
        document.getElementById('w_ssid').value = d.wifiSsid || '';
        document.getElementById('s_id').value = d.trapId || '';
        document.getElementById('s_name').value = d.trapName || '';
        document.getElementById('s_host').value = d.wsHost || '';
        document.getElementById('s_port').value = d.wsPort || 443;
        document.getElementById('s_path').value = d.wsPath || '/ws';
        document.getElementById('s_ssl').value = d.wsUseSsl ? '1' : '0';
        document.getElementById('c_start').value = d.startTime || '18:00';
        document.getElementById('c_end').value = d.endTime || '06:00';
        loaded = true;
      }

      let phtml = '';
      d.presets.forEach((p, i) => {
        phtml += `<div class="preset-item">
          <div class="dot" style="background:rgb(${p.r},${p.g},${p.b})"></div>
          <span style="flex:1">${i+1}. ${p.name}</span>
          <button class="btn ${d.activePreset===i?'btn-green':'btn-gray'} btn-sm" onclick="setPreset(${i})">${d.activePreset===i?'AKTIF':'PILIH'}</button>
        </div>`;
      });
      document.getElementById('preset_boxes').innerHTML = phtml;
    }).catch(e => {});
  }

  function scanWifi() {
    let b = document.getElementById('btn_scan');
    let sel = document.getElementById('sel_wifi');
    b.innerText = 'Memindai...';
    b.disabled = true;
    sel.innerHTML = '<option value="">Sedang memindai jaringan...</option>';

    fetch('/api/wifi-scan').then(r => r.json()).then(list => {
      b.innerText = '🔍 Scan Ulang';
      b.disabled = false;
      if (!list || list.length === 0) {
        sel.innerHTML = '<option value="">Tidak ada WiFi terdeteksi</option>';
        return;
      }
      let opt = '<option value="">-- Pilih WiFi (' + list.length + ' ditemukan) --</option>';
      list.forEach(w => {
        let lock = w.sec ? '🔒' : '🔓';
        opt += `<option value="${w.ssid}">${w.ssid} (${w.rssi} dBm ${lock})</option>`;
      });
      sel.innerHTML = opt;
    }).catch(e => {
      b.innerText = '🔍 Scan Ulang';
      b.disabled = false;
      sel.innerHTML = '<option value="">Gagal memindai</option>';
    });
  }

  function pickWifi(val) {
    if (val) document.getElementById('w_ssid').value = val;
  }

  function saveWifi() {
    let ssid = document.getElementById('w_ssid').value.trim();
    let pass = document.getElementById('w_pass').value;
    let m = document.getElementById('msg_wifi');
    if (!ssid) { alert('SSID WiFi tidak boleh kosong'); return; }

    m.style.color = '#38bdf8';
    m.innerText = 'Menyimpan & menghubungkan ke WiFi...';
    fetch('/api/wifi-save', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: `ssid=${encodeURIComponent(ssid)}&pass=${encodeURIComponent(pass)}`
    }).then(r => r.json()).then(d => {
      m.style.color = '#34d399';
      m.innerText = d.message || 'Tersimpan! ESP32 akan menyambung...';
      setTimeout(() => location.reload(), 8000);
    }).catch(e => {
      m.style.color = '#ef4444';
      m.innerText = 'Error: ' + e;
    });
  }

  function saveServer() {
    let id   = document.getElementById('s_id').value.trim();
    let name = document.getElementById('s_name').value.trim();
    let host = document.getElementById('s_host').value.trim();
    let port = document.getElementById('s_port').value.trim();
    let path = document.getElementById('s_path').value.trim();
    let ssl  = document.getElementById('s_ssl').value;
    let m    = document.getElementById('msg_server');

    if (!id || !host || !port) { alert('Trap ID, Host, dan Port wajib diisi'); return; }
    m.style.color = '#38bdf8';
    m.innerText = 'Menyimpan konfigurasi...';

    let body = `trapId=${encodeURIComponent(id)}&trapName=${encodeURIComponent(name)}&wsHost=${encodeURIComponent(host)}&wsPort=${port}&wsPath=${encodeURIComponent(path)}&wsUseSsl=${ssl}`;
    fetch('/api/settings', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: body
    }).then(r => r.json()).then(d => {
      m.style.color = '#34d399';
      m.innerText = d.message || 'Konfigurasi server tersimpan!';
      setTimeout(() => { m.innerText = ''; }, 4000);
    }).catch(e => {
      m.style.color = '#ef4444';
      m.innerText = 'Error: ' + e;
    });
  }

  function rebootEsp() {
    if (confirm('Restart ESP32 sekarang?')) {
      fetch('/api/restart', {method:'POST'}).then(r => r.json()).then(d => {
        alert(d.message || 'ESP32 sedang merestart...');
        setTimeout(() => location.reload(), 8000);
      });
    }
  }

  function setMode(m) { fetch('/api/mode?val=' + m, {method:'POST'}).then(() => refresh()); }
  function toggleUv() { fetch('/api/toggle-uv', {method:'POST'}).then(() => refresh()); }
  function toggleBlower() { fetch('/api/toggle-blower', {method:'POST'}).then(() => refresh()); }
  function setPreset(i) { fetch('/api/preset?val=' + i, {method:'POST'}).then(() => refresh()); }
  function saveSched() {
    let s = document.getElementById('c_start').value, e = document.getElementById('c_end').value;
    fetch(`/api/schedule?start=${s}&end=${e}`, {method:'POST'}).then(() => alert('Jadwal tersimpan'));
  }

  setInterval(refresh, 2500);
  refresh();
</script>
</body>
</html>
)rawliteral";

void setupWebServer() {
  // Halaman Utama Web Dashboard Lokal
  server.on("/", HTTP_GET, []() {
    server.send_P(200, "text/html", INDEX_HTML);
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

  // API Scan WiFi Sekitar (Fitur WiFiManager)
  server.on("/api/wifi-scan", HTTP_GET, []() {
    Serial.println("🔍 [WiFi Scan] Memindai jaringan WiFi di sekitar...");
    int n = WiFi.scanNetworks(false, true);
    StaticJsonDocument<1536> doc;
    JsonArray arr = doc.to<JsonArray>();
    if (n > 0) {
      for (int i = 0; i < n && i < 20; ++i) {
        String s = WiFi.SSID(i);
        if (s.length() == 0) continue;
        JsonObject item = arr.createNestedObject();
        item["ssid"] = s;
        item["rssi"] = WiFi.RSSI(i);
        item["sec"]  = (WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
      }
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
    Serial.printf("📶 [WiFi Save] SSID: %s tersimpan. ESP32 merestart...\n", wifiSsid.c_str());
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
    doc["ledColor"] = presets[activePreset].name;
    doc["blowerMode"] = blowerMode;
    doc["ledRunning"] = ledRunning;

    JsonArray pArr = doc.createNestedArray("presets");
    for (int i = 0; i < 5; i++) {
      JsonObject pObj = pArr.createNestedObject();
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
    StaticJsonDocument<768> doc;
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
    doc["blowerMode"] = blowerMode;
    doc["ledRunning"] = ledRunning;

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

    if (updated) {
      savePreferences();
      setupWebSocket();
      Serial.println("⚙️ [Web Config] Konfigurasi trapId & WebSocket tersimpan!");
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

  // API Ganti Mode
  server.on("/api/mode", HTTP_POST, []() {
    if (server.hasArg("val")) {
      String m = server.arg("val");
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
    if (server.hasArg("val")) {
      int idx = server.arg("val").toInt();
      if (idx >= 0 && idx < 5) {
        activePreset = idx;
        updateActuators();
        savePreferences();
        sendTelemetryToEws();
        server.send(200, "application/json", "{\"status\":\"ok\"}");
        return;
      }
    }
    server.send(400, "application/json", "{\"status\":\"error\"}");
  });

  // API Edit Preset Nilai RGB
  server.on("/api/preset/edit", HTTP_POST, []() {
    if (server.hasArg("idx") && server.hasArg("r") && server.hasArg("g") && server.hasArg("b")) {
      int idx = server.arg("idx").toInt();
      if (idx >= 0 && idx < 5) {
        presets[idx].r = server.arg("r").toInt();
        presets[idx].g = server.arg("g").toInt();
        presets[idx].b = server.arg("b").toInt();
        updateActuators();
        savePreferences();
        sendTelemetryToEws();
        server.send(200, "application/json", "{\"status\":\"ok\"}");
        return;
      }
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
    zapperActive = blowerEnabled;
    savePreferences();
    sendTelemetryToEws();
    server.send(200, "application/json", "{\"status\":\"ok\",\"blowerStatus\":" + String(blowerEnabled ? "true" : "false") + "}");
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
    Serial.println("⚠️ [WS] Host WebSocket belum disetting, lewati koneksi.");
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
        Serial.println("❌ [WS] Terputus dari Server EWS");
        break;
      case WStype_CONNECTED: {
        Serial.println("✅ [WS] Terhubung ke Server EWS!");
        // Berlangganan (Subscribe) ke topik perintah kontrol trap: traps/{trapId}/command
        String cmdTopic = "traps/" + trapId + "/command";
        StaticJsonDocument<256> subDoc;
        subDoc["action"] = "subscribe";
        subDoc["topic"] = cmdTopic;
        String subMsg;
        serializeJson(subDoc, subMsg);
        webSocket.sendTXT(subMsg);
        Serial.print("📡 [WS Subscribe] ");
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
    Serial.print("⚠️ [WS JSON Error] ");
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
    Serial.print("💡 [WS] Saklar UV LED: ");
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
      blowerEnabled = true;
      zapperActive = true;
      blowerOffTime = millis() + ((unsigned long)manualDurationSec * 1000UL);
      Serial.print("🌀 [WS] Blower ON selama ");
      Serial.print(manualDurationSec);
      Serial.println(" detik (perintah dari Web)");
    } else if (!blowerCmd) {
      // Matikan blower langsung
      digitalWrite(PIN_RELAY_1, LOW);
      blowerEnabled = false;
      zapperActive = false;
      Serial.println("🌀 [WS] Blower MATI (perintah dari Web)");
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

  // 8. Update Preset Warna dari Web Dashboard
  if (data.containsKey("presets")) {
    JsonArray pArr = data["presets"].as<JsonArray>();
    int i = 0;
    for (JsonObject pItem : pArr) {
      if (i >= 5) break;
      if (pItem.containsKey("r")) presets[i].r = pItem["r"].as<int>();
      if (pItem.containsKey("g")) presets[i].g = pItem["g"].as<int>();
      if (pItem.containsKey("b")) presets[i].b = pItem["b"].as<int>();
      i++;
    }
  }

  // 9. Manual Zap / Reset Trigger / Request Telemetri Cepat
  if (data.containsKey("command")) {
    String cmd = data["command"].as<String>();
    if (cmd == "FAST_TELEMETRY" || cmd == "REQUEST_DATA" || cmd == "REQUEST_TELEMETRY") {
      lastClientActivityTime = millis();
      forceTelemetryPublish = true;
      Serial.println("📡 [WS] Perintah telemetri cepat on-demand diterima dari Web!");
    } else if (cmd == "CLIENT_HEARTBEAT") {
      lastClientActivityTime = millis();
      Serial.println("💓 [HEARTBEAT] Sinyal client web aktif memantau perangkap.");
    } else if (cmd == "TRIGGER_ZAP") {
      digitalWrite(PIN_RELAY_1, HIGH);
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

  StaticJsonDocument<1024> root;
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
  pestCounter          = prefs.getUInt("p_count", 0);
  uvLedEnabled         = prefs.getBool("uv_en", true);
  ledRunning           = prefs.getBool("led_run", false);
  blowerMode           = prefs.getString("bl_mode", "sensor");
  // Blower SELALU mati saat boot (hanya aktif dari trigger sensor VL53 atau waktu)
  blowerEnabled = false;
  zapperActive = false;

  // Load custom presets jika ada
  for (int i = 0; i < 5; i++) {
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
  prefs.putUInt("p_count", pestCounter);
  prefs.putBool("uv_en", uvLedEnabled);
  prefs.putBool("led_run", ledRunning);
  prefs.putString("bl_mode", blowerMode);
  // blowerEnabled tidak perlu disimpan karena selalu MATI saat boot

  for (int i = 0; i < 5; i++) {
    String kR = "pr_r_" + String(i);
    String kG = "pr_g_" + String(i);
    String kB = "pr_b_" + String(i);
    prefs.putUChar(kR.c_str(), presets[i].r);
    prefs.putUChar(kG.c_str(), presets[i].g);
    prefs.putUChar(kB.c_str(), presets[i].b);
  }
  prefs.end();
}