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
String trapId = "TRAP-01";
String trapName = "Perangkap Hama 01 - Kebun Kopi";
TrapMode currentMode = MODE_OTOMATIS;
uint8_t activePreset = 0;

// Jadwal Operasi (Format 24 Jam)
uint8_t startHour = 18;
uint8_t startMin  = 0;
uint8_t endHour   = 6;
uint8_t endMin    = 0;

// Interval Ganti Warna (Menit) untuk Mode OTOMATIS_LED
uint16_t ledRotationInterval = 15;

// Pengaturan Blower: Durasi nyala & cooldown antar trigger
uint16_t manualIntervalMin   = 15; // Cooldown minimal antar trigger blower (menit)
uint16_t manualDurationSec   = 3;  // Durasi blower menyala saat deteksi hama (detik)

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

// Kredensial WiFi & IoT Server EWS
char wifiSsid[32]     = "TALAS 1";
char wifiPass[32]     = "kitahebat";
char wsHost[64]       = "be-ews.qbyte.web.id";
int  wsPort           = 443;
char wsPath[32]       = "/ws";
bool wsUseSsl         = true;

// Timing Non-blocking
const unsigned long TELEMETRY_INTERVAL_MS = 300000UL; // Kirim data IoT ke EWS setiap 5 menit (300.000 ms)
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

  if (strlen(wifiSsid) > 0) {
    Serial.print("🌐 Menghubungkan ke WiFi: ");
    Serial.println(wifiSsid);
    WiFi.begin(wifiSsid, wifiPass);

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

  // 1. Tangani Request Web Server Lokal
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

  // 6. Kirim Telemetri IoT ke Server EWS setiap 5 menit (300.000 ms)
  if (now - lastTelemetryPub >= TELEMETRY_INTERVAL_MS) {
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
        Serial.print("⚡🌀 Hama Terdeteksi! Jarak: ");
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
  // LED nyala TERUS selama uvLedEnabled=true dan mode mengizinkan.
  // Warna berganti otomatis setiap ledRotationInterval menit.
  // ============================================================

  // Jika saklar LED UV dinonaktifkan (dari Web / Dashboard), matikan LED
  if (!uvLedEnabled) {
    turnOffLed();
    ledIsOn = false;
    return;
  }

  // Rotasi warna otomatis (berlaku di semua mode selama LED aktif)
  unsigned long rotIntervalMs = (unsigned long)ledRotationInterval * 60000UL;
  if (rotIntervalMs > 0 && (now - lastLedRotate >= rotIntervalMs)) {
    lastLedRotate = now;
    activePreset = (activePreset + 1) % 5;
    Serial.print("🎨 [Auto-Rotate LED] Beralih ke Preset ");
    Serial.print(activePreset + 1);
    Serial.print(": ");
    Serial.println(presets[activePreset].name);
  }

  switch (currentMode) {
    case MODE_MANUAL:
      // Manual: LED nyala TERUS (sebagai penarik hama)
      applyLedColor(presets[activePreset].r, presets[activePreset].g, presets[activePreset].b);
      ledIsOn = true;
      break;

    case MODE_OTOMATIS:
    case MODE_OTOMATIS_LED:
      // Otomatis: LED nyala hanya saat berada dalam jadwal jam RTC
      if (isWithinSchedule()) {
        applyLedColor(presets[activePreset].r, presets[activePreset].g, presets[activePreset].b);
        ledIsOn = true;
      } else {
        turnOffLed();
        ledIsOn = false;
      }
      break;

    case MODE_SLEEP:
      enterDeepSleep();
      break;
  }

  // ============================================================
  // LOGIKA BLOWER (RELAY 1) - PENGHISAP HAMA
  // Blower TIDAK dikendalikan di sini. Blower hanya nyala
  // saat sensor VL53L0X mendeteksi hama (di readSensors()).
  // Auto turn-off dilakukan di loop() berdasarkan blowerOffTime.
  // ============================================================
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
void setupWebServer() {
  // Halaman Utama Web Dashboard Lokal
  server.on("/", HTTP_GET, []() {
    String html = F("<!DOCTYPE html><html lang='id'><head><meta charset='UTF-8'>"
      "<meta name='viewport' content='width=device-width,initial-scale=1.0'>"
      "<title>Smart Pest Trap Controller</title>"
      "<style>"
      "body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:16px;line-height:1.5}"
      ".container{max-width:650px;margin:auto}"
      ".card{background:#1e293b;border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid #334155;box-shadow:0 4px 6px rgba(0,0,0,0.3)}"
      "h2,h3{margin-top:0;color:#38bdf8}"
      ".grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}"
      ".val{font-size:18px;font-weight:bold;color:#f1f5f9}"
      ".btn{background:#3b82f6;color:#fff;border:none;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:pointer;width:100%;margin-top:8px}"
      ".btn:hover{background:#2563eb}"
      ".btn-purple{background:#8b5cf6}.btn-purple:hover{background:#7c3aed}"
      ".btn-red{background:#ef4444}.btn-red:hover{background:#dc2626}"
      ".btn-green{background:#10b981}.btn-green:hover{background:#059669}"
      "input,select{width:100%;box-sizing:border-box;padding:8px;background:#0f172a;border:1px solid #475569;border-radius:6px;color:#fff;margin-top:4px}"
      ".preset-box{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;margin-bottom:6px;background:#0f172a}"
      ".dot{width:24px;height:24px;border-radius:50%;border:2px solid #fff}"
      "</style></head><body><div class='container'>"
      "<h2>🌾 Smart Pest Trap & Atraktor Hama</h2>"
      "<div class='card'>"
      "<h3>📊 Monitoring Parameter</h3>"
      "<div class='grid'>"
      "<div><span>Tegangan Aki:</span><div class='val' id='v_bat'>-</div></div>"
      "<div><span>Arus Beban:</span><div class='val' id='v_curr'>-</div></div>"
      "<div><span>Jarak VL53L0X:</span><div class='val' id='v_dist'>-</div></div>"
      "<div><span>Total Hama:</span><div class='val' id='v_pest'>-</div></div>"
      "<div><span>Jam RTC:</span><div class='val' id='v_rtc'>-</div></div>"
      "<div><span>Status Lampu:</span><div class='val' id='v_led'>-</div></div>"
      "</div></div>"
      "<div class='card'>"
      "<h3>⚙️ Pengaturan Mode Operasional</h3>"
      "<div class='grid'>"
      "<button class='btn btn-green' onclick=\"setMode('manual')\">MANUAL (Nyala Terus)</button>"
      "<button class='btn btn-purple' onclick=\"setMode('otomatis')\">OTOMATIS (Sesuai Jadwal)</button>"
      "<button class='btn' onclick=\"setMode('otomatis-led')\">OTOMATIS-LED (Rotasi Warna)</button>"
      "<button class='btn btn-red' onclick=\"setMode('sleep')\">MODE SLEEP (Mati Total)</button>"
      "</div></div>"
      "<div class='card'>"
      "<h3>🎨 Pilihan Preset Warna Atraktor Hama</h3>"
      "<div id='presets_list'></div>"
      "<div style='margin-top:12px;border-top:1px solid #334155;padding-top:10px'>"
      "<h4>Edit Preset Warna Custom (RGB)</h4>"
      "<select id='p_idx'><option value='0'>P1: Wereng</option><option value='1'>P2: Kutu Kebul</option><option value='2'>P3: Penggerek</option><option value='3'>P4: Ulat Grayak</option><option value='4'>P5: Putih</option></select>"
      "<div class='grid' style='margin-top:8px'>"
      "<div><label>R (Merah):</label><input type='number' id='p_r' min='0' max='255' value='255'></div>"
      "<div><label>G (Hijau):</label><input type='number' id='p_g' min='0' max='255' value='0'></div>"
      "<div><label>B (Biru):</label><input type='number' id='p_b' min='0' max='255' value='255'></div>"
      "<div><button class='btn btn-purple' style='margin-top:22px' onclick='saveCustomPreset()'>Simpan Warna</button></div>"
      "</div></div></div>"
      "<div class='card'>"
      "<h3>⏰ Atur Jadwal & Interval Rotasi</h3>"
      "<div class='grid'>"
      "<div><label>Jam Mulai (HH:MM):</label><input type='time' id='cfg_start'></div>"
      "<div><label>Jam Selesai (HH:MM):</label><input type='time' id='cfg_end'></div>"
      "<div><label>Interval Ganti Warna (Menit):</label><input type='number' id='cfg_rot' min='1' max='180'></div>"
      "<div><button class='btn' style='margin-top:22px' onclick='saveSchedule()'>Simpan Jadwal</button></div>"
      "</div></div>"
      "<script>"
      "function refreshData(){fetch('/api/status').then(r=>r.json()).then(d=>{"
      "document.getElementById('v_bat').innerText=d.batteryVoltage+' V';"
      "document.getElementById('v_curr').innerText=d.loadCurrent+' mA';"
      "document.getElementById('v_dist').innerText=d.currentDistance+' mm';"
      "document.getElementById('v_pest').innerText=d.photoelectricCount+' ekor';"
      "document.getElementById('v_rtc').innerText=d.currentTime;"
      "document.getElementById('v_led').innerText=d.uvLedStatus?'MENYALA':'MATI';"
      "let plist='';"
      "d.presets.forEach((p,i)=>{"
      "plist+=`<div class='preset-box'><div class='dot' style='background:rgb(${p.r},${p.g},${p.b})'></div><div style='flex:1'><b>${i+1}. ${p.name}</b><br><small>RGB(${p.r},${p.g},${p.b})</small></div><button class='btn' style='width:auto;margin:0' onclick='selectPreset(${i})'>${d.activePreset===i?'AKTIF':'PILIH'}</button></div>`;"
      "});document.getElementById('presets_list').innerHTML=plist;"
      "});}"
      "function setMode(m){fetch('/api/mode?val='+m,{method:'POST'}).then(()=>refreshData());}"
      "function selectPreset(i){fetch('/api/preset?val='+i,{method:'POST'}).then(()=>refreshData());}"
      "function saveCustomPreset(){"
      "let idx=document.getElementById('p_idx').value;"
      "let r=document.getElementById('p_r').value,g=document.getElementById('p_g').value,b=document.getElementById('p_b').value;"
      "fetch(`/api/preset/edit?idx=${idx}&r=${r}&g=${g}&b=${b}`,{method:'POST'}).then(()=>refreshData());}"
      "function saveSchedule(){"
      "let s=document.getElementById('cfg_start').value,e=document.getElementById('cfg_end').value,rot=document.getElementById('cfg_rot').value;"
      "fetch(`/api/schedule?start=${s}&end=${e}&rot=${rot}`,{method:'POST'}).then(()=>alert('Jadwal tersimpan'));}"
      "setInterval(refreshData,2000);refreshData();"
      "</script></div></body></html>");
    server.send(200, "text/html", html);
  });

  // API Status JSON
  server.on("/api/status", HTTP_GET, []() {
    StaticJsonDocument<1024> doc;
    doc["trapId"] = trapId;
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
}

// ==============================================================================
// 14. INTEGRASI IOT KE SERVER EWS (WEBSOCKET CLIENT)
// ==============================================================================
void setupWebSocket() {
  if (wsUseSsl) {
    webSocket.beginSSL(wsHost, wsPort, wsPath);
  } else {
    webSocket.begin(wsHost, wsPort, wsPath);
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

  // 9. Manual Zap / Reset Trigger
  if (data.containsKey("command")) {
    String cmd = data["command"].as<String>();
    if (cmd == "TRIGGER_ZAP") {
      digitalWrite(PIN_RELAY_1, HIGH);
      blowerEnabled = true;
      zapperActive = true;
      blowerOffTime = millis() + ((unsigned long)manualDurationSec * 1000UL);
    } else if (cmd == "RESET_COUNTER") {
      pestCounter = 0;
    }
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
  // Blower SELALU mati saat boot (hanya aktif dari trigger sensor VL53)
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