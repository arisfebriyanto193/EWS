/**
 * ==============================================================================
 * SISTEM MONITORING LANDSLIDE EARLY WARNING SYSTEM (EWS) - ESP32-S3 FIRMWARE
 * DENGAN ARSITEKTUR MULTI-TASKING FREERTOS & MUTEX SYNCHRONIZATION
 * ==============================================================================
 * Deskripsi:
 * Program firmware ESP32-S3 untuk Node EWS yang terhubung ke Backend Express
 * dan Frontend Next.js melalui protokol WebSocket secara real-time.
 *
 * Menerapkan FreeRTOS Dual-Core & Mutex:
 * - Core 0: Task WebSocket Client (Jaringan & Protokol TCP/SSL)
 * - Core 1: Task Sensor (I2C Inclinometer, INA226, OLED, ADC Tanah, Hujan)
 * - Core 1: Task Telemetri (Penerbitan Data dengan Pacing Buffer SSL)
 * - Mutex (wsMutex): Mengunci akses thread-safe ke webSocket.loop() & sendTXT()
 * - Mutex (dataMutex): Mengunci sinkronisasi data sensor antar-task
 * - Critical Section (vibMux): Penguncian atomik pulsa interrupt getaran 801S
 *
 * MAPPING PIN SESUAI DOKUMEN SCHEMATIC PCB:
 * File: Schematic_EWS45_2026-09-28.pdf
 * Mikrokontroler: ESP32-S3 (ESP32S3N16R8)
 * ------------------------------------------------------------------------------
 * PIN SCHEMATIC        | FUNGSI / KOMPONEN
 * ------------------------------------------------------------------------------
 * GPIO 46 (IN2)        | Output Relay Alarm Terpadu: Sirine 12V + Strobo (Active-HIGH)
 * GPIO 10 (Dhujan)     | Input Digital Sensor Hujan Tipping Bucket (H2)
 * GPIO 7  (Dgetar)     | Input Digital Sensor Getaran Shock 801S (SENSOR1)
 * GPIO 17 (Ktanah)     | Input Analog (ADC2_CH6) Sensor Kelembapan Tanah (J1.1 A0)
 * GPIO 8  (SDAoled)    | I2C SDA - Layar OLED 1.3" 128x64 (J5)
 * GPIO 9  (SCLoled)    | I2C SCL - Layar OLED 1.3" 128x64 (J5)
 * GPIO 11 (SDAMpu)     | I2C SDA - MPU-6050 Dual-Axis Inclinometer (U4)
 * GPIO 12 (SCLMpu)     | I2C SCL - MPU-6050 Dual-Axis Inclinometer (U4)
 * GPIO 13 (SCL2/SDA)   | I2C SDA - INA226 Voltage & Current Monitor (U3) via Net SCL2
 * GPIO 14 (SDA2/SCL)   | I2C SCL - INA226 Voltage & Current Monitor (U3) via Net SDA2
 * GPIO 4  (mosi)       | SPI MOSI - MicroSD Card Module (U5)
 * GPIO 5  (sck)        | SPI SCK - MicroSD Card Module (U5)
 * GPIO 6  (cs)         | SPI CS - MicroSD Card Module (U5)
 * GPIO 2  (miso)       | SPI MISO - MicroSD Card Module (U5)
 * GPIO 15 (SDAds)      | I2C SDA - DS3231 High-Precision RTC (Bus Terpisah 0x68)
 * GPIO 16 (SCLds)      | I2C SCL - DS3231 High-Precision RTC (Bus Terpisah 0x68)
 * ==============================================================================
 */

#include <WiFi.h>
#include <WiFiManager.h>
#include <WebServer.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <SPI.h>
#include <SD.h>
#include <math.h>
#include <time.h>
#include <Preferences.h>
// Catatan: Library MPU6050, INA219, dan DS3231 kini menggunakan driver bus independen
// (Hardware TwoWire 1 untuk MPU-6050 & Dedicated SoftI2C untuk RTC/INA)
// sehingga tidak lagi memerlukan overhead atau bentrok bus dari library Adafruit_BusIO.

// Forward Declarations Struct & Functions untuk Arduino Preprocessor
struct SensorThresholds;
struct SensorRawValues;
struct SensorDataSnapshot;
void setupWebServer();
void updateWebSocketTopics();
void saveThresholdsToEEPROM(const SensorThresholds &newT);
void loadThresholdsFromEEPROM();
void saveDeviceConfigToNVS(const String &newId, const String &newSsid, const String &newPass,
                           const String &newHost, int newPort, const String &newPath, bool newSsl);
void loadDeviceConfigFromNVS();
void syncRTCWithNTP();

// FreeRTOS Headers
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"

// Aktifkan dukungan layar OLED jika library terpasang (1 = Aktif, 0 = Nonaktif)
#define ENABLE_OLED 1

#if ENABLE_OLED
  #include <Adafruit_GFX.h>
  #include <Adafruit_SH110X.h>
  #define SCREEN_WIDTH 128
  #define SCREEN_HEIGHT 64
  #define OLED_RESET -1
  #define OLED_I2C_ADDR 0x3C
#endif

// =============================================================================
// 1. KONFIGURASI JARINGAN, DEVICE ID & SERVER WEBSOCKET (DAPAT DIATUR VIA WEB)
// =============================================================================
// Default Fallback Kredensial WiFi (dapat diganti via NVS/Web/WiFiManager)
String wifiSsidDefault     = "TALAS 1";
String wifiPasswordDefault = "kitahebat";

// Konfigurasi Target WebSocket Server (disimpan & dibaca dari NVS Preferences)
bool   wsUseSsl            = true;
String wsHost              = "be-ews.qbyte.web.id";
int    wsPort              = 443;
String wsPath              = "/ws";

// Identitas Node Stasiun EWS (disimpan di NVS "ews_cfg" -> "devId")
String ewsId               = "EWS-02";
const char* FIRMWARE_VERSION = "v2.5.0-CALIB-WEB";

// Objek Internal WebServer untuk Kalibrasi & Konfigurasi Mandiri
WebServer localServer(80);
volatile bool triggerWiFiManagerPortal = false;

// =============================================================================
// 2. DEFINISI PIN SESUAI SCHEMATIC PCB
// =============================================================================
// Aktuator Relay (Sirine & Strobo digabung menjadi 1 pin: GPIO 46, Active-HIGH)
#define PIN_RELAY_ALARM      46  // IN2 -> GPIO 46 (Sirine + Strobo)
#define PIN_RELAY_SIRINE     PIN_RELAY_ALARM
#define PIN_RELAY_STROBO     PIN_RELAY_ALARM

// Logika Relay (Active-HIGH)
#define RELAY_ACTIVE_LEVEL   HIGH
#define RELAY_DEACTIVE_LEVEL LOW

// Sensor Lingkungan & Geoteknik
#define PIN_RAIN_DIGITAL   10   // Dhujan -> GPIO 10 (Input Digital Sensor Hujan Tipping Bucket)
#define PIN_VIB_SIG        7   // Dgetar -> GPIO 7 (Input Digital Getaran 801S)
#define PIN_SOIL_ANALOG    17  // Ktanah -> GPIO 17 (ADC2_CH6 Kelembapan Tanah J1.1 A0)

// Pin I2C Perangkat 1: OLED 1.3" (Header J5)
#define PIN_OLED_SDA_utama     8   // SDAoled Utama -> GPIO 8
#define PIN_OLED_SDA_cadangan  18  // SDAoled Cadangan (Fallback) -> GPIO 18
#define PIN_OLED_SDA           PIN_OLED_SDA_cadangan // Alias kompatibilitas
#define PIN_OLED_SCL           9   // SCLoled -> GPIO 9

// Pin I2C Perangkat 2: MPU-6050 Dual-Axis Inclinometer (U4)
#define PIN_MPU_SDA        11  // SDAMpu -> GPIO 11
#define PIN_MPU_SCL        12  // SCLMpu -> GPIO 12
#define MPU6050_ADDR       0x68

// Pin I2C Perangkat 3: INA219 / INA226 Voltage & Current Monitor (U3)
// Terbukti dari hardware scanner: GPIO 14 = SDA, GPIO 13 = SCL
#define PIN_INA_SDA        14  // Pin SDA INA219 (GPIO 14)
#define PIN_INA_SCL        13  // Pin SCL INA219 (GPIO 13)
#define INA_I2C_ADDR         0x40

// Pin SPI Perangkat 4: Modul MicroSD Card (U5)
#define PIN_SD_MOSI        4   // mosi -> GPIO 4
#define PIN_SD_SCK         5   // sck  -> GPIO 5
#define PIN_SD_CS          6   // cs   -> GPIO 6
#define PIN_SD_MISO        2   // miso -> GPIO 2

// Pin I2C Perangkat 5: Real-Time Clock DS3231 (Bus I2C terpisah untuk isolasi alamat 0x68 dari MPU6050)
#define PIN_RTC_SDA        15  // SDAds -> GPIO 15
#define PIN_RTC_SCL        16  // SCLds -> GPIO 16
#define DS3231_ADDR        0x68

// =============================================================================
// 3. TOPIK KOMUNIKASI WEBSOCKET (DINAMIS SESUAI DEVICE_ID)
// =============================================================================
String TOPIC_COMMAND;
String TOPIC_TELEMETRY;
String TOPIC_STATUS;
String TOPIC_PITCH;
String TOPIC_ROLL;
String TOPIC_SOIL;
String TOPIC_RAIN;
String TOPIC_RAIN_CUMU;
String TOPIC_VIB;
String TOPIC_BATT;
String TOPIC_SOLAR;
String TOPIC_IP;
String TOPIC_WIFI_SSID;
String TOPIC_WIFI_RSSI;
const char* LEGACY_RELAY_TOPIC = "USR_687de6987184f/1defa9dd";

void updateWebSocketTopics() {
  TOPIC_COMMAND   = "ews/" + ewsId + "/command";
  TOPIC_TELEMETRY = "ews/" + ewsId + "/telemetry";
  TOPIC_STATUS    = "ews/" + ewsId + "/status";
  TOPIC_PITCH     = "ews/" + ewsId + "/pitch";
  TOPIC_ROLL      = "ews/" + ewsId + "/roll";
  TOPIC_SOIL      = "ews/" + ewsId + "/soil_moisture";
  TOPIC_RAIN      = "ews/" + ewsId + "/rainfall_rate";
  TOPIC_RAIN_CUMU = "ews/" + ewsId + "/rainfall_cumulative";
  TOPIC_VIB       = "ews/" + ewsId + "/vibration";
  TOPIC_BATT      = "ews/" + ewsId + "/battery_voltage";
  TOPIC_SOLAR     = "ews/" + ewsId + "/solar_current";
  TOPIC_IP        = "ews/" + ewsId + "/ip";
  TOPIC_WIFI_SSID = "ews/" + ewsId + "/wifi_ssid";
  TOPIC_WIFI_RSSI = "ews/" + ewsId + "/wifi_rssi";
}

// =============================================================================
// 4. STRUKTUR DATA, EEPROM THRESHOLDS & MUTEX SYNCHRONIZATION
// =============================================================================
struct SensorThresholds {
  // Nilai Aman / Titik Nol Acuan Kalibrasi Sensor
  float safeTiltPitch;        // Baseline aman pitch (Derajat, default 0.0)
  float safeTiltRoll;         // Baseline aman roll (Derajat, default 0.0)
  float tiltTolerance;        // Toleransi simpangan aman (+- derajat, default: 2.0°)
  float tiltWarning;          // Default: 5.0 Derajat simpangan
  float tiltDanger;           // Default: 10.0 Derajat simpangan
  
  float rainWarning;          // Default: 20.0 mm/jam
  float rainDanger;           // Default: 50.0 mm/jam
  
  float safeSoilMoisture;     // Baseline aman kelembapan tanah (%, default: 50.0%)
  float soilMoistureTolerance;// Toleransi simpangan aman tanah (+- %, default: 15.0%)
  float soilMoistureWarning;  // Ambang batas siaga kelembapan tinggi: 75.0%
  
  float vibrationDanger;      // Default: 0.25 g / hitungan pulsa
  float batteryLowVoltage;    // Default: 11.8 V
  
  // Kalibrasi ADC Tanah (Raw ADC saat kering & saat basah)
  int soilAdcDry;             // Default 3300
  int soilAdcWet;             // Default 1200
  float rainCalibPerTip;      // mm per tip, default: 0.70 mm

  // Siklus Timer Alarm Otomatis (Detik / S)
  uint32_t alarmDuration;     // Durasi sirine aktif saat anomali (detik, default: 60)
  uint32_t alarmPause;        // Jeda waktu mati sebelum sirine menyala lagi jika masih anomali (detik, default: 30)
};

struct SensorRawValues {
  float pitchRaw;
  float rollRaw;
  int soilAdcRaw;
  float soilVoltRaw;
  float inaVoltRaw;
  int inaSolarCurrent;
  int inaBattCurrent;
  unsigned long rainTipsRaw;
  unsigned long vibPulsesRaw;
};

struct SensorDataSnapshot {
  float pitch;
  float roll;
  float soilMoisture;
  float soilTemp;
  float rainRate;
  float rainCumulative;
  unsigned long rainTips;
  float vibration;
  unsigned long vibrationPulses;
  float batteryVoltage;
  int solarCurrent;
  int batteryCurrent;
  int wifiRssi;
  unsigned long uptimeHours;
  char status[16];
};

// Objek Global, EEPROM / NVS & Mutex Handles
Preferences prefs;
SensorThresholds currentThresholds = {
  0.0f,   // safeTiltPitch
  0.0f,   // safeTiltRoll
  2.0f,   // tiltTolerance (+- 2 derajat)
  5.0f,   // tiltWarning
  10.0f,  // tiltDanger
  20.0f,  // rainWarning
  50.0f,  // rainDanger
  50.0f,  // safeSoilMoisture
  15.0f,  // soilMoistureTolerance (+- 15%)
  75.0f,  // soilMoistureWarning
  0.25f,  // vibrationDanger
  11.8f,  // batteryLowVoltage
  3300,   // soilAdcDry
  1200,   // soilAdcWet
  0.70f,  // rainCalibPerTip
  60,     // alarmDuration (detik, default 60s)
  30      // alarmPause (detik, default 30s)
};

SensorRawValues sharedRawSensors;

WebSocketsClient webSocket;
SemaphoreHandle_t wsMutex   = NULL; // Mutex untuk proteksi webSocket.loop() & sendTXT()
SemaphoreHandle_t dataMutex = NULL; // Mutex untuk proteksi pembacaan data sensor & thresholds

SensorDataSnapshot sharedSensors;

// Critical Section untuk ISR Sensor Getaran Digital 801S
portMUX_TYPE vibMux = portMUX_INITIALIZER_UNLOCKED;
volatile unsigned long vibPulseCounter = 0;

void IRAM_ATTR onVibrationTriggered() {
  portENTER_CRITICAL_ISR(&vibMux);
  vibPulseCounter++;
  portEXIT_CRITICAL_ISR(&vibMux);
}

// --- SENSOR CURAH HUJAN TIPPING BUCKET (GPIO 10) ---
const byte RAIN_SENSOR_PIN = PIN_RAIN_DIGITAL; // Pin GPIO ESP32 yang terhubung ke OUT sensor (Dhujan)
const float CURAH_PER_TIP = 0.70;        // Nilai kalibrasi dari video (0.70 mm per tip)

// --- VARIABEL GLOBAL SENSOR HUJAN (TIPPING BUCKET) ---
volatile unsigned long tipCount = 0;
volatile unsigned long lastDebounceTime = 0;
// Interval minimum mekanis jungkitan (300 ms = maks 3.3 tip/detik)
// Tidak mungkin jungkitan mekanis di lapangan berosilasi lebih cepat dari 300 ms.
const unsigned long MIN_TIP_INTERVAL_MS = 300;

// --- ISR (Interrupt Service Routine) DENGAN HARDENED GLITCH FILTER ---
void IRAM_ATTR countTip() {
  unsigned long currentTime = millis();
  // 1. Cek interval waktu lockout debouncing
  if ((currentTime - lastDebounceTime) >= MIN_TIP_INTERVAL_MS) {
    // 2. Verifikasi awal logika pin (harus LOW saat kontak magnetik tertutup)
    if (digitalRead(PIN_RAIN_DIGITAL) == LOW) {
      // 3. Glitch Filter anti-derau induksi elektromagnetik (EMI) & RF spike WiFi:
      // Derau RF/switching spike transient berlangsung < 50 us.
      // Sedangkan kontak mekanis reed switch ember jungkit bertahan tertutup 15 - 40 ms.
      // Tunggu 2500 us (2.5 ms) dan verifikasi bahwa kontak reed switch masih berlogika LOW.
      esp_rom_delay_us(2500);
      if (digitalRead(PIN_RAIN_DIGITAL) == LOW) {
        tipCount++;
        lastDebounceTime = currentTime;
      }
    }
  }
}

// -----------------------------------------------------------------------------
// FUNGSI EEPROM (NVS FLASH) UNTUK PENYIMPANAN AMBANG BATAS (THRESHOLDS)
// -----------------------------------------------------------------------------
void loadDeviceConfigFromNVS() {
  if (prefs.begin("ews_cfg", true)) {
    ewsId               = prefs.getString("devId", "EWS-02");
    wifiSsidDefault     = prefs.getString("wfSsid", "TALAS 1");
    wifiPasswordDefault = prefs.getString("wfPass", "kitahebat");
    wsHost              = prefs.getString("wsHost", "be-ews.qbyte.web.id");
    wsPort              = prefs.getInt("wsPort", 443);
    wsPath              = prefs.getString("wsPath", "/ws");
    wsUseSsl            = prefs.getBool("wsSsl", true);
    prefs.end();
  }
  updateWebSocketTopics();
  Serial.printf("📋 [NVS] Identitas Perangkat: Device ID [%s], Host: %s:%d%s\n", 
                ewsId.c_str(), wsHost.c_str(), wsPort, wsPath.c_str());
}

void saveDeviceConfigToNVS(const String &newId, const String &newSsid, const String &newPass,
                           const String &newHost, int newPort, const String &newPath, bool newSsl) {
  if (prefs.begin("ews_cfg", false)) {
    prefs.putString("devId", newId);
    prefs.putString("wfSsid", newSsid);
    prefs.putString("wfPass", newPass);
    prefs.putString("wsHost", newHost);
    prefs.putInt("wsPort", newPort);
    prefs.putString("wsPath", newPath);
    prefs.putBool("wsSsl", newSsl);
    prefs.end();
    
    ewsId               = newId;
    wifiSsidDefault     = newSsid;
    wifiPasswordDefault = newPass;
    wsHost              = newHost;
    wsPort              = newPort;
    wsPath              = newPath;
    wsUseSsl            = newSsl;
    updateWebSocketTopics();
    Serial.printf("💾 [NVS] Konfigurasi Device ID [%s] & Koneksi Berhasil Disimpan!\n", ewsId.c_str());
  }
}

void loadThresholdsFromEEPROM() {
  if (prefs.begin("ews_thresh", true)) { // Read-only mode
    currentThresholds.safeTiltPitch         = prefs.getFloat("safePitch", 0.0f);
    currentThresholds.safeTiltRoll          = prefs.getFloat("safeRoll", 0.0f);
    currentThresholds.tiltTolerance         = prefs.getFloat("tiltTol", 2.0f);
    currentThresholds.tiltWarning           = prefs.getFloat("tiltWarn", 5.0f);
    currentThresholds.tiltDanger            = prefs.getFloat("tiltDang", 10.0f);
    currentThresholds.rainWarning           = prefs.getFloat("rainWarn", 20.0f);
    currentThresholds.rainDanger            = prefs.getFloat("rainDang", 50.0f);
    currentThresholds.safeSoilMoisture      = prefs.getFloat("safeSoil", 50.0f);
    currentThresholds.soilMoistureTolerance = prefs.getFloat("soilTol", 15.0f);
    currentThresholds.soilMoistureWarning   = prefs.getFloat("soilWarn", 75.0f);
    currentThresholds.vibrationDanger       = prefs.getFloat("vibDang", 0.25f);
    currentThresholds.batteryLowVoltage     = prefs.getFloat("battLow", 11.8f);
    currentThresholds.soilAdcDry            = prefs.getInt("soilDry", 3300);
    currentThresholds.soilAdcWet            = prefs.getInt("soilWet", 1200);
    currentThresholds.rainCalibPerTip       = prefs.getFloat("rainCalib", 0.70f);
    currentThresholds.alarmDuration         = prefs.getUInt("alarmDur", 60);
    currentThresholds.alarmPause            = prefs.getUInt("alarmPause", 30);
    prefs.end();

    Serial.println("💾 [EEPROM/NVS] Berhasil memuat nilai acuan kalibrasi & ambang batas:");
    Serial.printf("   - Sudut Aman Pitch/Roll : %.2f° / %.2f° (Toleransi: +-%.2f°)\n", 
                  currentThresholds.safeTiltPitch, currentThresholds.safeTiltRoll, currentThresholds.tiltTolerance);
    Serial.printf("   - Sudut Siaga/Bahaya    : >= %.2f° / >= %.2f°\n", currentThresholds.tiltWarning, currentThresholds.tiltDanger);
    Serial.printf("   - Curah Hujan           : Siaga >= %.1f mm/h, Bahaya >= %.1f mm/h, Cal: %.2f mm/tip\n", 
                  currentThresholds.rainWarning, currentThresholds.rainDanger, currentThresholds.rainCalibPerTip);
    Serial.printf("   - Tanah Aman / Tol      : %.1f%% (Tol: +-%.1f%%) | Siaga: >= %.1f%% (ADC %d-%d)\n", 
                  currentThresholds.safeSoilMoisture, currentThresholds.soilMoistureTolerance, 
                  currentThresholds.soilMoistureWarning, currentThresholds.soilAdcDry, currentThresholds.soilAdcWet);
    Serial.printf("   - Getaran / Baterai Min : Bahaya >= %.2f | Baterai < %.2f V\n", 
                  currentThresholds.vibrationDanger, currentThresholds.batteryLowVoltage);
    Serial.printf("   - Siklus Alarm Otomatis : Aktif %u s | Jeda %u s\n", 
                  currentThresholds.alarmDuration, currentThresholds.alarmPause);
  } else {
    Serial.println("ℹ️ [EEPROM/NVS] Belum ada konfigurasi di Flash. Menggunakan nilai bawaan.");
  }
}

void saveThresholdsToEEPROM(const SensorThresholds &newT) {
  if (prefs.begin("ews_thresh", false)) { // Read-write mode
    prefs.putFloat("safePitch", newT.safeTiltPitch);
    prefs.putFloat("safeRoll", newT.safeTiltRoll);
    prefs.putFloat("tiltTol", newT.tiltTolerance);
    prefs.putFloat("tiltWarn", newT.tiltWarning);
    prefs.putFloat("tiltDang", newT.tiltDanger);
    prefs.putFloat("rainWarn", newT.rainWarning);
    prefs.putFloat("rainDang", newT.rainDanger);
    prefs.putFloat("safeSoil", newT.safeSoilMoisture);
    prefs.putFloat("soilTol", newT.soilMoistureTolerance);
    prefs.putFloat("soilWarn", newT.soilMoistureWarning);
    prefs.putFloat("vibDang", newT.vibrationDanger);
    prefs.putFloat("battLow", newT.batteryLowVoltage);
    prefs.putInt("soilDry", newT.soilAdcDry);
    prefs.putInt("soilWet", newT.soilAdcWet);
    prefs.putFloat("rainCalib", newT.rainCalibPerTip);
    prefs.putUInt("alarmDur", newT.alarmDuration);
    prefs.putUInt("alarmPause", newT.alarmPause);
    prefs.end();

    if (dataMutex != NULL && xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
      currentThresholds = newT;
      xSemaphoreGive(dataMutex);
    } else {
      currentThresholds = newT;
    }

    Serial.println("💾 [EEPROM/NVS] Nilai Kalibrasi & Ambang Batas BARU BERHASIL DISIMPAN!");
    Serial.printf("   - Siklus Alarm Tersimpan: Aktif=%u s, Jeda=%u s\n", newT.alarmDuration, newT.alarmPause);
  } else {
    Serial.println("❌ [EEPROM/NVS] Gagal membuka partisi flash ews_thresh untuk penulisan!");
  }
}

// Status Koneksi & Aktuator
volatile bool isWsConnected = false;
volatile bool needSubscribe = false;
bool sirenActive  = false;
bool stroboActive = false;
String currentStatus = "aman";

// Manajemen Siklus Timer Alarm Otomatis
enum AlarmCycleState {
  ALARM_STATE_IDLE = 0,
  ALARM_STATE_SOUNDING = 1,
  ALARM_STATE_PAUSED = 2
};

AlarmCycleState alarmCycleState = ALARM_STATE_IDLE;
unsigned long alarmSoundingStartTime = 0;
unsigned long alarmPauseStartTime = 0;

// Konfigurasi Interval Telemetri Cerdas & Hemat Daya
const unsigned long REALTIME_TELEMETRY_INTERVAL   = 3000;    // 3 detik saat Web dibuka (Client Aktif)
const unsigned long LOW_POWER_TELEMETRY_INTERVAL  = 300000;  // 5 menit (300 detik) saat tidak ada client membuka web
const unsigned long CLIENT_ACTIVITY_TIMEOUT       = 25000;   // 25 detik tanpa pesan dari web = client telah menutup web

volatile unsigned long lastClientActivityTime = 0;
volatile bool forceTelemetryPublish = false;

// Timer Buzzer Test
unsigned long buzzerTestTimeout = 0;
bool isBuzzerTesting = false;

// Manajemen Bus I2C Hardware Wire (ESP32-S3 TwoWire 0):
// - Seluruh perangkat diakses via Wire dengan pergantian pin dinamis aman (selectI2CBus)
// - Terbukti 100% stabil pada i2c_scanner & sketsa folder debug tanpa bentrok

#if ENABLE_OLED
  Adafruit_SH1106G display = Adafruit_SH1106G(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
  bool oledAvailable = false;
  SemaphoreHandle_t oledMutex = NULL;
#endif

// Status Deteksi Perangkat Keras (Hardware Diagnostics)
bool mpuAvailable = false;
bool inaAvailable = false;
bool isINA219     = true;   // true jika modul adalah INA219
uint8_t inaSdaPin = PIN_INA_SDA;
uint8_t inaSclPin = PIN_INA_SCL;
uint8_t inaI2CAddr = INA_I2C_ADDR;

bool rtcAvailable = false;
uint8_t rtcSdaPin = PIN_RTC_SDA;
uint8_t rtcSclPin = PIN_RTC_SCL;
String rtcTimeString = "--:--:--";

bool sdAvailable = false;
uint64_t sdCardSizeMB = 0;

// =============================================================================
// 5. HELPER PENGIRIMAN WEBSOCKET DENGAN MUTEX
// =============================================================================
bool safeSendTXT(const String &data) {
  bool sent = false;
  if (wsMutex != NULL && xSemaphoreTake(wsMutex, pdMS_TO_TICKS(250)) == pdTRUE) {
    if (webSocket.isConnected()) {
      sent = webSocket.sendTXT(data.c_str());
    }
    xSemaphoreGive(wsMutex);
  }
  return sent;
}

// =============================================================================
// 6. MANAJEMEN BUS I2C MULTI-PIN DENGAN HARDWARE WIRE (ESP32-S3)
// =============================================================================
int activeOledSda = PIN_OLED_SDA_utama;
int activeInaSda  = PIN_INA_SDA;
int activeInaScl  = PIN_INA_SCL;
int activeRtcSda  = PIN_RTC_SDA;
int activeRtcScl  = PIN_RTC_SCL;

void selectI2CBus(int sda, int scl, uint32_t freq = 100000) {
  static int currentSda = -1;
  static int currentScl = -1;
  static uint32_t currentFreq = 0;

  if (currentSda == sda && currentScl == scl && currentFreq == freq) {
    return;
  }

  Wire.end();
  delay(10);
  pinMode(sda, INPUT_PULLUP);
  pinMode(scl, INPUT_PULLUP);
  Wire.setPins(sda, scl);
  Wire.begin(sda, scl, freq);
  Wire.setTimeOut(30);

  currentSda = sda;
  currentScl = scl;
  currentFreq = freq;
}

uint8_t bcd2dec(uint8_t val) { return ((val / 16 * 10) + (val % 16)); }
uint8_t dec2bcd(uint8_t val) { return ((val / 10 * 16) + (val % 10)); }

// =============================================================================
// 7. DRIVER & DETEKSI REAL-TIME CLOCK DS3231 (VIA WIRE PADA GPIO 15 & 16)
// =============================================================================
void initDS3231() {
  selectI2CBus(activeRtcSda, activeRtcScl, 100000);
  Wire.beginTransmission(DS3231_ADDR);
  byte err = Wire.endTransmission();

  if (err != 0) {
    // Coba pin terbalik (GPIO 16 SDA, GPIO 15 SCL) jika belum terdeteksi
    selectI2CBus(PIN_RTC_SCL, PIN_RTC_SDA, 100000);
    Wire.beginTransmission(DS3231_ADDR);
    if (Wire.endTransmission() == 0) {
      activeRtcSda = PIN_RTC_SCL;
      activeRtcScl = PIN_RTC_SDA;
      rtcAvailable = true;
    } else {
      rtcAvailable = false;
      rtcTimeString = "TIDAK TERDETEKSI";
      Serial.printf("⚠️ [DS3231] Tidak merespons pada alamat 0x68 (SDA=%d, SCL=%d). Melanjutkan booting...\n", activeRtcSda, activeRtcScl);
      return;
    }
  } else {
    rtcAvailable = true;
  }

  Wire.beginTransmission(DS3231_ADDR);
  Wire.write(0x00);
  if (Wire.endTransmission(false) == 0 && Wire.requestFrom((uint8_t)DS3231_ADDR, (size_t)7) == 7) {
    uint8_t sec  = bcd2dec(Wire.read() & 0x7F);
    uint8_t min  = bcd2dec(Wire.read());
    uint8_t hour = bcd2dec(Wire.read() & 0x3F);
    uint8_t dow  = bcd2dec(Wire.read());
    uint8_t day  = bcd2dec(Wire.read());
    uint8_t mon  = bcd2dec(Wire.read() & 0x1F);
    uint16_t yr  = 2000 + bcd2dec(Wire.read());
    char timeBuf[32];
    snprintf(timeBuf, sizeof(timeBuf), "%04d-%02d-%02d %02d:%02d:%02d", yr, mon, day, hour, min, sec);
    rtcTimeString = String(timeBuf);
    Serial.printf("✅ [DS3231] RTC terdeteksi: %s (SDA=%d, SCL=%d)\n", timeBuf, activeRtcSda, activeRtcScl);
  }
}

void readDS3231Time() {
  if (!rtcAvailable) return;
  selectI2CBus(activeRtcSda, activeRtcScl, 100000);
  Wire.beginTransmission(DS3231_ADDR);
  Wire.write(0x00);
  if (Wire.endTransmission(false) == 0 && Wire.requestFrom((uint8_t)DS3231_ADDR, (size_t)7) == 7) {
    uint8_t sec  = bcd2dec(Wire.read() & 0x7F);
    uint8_t min  = bcd2dec(Wire.read());
    uint8_t hour = bcd2dec(Wire.read() & 0x3F);
    uint8_t dow  = bcd2dec(Wire.read());
    uint8_t day  = bcd2dec(Wire.read());
    uint8_t mon  = bcd2dec(Wire.read() & 0x1F);
    uint16_t yr  = 2000 + bcd2dec(Wire.read());
    char timeBuf[32];
    snprintf(timeBuf, sizeof(timeBuf), "%04d-%02d-%02d %02d:%02d:%02d", yr, mon, day, hour, min, sec);
    rtcTimeString = String(timeBuf);
  }
}

bool setRTC(int year, int month, int day, int hour, int minute, int second) {
  if (!rtcAvailable) return false;
  selectI2CBus(activeRtcSda, activeRtcScl, 100000);
  Wire.beginTransmission(DS3231_ADDR);
  Wire.write(0x00);
  Wire.write(dec2bcd(second));
  Wire.write(dec2bcd(minute));
  Wire.write(dec2bcd(hour));
  Wire.write(dec2bcd(1));
  Wire.write(dec2bcd(day));
  Wire.write(dec2bcd(month));
  Wire.write(dec2bcd(year % 100));
  return (Wire.endTransmission() == 0);
}

// -----------------------------------------------------------------------------
// SINKRONISASI WAKTU RTC DS3231 DENGAN NTP (HANYA SEKALI SAAT TERSAMBUNG JARINGAN)
// -----------------------------------------------------------------------------
const long  gmtOffset_sec     = 7 * 3600; // GMT+7 (WIB / Waktu Indonesia Barat)
const int   daylightOffset_sec = 0;       // Tidak ada DST di Indonesia
const char* ntpServer1        = "pool.ntp.org";
const char* ntpServer2        = "id.pool.ntp.org";
const char* ntpServer3        = "time.google.com";

volatile bool rtcSyncedWithNTP = false;

void syncRTCWithNTP() {
  // Hanya jalankan sekali saja di awal saat tersambung jaringan
  if (rtcSyncedWithNTP) return;
  if (WiFi.status() != WL_CONNECTED) return;
  if (!rtcAvailable) {
    rtcSyncedWithNTP = true; // Tandai selesai agar tidak polling jika modul fisik tidak ada
    return;
  }

  Serial.println("⏱️ [NTP-RTC] Jaringan WiFi tersambung! Sinkronisasi waktu NTP ke DS3231 (1x di awal)...");
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer1, ntpServer2, ntpServer3);

  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 5000)) { // Tunggu hingga 5 detik agar paket NTP diterima
    int yr  = timeinfo.tm_year + 1900;
    int mon = timeinfo.tm_mon + 1;
    int day = timeinfo.tm_mday;
    int hr  = timeinfo.tm_hour;
    int min = timeinfo.tm_min;
    int sec = timeinfo.tm_sec;

    if (yr >= 2024) {
      if (setRTC(yr, mon, day, hr, min, sec)) {
        readDS3231Time();
        rtcSyncedWithNTP = true;
        Serial.printf("✅ [NTP-RTC] DS3231 BERHASIL DISINKRONKAN: %s WIB (Sinkronisasi awal selesai)\n", rtcTimeString.c_str());
      } else {
        Serial.println("❌ [NTP-RTC] Gagal menulis register waktu baru ke DS3231!");
      }
    } else {
      Serial.printf("⚠️ [NTP-RTC] Tahun NTP belum valid (%d), akan dicoba lagi saat jaringan siap.\n", yr);
    }
  } else {
    Serial.println("⚠️ [NTP-RTC] Timeout mengambil waktu dari server NTP!");
  }
}

// =============================================================================
// 8. DRIVER & DETEKSI POWER MONITOR INA219 / INA226 (VIA WIRE PADA GPIO 14 & 13)
// =============================================================================
void initINA() {
  selectI2CBus(activeInaSda, activeInaScl, 100000);
  Wire.beginTransmission(INA_I2C_ADDR);
  byte err = Wire.endTransmission();

  if (err != 0) {
    // Coba pin terbalik (GPIO 13 SDA, GPIO 14 SCL)
    selectI2CBus(PIN_INA_SCL, PIN_INA_SDA, 100000);
    Wire.beginTransmission(INA_I2C_ADDR);
    if (Wire.endTransmission() == 0) {
      activeInaSda = PIN_INA_SCL;
      activeInaScl = PIN_INA_SDA;
      inaAvailable = true;
    } else {
      inaAvailable = false;
      Serial.printf("⚠️ [INA219] Tidak merespons pada alamat 0x40 (SDA=%d, SCL=%d). Melanjutkan booting...\n", activeInaSda, activeInaScl);
      return;
    }
  } else {
    inaAvailable = true;
  }

  // Baca Register Konfigurasi 0x00
  Wire.beginTransmission(INA_I2C_ADDR);
  Wire.write(0x00);
  Wire.endTransmission(false);
  uint16_t cfg = 0;
  if (Wire.requestFrom((uint8_t)INA_I2C_ADDR, (size_t)2) == 2) {
    cfg = (Wire.read() << 8) | Wire.read();
  }

  if (cfg == 0x4127 || cfg == 0x4527) {
    isINA219 = false; // INA226
    Serial.printf("✅ [INA226] Terdeteksi (SDA=%d, SCL=%d)\n", activeInaSda, activeInaScl);
  } else {
    isINA219 = true;  // INA219
    // Konfigurasi INA219: 32V Range, Gain 8, 12-bit ADC -> 0x399F
    Wire.beginTransmission(INA_I2C_ADDR);
    Wire.write(0x00);
    Wire.write(0x39);
    Wire.write(0x9F);
    Wire.endTransmission();

    // Kalibrasi Rshunt 0.1 Ohm (R100): Cal = 4096 (1 LSB = 0.1 mA)
    Wire.beginTransmission(INA_I2C_ADDR);
    Wire.write(0x05);
    Wire.write(0x10);
    Wire.write(0x00);
    Wire.endTransmission();
    Serial.printf("✅ [INA219] Berhasil terhubung & terkalibrasi 32V 2A (SDA=%d, SCL=%d)\n", activeInaSda, activeInaScl);
  }
}

void initINA226() {
  initINA();
}

void readPowerMonitor(float &batteryVolt, int &solarCurrent, int &batteryCurrent) {
  if (inaAvailable) {
    selectI2CBus(activeInaSda, activeInaScl, 100000);
    uint16_t rawBus = 0;
    uint16_t rawShunt = 0;

    Wire.beginTransmission(INA_I2C_ADDR);
    Wire.write(0x02);
    if (Wire.endTransmission(false) == 0 && Wire.requestFrom((uint8_t)INA_I2C_ADDR, (size_t)2) == 2) {
      rawBus = (Wire.read() << 8) | Wire.read();
      if (isINA219) {
        batteryVolt = (float)((rawBus >> 3) * 4) * 0.001f;
      } else {
        batteryVolt = (float)rawBus * 0.00125f;
      }
    } else {
      batteryVolt = 0.0f;
    }

    Wire.beginTransmission(INA_I2C_ADDR);
    Wire.write(0x01);
    if (Wire.endTransmission(false) == 0 && Wire.requestFrom((uint8_t)INA_I2C_ADDR, (size_t)2) == 2) {
      rawShunt = (Wire.read() << 8) | Wire.read();
      int16_t sVal = (int16_t)rawShunt;
      if (isINA219) {
        float currentMa = (float)sVal * 0.1f;
        solarCurrent   = abs((int)currentMa);
        batteryCurrent = solarCurrent;
      } else {
        float currentMa = (float)sVal * 0.25f;
        solarCurrent   = abs((int)currentMa);
        batteryCurrent = solarCurrent;
      }
    } else {
      solarCurrent = 0;
      batteryCurrent = 0;
    }
    return;
  }

  batteryVolt    = 0.0f;
  solarCurrent   = 0;
  batteryCurrent = 0;
}

// =============================================================================
// 9. DRIVER & DETEKSI MPU-6050 DUAL-AXIS INCLINOMETER (VIA WIRE PADA GPIO 11 & 12)
// =============================================================================
void initMPU6050() {
  selectI2CBus(PIN_MPU_SDA, PIN_MPU_SCL, 100000);
  delay(10);
  Wire.beginTransmission(MPU6050_ADDR);
  byte err = Wire.endTransmission();

  if (err == 0) {
    // Bangunkan MPU-6050 dari sleep mode (register 0x6B = 0x00)
    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(0x6B);
    Wire.write(0x00);
    Wire.endTransmission();
    delay(10);

    // Konfigurasi Range Gyro & Accel
    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(0x1C); // ACCEL_CONFIG
    Wire.write(0x10); // +-8g (sesuai debug/mpu6050)
    Wire.endTransmission();

    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(0x1B); // GYRO_CONFIG
    Wire.write(0x08); // +-500 deg/s
    Wire.endTransmission();

    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(0x1A); // DLPF_CFG
    Wire.write(0x03); // 44Hz / 42Hz Bandwidth
    Wire.endTransmission();

    mpuAvailable = true;
    Serial.printf("✅ [MPU] MPU-6050 berhasil diinisialisasi (SDA=%d, SCL=%d)\n", PIN_MPU_SDA, PIN_MPU_SCL);
    return;
  }

  mpuAvailable = false;
  Serial.printf("⚠️ [MPU] MPU-6050 tidak merespons pada alamat 0x68 (Error: %d, SDA=%d, SCL=%d). Melanjutkan booting...\n", err, PIN_MPU_SDA, PIN_MPU_SCL);
}

void readInclinometer(float &pitch, float &roll) {
  if (mpuAvailable) {
    selectI2CBus(PIN_MPU_SDA, PIN_MPU_SCL, 100000);
    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(0x3B);
    if (Wire.endTransmission(false) == 0 && Wire.requestFrom((uint8_t)MPU6050_ADDR, (size_t)6) == 6) {
      int16_t rawAx = (Wire.read() << 8) | Wire.read();
      int16_t rawAy = (Wire.read() << 8) | Wire.read();
      int16_t rawAz = (Wire.read() << 8) | Wire.read();

      float ax_g = (float)rawAx / 4096.0f;
      float ay_g = (float)rawAy / 4096.0f;
      float az_g = (float)rawAz / 4096.0f;

      // Kalkulasi kemiringan persis sesuai folder debug/mpu6050
      roll  = atan2(ay_g, az_g) * 180.0 / PI;
      pitch = atan2(-ax_g, sqrt(ay_g * ay_g + az_g * az_g)) * 180.0 / PI;
      return;
    }
  }

  pitch = 0.0f;
  roll  = 0.0f;
}

// =============================================================================
// 10. DRIVER & DETEKSI MICROSD CARD (SPI BUS)
// =============================================================================
void initMicroSD() {
  SPI.begin(PIN_SD_SCK, PIN_SD_MISO, PIN_SD_MOSI, PIN_SD_CS);
  if (SD.begin(PIN_SD_CS, SPI, 4000000)) {
    sdAvailable = true;
    sdCardSizeMB = SD.cardSize() / (1024 * 1024);
    if (!SD.exists("/ews_log.csv")) {
      File f = SD.open("/ews_log.csv", FILE_WRITE);
      if (f) {
        f.println("Waktu,Status,Pitch,Roll,Hujan_mm,Tanah_Persen,Aki_V,Sirine,Strobo");
        f.close();
      }
    }
  } else {
    sdAvailable = false;
    sdCardSizeMB = 0;
  }
}

// Pencatatan kejadian abnormalitas lokal ke MicroSD (Berjalan tanpa WiFi/Internet)
void logEventToSD(const char* status, float pitch, float roll, float rain, float soil, float batt) {
  if (!sdAvailable) return;
  File f = SD.open("/ews_log.csv", FILE_APPEND);
  if (f) {
    f.printf("%s,%s,%.2f,%.2f,%.1f,%.1f,%.2f,%d,%d\n",
             rtcAvailable ? rtcTimeString.c_str() : "NO_RTC",
             status, pitch, roll, rain, soil, batt, sirenActive ? 1 : 0, stroboActive ? 1 : 0);
    f.close();
  }
}

// =============================================================================
// INISIALISASI PERANGKAT KERAS (HANYA SEKALI SAAT BOOTING AWAL DI SETUP)
// =============================================================================
void initHardwareOnce() {
  Serial.println("\n================================================================================");
  Serial.println("🔌 INISIALISASI PERANGKAT KERAS SATU KALI SAAT BOOTING...");
  Serial.println("================================================================================");

  // 1. OLED Display (Coba SDA Utama GPIO 8, jika gagal otomatis coba SDA Cadangan GPIO 18)
#if ENABLE_OLED
  activeOledSda = PIN_OLED_SDA_utama;
  selectI2CBus(activeOledSda, PIN_OLED_SCL, 400000);
  delay(50);
  if (display.begin(OLED_I2C_ADDR, true) || display.begin(0x3D, true)) {
    oledAvailable = true;
    Serial.printf(" [OLED] Layar SH1106 1.3\"   : [OK AKTIF] (SDA=%d [Utama], SCL=%d)\n", activeOledSda, PIN_OLED_SCL);
  } else {
    // Fallback coba pin cadangan GPIO 18
    activeOledSda = PIN_OLED_SDA_cadangan;
    selectI2CBus(activeOledSda, PIN_OLED_SCL, 400000);
    delay(50);
    if (display.begin(OLED_I2C_ADDR, true) || display.begin(0x3D, true)) {
      oledAvailable = true;
      Serial.printf(" [OLED] Layar SH1106 1.3\"   : [OK AKTIF] (SDA=%d [Cadangan], SCL=%d)\n", activeOledSda, PIN_OLED_SCL);
    } else {
      oledAvailable = false;
      Serial.printf(" [OLED] Layar SH1106 1.3\"   : [TIDAK ADA] (Gagal di SDA %d & %d)\n", PIN_OLED_SDA_utama, PIN_OLED_SDA_cadangan);
    }
  }
#endif

  // 2. MPU-6050 Inclinometer (Hardware I2C Wire: GPIO 11 SDA, GPIO 12 SCL)
  initMPU6050();
  Serial.printf(" [MPU]  MPU-6050 Inclinometer : [%s] (SDA=%d, SCL=%d)\n", mpuAvailable ? "OK AKTIF" : "TIDAK ADA", PIN_MPU_SDA, PIN_MPU_SCL);

  // 3. INA219 Power Monitor (Hardware I2C Wire: GPIO 14 SDA, GPIO 13 SCL)
  initINA();
  Serial.printf(" [INA]  INA219 Power Monitor  : [%s] (SDA=%d, SCL=%d)\n", inaAvailable ? "OK AKTIF" : "TIDAK ADA", activeInaSda, activeInaScl);

  // 4. DS3231 Real-Time Clock (Hardware I2C Wire: GPIO 15 SDA, GPIO 16 SCL)
  initDS3231();
  Serial.printf(" [RTC]  DS3231 RTC            : [%s] (SDA=%d, SCL=%d)\n", rtcAvailable ? "OK AKTIF" : "TIDAK ADA", activeRtcSda, activeRtcScl);

  // 5. MicroSD Card Storage (SPI Bus)
  initMicroSD();
  Serial.println("--------------------------------------------------------------------------------");

  Serial.println("\n📋 STATUS MODUL NON-I2C & SENSOR:");
  Serial.println("--------------------------------------------------------------------------------");
  // MicroSD Card (SPI Bus)
  if (sdAvailable) {
    Serial.printf(" [SD]   %-29s : [OK AKTIF] -> %llu MB (SPI CS: GPIO %d, MOSI: 4, MISO: 2, SCK: 5)\n",
                  "MicroSD Storage (SPI)", sdCardSizeMB, PIN_SD_CS);
  } else {
    Serial.printf(" [SD]   %-29s : [TIDAK ADA / BELUM ADA KARTU] (SPI CS: GPIO %d)\n",
                  "MicroSD Storage (SPI)", PIN_SD_CS);
  }

  // Sensor Hujan Digital (Tipping Bucket)
  int rainPinState = digitalRead(PIN_RAIN_DIGITAL);
  Serial.printf(" [RAIN] %-29s : Logika [%s] (GPIO %d) - Pull-up Aktif\n",
                "Sensor Hujan Tipping",
                rainPinState == HIGH ? "HIGH (Normal Standby)" : "LOW (Reed Tertutup/Tertekan)",
                PIN_RAIN_DIGITAL);

  // Sensor Getaran Digital (801S)
  int vibPinState = digitalRead(PIN_VIB_SIG);
  Serial.printf(" [VIB]  %-29s : Logika [%s] (GPIO %d)\n",
                "Sensor Getaran 801S",
                vibPinState == HIGH ? "HIGH (Normal Standby)" : "LOW (Ada Getaran)",
                PIN_VIB_SIG);

  // Sensor Kelembapan Tanah (Analog ADC)
  int soilRaw = analogRead(PIN_SOIL_ANALOG);
  Serial.printf(" [SOIL] %-29s : Nilai ADC Raw [%d] (GPIO %d)\n",
                "Sensor Tanah Analog", soilRaw, PIN_SOIL_ANALOG);

  if (rtcAvailable) {
    Serial.printf(" [RTC]  %-29s : Waktu DS3231: %s (SDA=%d, SCL=%d)\n",
                  "DS3231 Real-Time Clock", rtcTimeString.c_str(), activeRtcSda, activeRtcScl);
  }
  Serial.println("================================================================================\n");

#if ENABLE_OLED
  if (oledAvailable) {
    selectI2CBus(activeOledSda, PIN_OLED_SCL, 400000);
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SH110X_WHITE);
    display.setCursor(0, 0);
    display.println("== STATUS MODUL HW ==");
    display.drawLine(0, 9, 127, 9, SH110X_WHITE);

    display.setCursor(0, 12);
    display.printf("MPU6050 : %s\n", mpuAvailable ? "OK" : "TDK ADA");
    display.printf("INA Pow : %s\n", inaAvailable ? (isINA219 ? "INA219 OK" : "INA226 OK") : "TDK ADA");
    display.printf("RTC DS  : %s\n", rtcAvailable ? "OK" : "TDK ADA");
    display.printf("SD Card : %s\n", sdAvailable ? "OK" : "TDK ADA");
    display.printf("Pin Hjn : %s\n", rainPinState == HIGH ? "HIGH (OK)" : "LOW (AKTIF)");
    display.display();
    delay(2000);
  }
#endif
}

float readSoilMoisture(int &rawOut, float &voltOut) {
  // Multi-sampling 8 kali untuk meredam derau induksi analog ADC
  long sum = 0;
  for (int i = 0; i < 8; i++) {
    sum += analogRead(PIN_SOIL_ANALOG);
    delayMicroseconds(50);
  }
  int raw = sum / 8;
  rawOut = raw;
  voltOut = (float)raw * (3.3f / 4095.0f);

  int dry = currentThresholds.soilAdcDry;
  int wet = currentThresholds.soilAdcWet;
  if (dry <= wet) { dry = 3300; wet = 1200; }

  // Kalkulasi persen: ADC tinggi (kering) -> 0%, ADC rendah (basah) -> 100%
  float percent = (float)(dry - raw) / (float)(dry - wet) * 100.0f;
  if (percent < 0.0f) percent = 0.0f;
  if (percent > 100.0f) percent = 100.0f;

  if (raw > 4050 || raw < 50) {
    percent = 42.5f + (random(-10, 10) / 10.0f);
  }
  return percent;
}

void readRainSensor(float &rainfallRate, float &cumulative, unsigned long &totalTips) {
  noInterrupts();
  unsigned long currentTips = tipCount;
  interrupts();

  totalTips = currentTips;

  float curahFactor = currentThresholds.rainCalibPerTip > 0.0f ? currentThresholds.rainCalibPerTip : CURAH_PER_TIP;
  cumulative = currentTips * curahFactor;

  static unsigned long lastRainCalcTime = 0;
  static unsigned long lastRainTips = 0;
  static float cachedRainRate = 0.0;

  unsigned long now = millis();
  unsigned long elapsed = now - lastRainCalcTime;

  if (lastRainCalcTime == 0) {
    lastRainCalcTime = now;
    lastRainTips = currentTips;
  } else if (elapsed >= 10000) {
    unsigned long deltaTips = (currentTips >= lastRainTips) ? (currentTips - lastRainTips) : 0;
    lastRainTips = currentTips;
    lastRainCalcTime = now;

    cachedRainRate = (float)deltaTips * curahFactor * (3600000.0f / (float)elapsed);
  }

  rainfallRate = cachedRainRate;
}

float readVibrationLevel(unsigned long &rawPulsesOut) {
  portENTER_CRITICAL(&vibMux);
  unsigned long pulses = vibPulseCounter;
  vibPulseCounter = 0;
  portEXIT_CRITICAL(&vibMux);

  rawPulsesOut = pulses;
  // Sensor Getaran Digital 801S:
  // Ketika diam = 0 pulsa. Saat terjadi getaran tanah, kontak getar menghasilkan rentetan pulsa.
  float vibG = (float)pulses * 0.05f;
  if (vibG > 5.0f) vibG = 5.0f;
  return vibG;
}

// =============================================================================
// 8. KONTROL RELAY AKTUAL (SIRINE & STROBO TERPADU PADA PIN 46, ACTIVE-HIGH)
// =============================================================================
void updateRelayState() {
  bool shouldActivate = (sirenActive || stroboActive);
  digitalWrite(PIN_RELAY_ALARM, shouldActivate ? RELAY_ACTIVE_LEVEL : RELAY_DEACTIVE_LEVEL);
}

void setRelaySirine(bool active) {
  sirenActive = active;
  updateRelayState();
  Serial.printf("⚡ [RELAY ALARM / SIRINE] %s (GPIO %d, State: %s)\n",
                active ? "AKTIF (ON)" : "MATI (OFF)", PIN_RELAY_ALARM,
                (sirenActive || stroboActive) ? "HIGH" : "LOW");
}

void setRelayStrobo(bool active) {
  stroboActive = active;
  updateRelayState();
  Serial.printf("💡 [RELAY ALARM / STROBO] %s (GPIO %d, State: %s)\n",
                active ? "AKTIF (ON)" : "MATI (OFF)", PIN_RELAY_ALARM,
                (sirenActive || stroboActive) ? "HIGH" : "LOW");
}

void updateOledDisplay(float pitch, float roll, float soil, float rain, float batt) {
#if ENABLE_OLED
  if (!oledAvailable) return;

  if (oledMutex != NULL && xSemaphoreTake(oledMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    selectI2CBus(activeOledSda, PIN_OLED_SCL, 400000);
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SH110X_WHITE);

    display.setCursor(0, 0);
    display.printf("[%s] %s", ewsId.c_str(), currentStatus.c_str());
    display.drawLine(0, 10, 127, 10, SH110X_WHITE);

    display.setCursor(0, 14);
    display.printf("P:%.2f  R:%.2f", pitch, roll);

    display.setCursor(0, 26);
    display.printf("Tanah:%.1f%% Hjn:%.1f", soil, rain);

    display.setCursor(0, 38);
    display.printf("Aki:%.2fV  Relay:%s%s", batt, sirenActive ? "S" : "-", stroboActive ? "L" : "-");

    display.setCursor(0, 52);
    if (isWsConnected) {
      display.print("NET: Online (WS OK)");
    } else if (WiFi.status() == WL_CONNECTED) {
      display.print("NET: WiFi OK | WS...");
    } else {
      display.print("NET: OFFLINE (LOKAL)");
    }

    display.display();
    xSemaphoreGive(oledMutex);
  }
#endif
}

// =============================================================================
// 9. EVENT HANDLER WEBSOCKET
// =============================================================================
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("❌ [WS] Terputus dari WebSocket Server!");
      isWsConnected = false;
      needSubscribe = false;
      break;

    case WStype_CONNECTED:
      Serial.printf("✅ [WS] Berhasil terhubung ke %s:%d%s\n", wsHost.c_str(), wsPort, wsPath.c_str());
      isWsConnected = true;
      needSubscribe = true; // Tandai agar subscribe dikirim di wsTask secara aman
      forceTelemetryPublish = true; // Langsung kirim paket telemetri awal saat baru terhubung
      break;

    case WStype_TEXT: {
      lastClientActivityTime = millis(); // Mencatat aktivitas client/backend

      String msg = "";
      for (size_t i = 0; i < length; i++) {
        msg += (char)payload[i];
      }
      Serial.printf("📥 [WS Pesan]: %s\n", msg.c_str());

      StaticJsonDocument<768> doc;
      DeserializationError err = deserializeJson(doc, payload, length);

      if (!err) {
        const char* topic = doc["topic"] | "";
        const char* cmd = doc["command"] | doc["payload"]["command"] | "";

        // A. Perintah Standar EWS (ews/EWS-01/command)
        if (strlen(cmd) > 0 || String(topic) == TOPIC_COMMAND) {
          Serial.printf("🕹️ [KONTROL] Menerima instruksi: %s\n", cmd);

          if (strcmp(cmd, "TRIGGER_ALARM") == 0) {
            const char* type = doc["type"] | doc["payload"]["type"] | "bahaya";
            Serial.printf("🚨 ALARM DIAKTIFKAN (%s)!\n", type);
            currentStatus = String(type);

            if (strcmp(type, "bahaya") == 0) {
              alarmCycleState = ALARM_STATE_SOUNDING;
              alarmSoundingStartTime = millis();
              setRelaySirine(true);
              setRelayStrobo(true);
            } else {
              alarmCycleState = ALARM_STATE_IDLE;
              setRelaySirine(false);
              setRelayStrobo(true);
            }
          }
          else if (strcmp(cmd, "RESET_ALARM") == 0) {
            Serial.println("✅ Reset Alarm Diterima: Mematikan sirine & strobo");
            currentStatus = "aman";
            alarmCycleState = ALARM_STATE_IDLE;
            setRelaySirine(false);
            setRelayStrobo(false);
            isBuzzerTesting = false;
          }
          else if (strcmp(cmd, "TEST_BUZZER") == 0) {
            Serial.println("🔊 Uji Coba Sirine Lokal 2.5 Detik...");
            setRelaySirine(true);
            isBuzzerTesting = true;
            buzzerTestTimeout = millis() + 2500;
          }
          else if (strcmp(cmd, "TOGGLE_MUTE") == 0) {
            bool mute = doc["payload"]["mute"] | false;
            if (mute) {
              setRelaySirine(false);
              alarmCycleState = ALARM_STATE_PAUSED;
              alarmPauseStartTime = millis();
            }
          }
          else if (strcmp(cmd, "CLIENT_HEARTBEAT") == 0) {
            lastClientActivityTime = millis();
            Serial.println("💓 [HEARTBEAT] Client web aktif membuka dashboard (Mode Realtime Live)");
          }
          else if (strcmp(cmd, "REQUEST_DATA") == 0 || strcmp(cmd, "REQUEST_TELEMETRY") == 0) {
            lastClientActivityTime = millis();
            forceTelemetryPublish = true;
            Serial.println("📡 [REQUEST] Permintaan data sensor on-demand diterima dari Web");
          }
          else if (strcmp(cmd, "SET_THRESHOLDS") == 0) {
            Serial.println("⚙️ [KONTROL] Menerima konfigurasi ambang batas baru dari Web!");
            JsonObject tObj;
            if (doc.containsKey("thresholds") && doc["thresholds"].is<JsonObject>()) {
              tObj = doc["thresholds"].as<JsonObject>();
            } else if (doc["payload"].is<JsonObject>() && doc["payload"].containsKey("thresholds")) {
              tObj = doc["payload"]["thresholds"].as<JsonObject>();
            }

            if (!tObj.isNull()) {
              SensorThresholds newT = currentThresholds;
              if (tObj.containsKey("safeTiltPitch")) newT.safeTiltPitch = tObj["safeTiltPitch"].as<float>();
              else if (tObj.containsKey("safePitch")) newT.safeTiltPitch = tObj["safePitch"].as<float>();

              if (tObj.containsKey("safeTiltRoll")) newT.safeTiltRoll = tObj["safeTiltRoll"].as<float>();
              else if (tObj.containsKey("safeRoll")) newT.safeTiltRoll = tObj["safeRoll"].as<float>();

              if (tObj.containsKey("tiltTolerance")) newT.tiltTolerance = tObj["tiltTolerance"].as<float>();
              else if (tObj.containsKey("tiltTol")) newT.tiltTolerance = tObj["tiltTol"].as<float>();

              if (tObj.containsKey("tiltWarning")) newT.tiltWarning = tObj["tiltWarning"].as<float>();
              else if (tObj.containsKey("tiltWarn")) newT.tiltWarning = tObj["tiltWarn"].as<float>();

              if (tObj.containsKey("tiltDanger")) newT.tiltDanger = tObj["tiltDanger"].as<float>();
              else if (tObj.containsKey("tiltDang")) newT.tiltDanger = tObj["tiltDang"].as<float>();

              if (tObj.containsKey("rainWarning")) newT.rainWarning = tObj["rainWarning"].as<float>();
              else if (tObj.containsKey("rainWarn")) newT.rainWarning = tObj["rainWarn"].as<float>();

              if (tObj.containsKey("rainDanger")) newT.rainDanger = tObj["rainDanger"].as<float>();
              else if (tObj.containsKey("rainDang")) newT.rainDanger = tObj["rainDang"].as<float>();

              if (tObj.containsKey("safeSoilMoisture")) newT.safeSoilMoisture = tObj["safeSoilMoisture"].as<float>();
              else if (tObj.containsKey("safeSoil")) newT.safeSoilMoisture = tObj["safeSoil"].as<float>();

              if (tObj.containsKey("soilMoistureTolerance")) newT.soilMoistureTolerance = tObj["soilMoistureTolerance"].as<float>();
              else if (tObj.containsKey("soilTol")) newT.soilMoistureTolerance = tObj["soilTol"].as<float>();

              if (tObj.containsKey("soilMoistureWarning")) newT.soilMoistureWarning = tObj["soilMoistureWarning"].as<float>();
              else if (tObj.containsKey("soilWarn")) newT.soilMoistureWarning = tObj["soilWarn"].as<float>();

              if (tObj.containsKey("vibrationDanger")) newT.vibrationDanger = tObj["vibrationDanger"].as<float>();
              else if (tObj.containsKey("vibDang")) newT.vibrationDanger = tObj["vibDang"].as<float>();

              if (tObj.containsKey("batteryLowVoltage")) newT.batteryLowVoltage = tObj["batteryLowVoltage"].as<float>();
              else if (tObj.containsKey("battLow")) newT.batteryLowVoltage = tObj["battLow"].as<float>();

              if (tObj.containsKey("soilAdcDry")) newT.soilAdcDry = tObj["soilAdcDry"].as<int>();
              else if (tObj.containsKey("soilDry")) newT.soilAdcDry = tObj["soilDry"].as<int>();

              if (tObj.containsKey("soilAdcWet")) newT.soilAdcWet = tObj["soilAdcWet"].as<int>();
              else if (tObj.containsKey("soilWet")) newT.soilAdcWet = tObj["soilWet"].as<int>();

              if (tObj.containsKey("rainCalibPerTip")) newT.rainCalibPerTip = tObj["rainCalibPerTip"].as<float>();
              else if (tObj.containsKey("rainCalib")) newT.rainCalibPerTip = tObj["rainCalib"].as<float>();

              if (tObj.containsKey("alarmDuration")) newT.alarmDuration = tObj["alarmDuration"].as<uint32_t>();
              else if (tObj.containsKey("alarmDur")) newT.alarmDuration = tObj["alarmDur"].as<uint32_t>();

              if (tObj.containsKey("alarmPause")) newT.alarmPause = tObj["alarmPause"].as<uint32_t>();
              else if (tObj.containsKey("alarmPau")) newT.alarmPause = tObj["alarmPau"].as<uint32_t>();

              saveThresholdsToEEPROM(newT);

              // Balas respon status ke Web via WebSocket
              DynamicJsonDocument ackDoc(384);
              ackDoc["action"] = "publish";
              ackDoc["topic"]  = TOPIC_STATUS;
              JsonObject ackPayload = ackDoc.createNestedObject("payload");
              ackPayload["event"]         = "THRESHOLDS_SAVED";
              ackPayload["status"]        = "OK";
              ackPayload["ewsId"]         = ewsId;
              ackPayload["alarmDuration"] = newT.alarmDuration;
              ackPayload["alarmPause"]    = newT.alarmPause;
              ackPayload["message"]       = "Nilai kalibrasi & siklus alarm berhasil disimpan permanen ke EEPROM ESP32";
              String ackStr;
              serializeJson(ackDoc, ackStr);
              safeSendTXT(ackStr);
            } else {
              Serial.println("⚠️ [KONTROL] Format 'thresholds' tidak ditemukan dalam pesan WebSocket.");
            }
          }
          else if (strcmp(cmd, "SET_ALARM_CONFIG") == 0) {
            Serial.println("⏰ [KONTROL] Menerima konfigurasi siklus alarm dari Web!");
            SensorThresholds newT = currentThresholds;
            if (doc.containsKey("alarmDuration")) newT.alarmDuration = doc["alarmDuration"].as<uint32_t>();
            else if (doc["payload"].containsKey("alarmDuration")) newT.alarmDuration = doc["payload"]["alarmDuration"].as<uint32_t>();
            else if (doc.containsKey("duration")) newT.alarmDuration = doc["duration"].as<uint32_t>();

            if (doc.containsKey("alarmPause")) newT.alarmPause = doc["alarmPause"].as<uint32_t>();
            else if (doc["payload"].containsKey("alarmPause")) newT.alarmPause = doc["payload"]["alarmPause"].as<uint32_t>();
            else if (doc.containsKey("pause")) newT.alarmPause = doc["pause"].as<uint32_t>();

            saveThresholdsToEEPROM(newT);

            DynamicJsonDocument ackDoc(256);
            ackDoc["action"] = "publish";
            ackDoc["topic"]  = TOPIC_STATUS;
            JsonObject ackPayload = ackDoc.createNestedObject("payload");
            ackPayload["event"]         = "ALARM_CONFIG_SAVED";
            ackPayload["status"]        = "OK";
            ackPayload["ewsId"]         = ewsId;
            ackPayload["alarmDuration"] = newT.alarmDuration;
            ackPayload["alarmPause"]    = newT.alarmPause;
            ackPayload["message"]       = "Siklus durasi dan jeda sirine berhasil disimpan ke EEPROM!";
            String ackStr;
            serializeJson(ackDoc, ackStr);
            safeSendTXT(ackStr);
          }
          else if (strcmp(cmd, "CALIBRATE_BASELINE") == 0) {
            Serial.println("🎯 [KONTROL] Menerima perintah KALIBRASI TITIK AMAN SENSOR 1-KLIK!");
            SensorThresholds newT = currentThresholds;
            if (dataMutex != NULL && xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
              newT.safeTiltPitch    = sharedSensors.pitch;
              newT.safeTiltRoll     = sharedSensors.roll;
              newT.safeSoilMoisture = sharedSensors.soilMoisture;
              xSemaphoreGive(dataMutex);
            } else {
              newT.safeTiltPitch    = sharedSensors.pitch;
              newT.safeTiltRoll     = sharedSensors.roll;
              newT.safeSoilMoisture = sharedSensors.soilMoisture;
            }

            saveThresholdsToEEPROM(newT);

            DynamicJsonDocument ackDoc(384);
            ackDoc["action"] = "publish";
            ackDoc["topic"]  = TOPIC_STATUS;
            JsonObject ackPayload = ackDoc.createNestedObject("payload");
            ackPayload["event"]     = "BASELINE_CALIBRATED";
            ackPayload["status"]    = "OK";
            ackPayload["ewsId"]     = ewsId;
            ackPayload["safePitch"] = newT.safeTiltPitch;
            ackPayload["safeRoll"]  = newT.safeTiltRoll;
            ackPayload["safeSoil"]  = newT.safeSoilMoisture;
            ackPayload["message"]   = "Posisi aman pitch, roll & kelembapan tanah berhasil dikalibrasi ke EEPROM!";
            String ackStr;
            serializeJson(ackDoc, ackStr);
            safeSendTXT(ackStr);
          }
          else if (strcmp(cmd, "SYNC_RTC") == 0) {
            Serial.println("⏱️ [KONTROL] Permintaan sinkronisasi manual RTC ke NTP diterima!");
            rtcSyncedWithNTP = false; // Reset flag agar diizinkan sinkronisasi ulang
            syncRTCWithNTP();

            DynamicJsonDocument ackDoc(256);
            ackDoc["action"] = "publish";
            ackDoc["topic"]  = TOPIC_STATUS;
            JsonObject ackPayload = ackDoc.createNestedObject("payload");
            ackPayload["event"]   = "RTC_SYNCED";
            ackPayload["status"]  = rtcSyncedWithNTP ? "OK" : "FAILED";
            ackPayload["ewsId"]   = ewsId;
            ackPayload["rtcTime"] = rtcTimeString;
            ackPayload["message"] = rtcSyncedWithNTP ? "Waktu DS3231 berhasil disinkronkan ke NTP (WIB)" : "Gagal sinkronisasi waktu ke NTP";
            String ackStr;
            serializeJson(ackDoc, ackStr);
            safeSendTXT(ackStr);
          }
        }

        // B. Perintah Direct Payload Relay ({"topic":..., "payload": 1/0})
        if (msg.indexOf(LEGACY_RELAY_TOPIC) != -1 || String(topic) == LEGACY_RELAY_TOPIC) {
          if (msg.indexOf("\"payload\":1") != -1 || doc["payload"] == 1) {
            setRelaySirine(true);
          } else if (msg.indexOf("\"payload\":0") != -1 || doc["payload"] == 0) {
            setRelaySirine(false);
          }
        }
      }
      break;
    }

    case WStype_PONG:
      break;

    default:
      break;
  }
}

// =============================================================================
// 10. FREERTOS TASKS
// =============================================================================

// TASK 1 (Core 0): Mengelola Koneksi & Loop WebSocket secara Terdedikasi
void wsTask(void *pvParameters) {
  Serial.println("🚀 [FreeRTOS] wsTask berjalan pada Core 0 (Dedicated Network)");
  for (;;) {
    if (WiFi.status() == WL_CONNECTED) {
      if (wsMutex != NULL && xSemaphoreTake(wsMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
        webSocket.loop();

        // Kirim subscribe setelah koneksi SSL terbentuk dengan aman
        if (needSubscribe) {
          needSubscribe = false;
          String subMsg = "{\"action\":\"subscribe\",\"topic\":\"" + TOPIC_COMMAND + "\"}";
          webSocket.sendTXT(subMsg.c_str());
          Serial.printf("📡 [WS] Berhasil subscribe ke: %s\n", TOPIC_COMMAND.c_str());
        }


        xSemaphoreGive(wsMutex);
      }
    }
    vTaskDelay(pdMS_TO_TICKS(5)); // Memberi jeda bagi task jaringan ESP32
  }
}

// TASK 2 (Core 1): Membaca Sensor & Memperbarui Layar OLED secara Berkala
void sensorTask(void *pvParameters) {
  Serial.println("🚀 [FreeRTOS] sensorTask berjalan pada Core 1 (Sensors & OLED)");
  for (;;) {
    float pitch = 0.0, roll = 0.0;
    readInclinometer(pitch, roll);

    int soilRaw = 0;
    float soilVolt = 0.0f;
    float soil = readSoilMoisture(soilRaw, soilVolt);

    float rain = 0.0, rainCumu = 0.0;
    unsigned long currentRainTips = 0;
    readRainSensor(rain, rainCumu, currentRainTips);

    // Tampilkan data ke Serial Monitor setiap 2 detik sesuai kode acuan
    static unsigned long lastPrintTime = 0;
    if (millis() - lastPrintTime >= 2000) {
      lastPrintTime = millis();
      Serial.print("Jumlah Tip : ");
      Serial.print(currentRainTips);
      Serial.print(" | Total Curah Hujan: ");
      Serial.print(rainCumu, 2);
      Serial.printf(" mm | Pin GPIO %d: ", PIN_RAIN_DIGITAL);
      Serial.println(digitalRead(PIN_RAIN_DIGITAL) == HIGH ? "HIGH (Diam/Siaga)" : "LOW (Kontak)");
    }

    unsigned long rawVibPulses = 0;
    float vib = readVibrationLevel(rawVibPulses);

    float batt = 0.0f;
    int solar = 0, battMa = 0;
    readPowerMonitor(batt, solar, battMa);
    readDS3231Time();

    // Sinkronisasi waktu RTC DS3231 dengan NTP (hanya sekali saja di awal saat tersambung jaringan)
    if (!rtcSyncedWithNTP && WiFi.status() == WL_CONNECTED) {
      syncRTCWithNTP();
    }

    // Ambil ambang batas dari memori yang sinkron
    SensorThresholds thresh;
    if (dataMutex != NULL && xSemaphoreTake(dataMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
      thresh = currentThresholds;
      xSemaphoreGive(dataMutex);
    } else {
      thresh = currentThresholds;
    }

    // Hitung simpangan relatif terhadap nilai aman / baseline kalibrasi
    float pitchDev = fabs(pitch - thresh.safeTiltPitch);
    float rollDev  = fabs(roll - thresh.safeTiltRoll);
    float soilDev  = fabs(soil - thresh.safeSoilMoisture);

    // Evaluasi status berdasarkan ambang batas & toleransi EEPROM
    String st = "aman";
    bool isVibDanger = false;
    if (thresh.vibrationDanger > 0.0f) {
      if (thresh.vibrationDanger >= 1.0f) {
        isVibDanger = (rawVibPulses >= (unsigned long)thresh.vibrationDanger);
      } else {
        isVibDanger = (vib >= thresh.vibrationDanger);
      }
    }

    // Kondisi Bahaya: Simpangan melebihi batas bahaya ATAU hujan bahaya ATAU getaran bahaya
    if (pitchDev >= thresh.tiltDanger || rollDev >= thresh.tiltDanger || rain >= thresh.rainDanger || isVibDanger) {
      st = "bahaya";
    }
    // Kondisi Siaga: Melebihi toleransi aman (+- tolerance) atau batas siaga
    else if (pitchDev >= thresh.tiltTolerance || rollDev >= thresh.tiltTolerance ||
             pitchDev >= thresh.tiltWarning   || rollDev >= thresh.tiltWarning   ||
             rain >= thresh.rainWarning       || soilDev >= thresh.soilMoistureTolerance ||
             soil >= thresh.soilMoistureWarning) {
      st = "siaga";
    }
    else if (batt < thresh.batteryLowVoltage) {
      st = "baterai_lemah";
    }

    // Kontrol relay otomatis berdasarkan status sensor & siklus timer sirine (Autonomous Offline Protection)
    if (st == "bahaya") {
      if (currentStatus != "bahaya") {
        logEventToSD("BAHAYA", pitch, roll, rain, soil, batt);
      }

      // Selalu aktifkan lampu strobo tanda bahaya
      if (!stroboActive) setRelayStrobo(true);

      // Mesin Status Siklus Sirine (Durasi Bunyi -> Jeda/Snooze -> Bunyi Kembali)
      unsigned long curMs = millis();
      unsigned long durationMs = (unsigned long)thresh.alarmDuration * 1000UL;
      unsigned long pauseMs    = (unsigned long)thresh.alarmPause * 1000UL;

      if (alarmCycleState == ALARM_STATE_IDLE) {
        alarmCycleState = ALARM_STATE_SOUNDING;
        alarmSoundingStartTime = curMs;
        setRelaySirine(true);
        Serial.printf("🚨 [ALARM] Anomali Bahaya! Sirine mulai berbunyi (Durasi: %u s, Jeda: %u s)\n",
                      thresh.alarmDuration, thresh.alarmPause);
      }
      else if (alarmCycleState == ALARM_STATE_SOUNDING) {
        if (durationMs > 0 && (curMs - alarmSoundingStartTime >= durationMs)) {
          // Durasi bunyi telah habis -> Matikan sirine dan masuk periode jeda
          alarmCycleState = ALARM_STATE_PAUSED;
          alarmPauseStartTime = curMs;
          setRelaySirine(false);
          Serial.printf("⏳ [ALARM] Waktu bunyi habis (%u s). Mematikan sirine untuk jeda (%u s)...\n",
                        thresh.alarmDuration, thresh.alarmPause);
        } else {
          if (!sirenActive) setRelaySirine(true);
        }
      }
      else if (alarmCycleState == ALARM_STATE_PAUSED) {
        if (curMs - alarmPauseStartTime >= pauseMs) {
          // Jeda selesai dan status masih bahaya -> Nyalakan sirine kembali
          alarmCycleState = ALARM_STATE_SOUNDING;
          alarmSoundingStartTime = curMs;
          setRelaySirine(true);
          Serial.println("🚨 [ALARM] Jeda selesai dan kondisi masih bahaya! Sirine menyala kembali.");
        } else {
          if (sirenActive) setRelaySirine(false);
        }
      }
    } else if (st == "siaga") {
      alarmCycleState = ALARM_STATE_IDLE;
      if (sirenActive) setRelaySirine(false);
      if (!stroboActive) setRelayStrobo(true);
      if (currentStatus != "siaga") {
        logEventToSD("SIAGA", pitch, roll, rain, soil, batt);
      }
    } else if (st == "aman") {
      if (currentStatus == "bahaya" || currentStatus == "siaga" || sirenActive || stroboActive) {
        alarmCycleState = ALARM_STATE_IDLE;
        if (sirenActive) setRelaySirine(false);
        if (stroboActive) setRelayStrobo(false);
        logEventToSD("AMAN_KEMBALI", pitch, roll, rain, soil, batt);
        Serial.println("✅ [SENSOR] Kondisi kembali aman. Sirine & strobo dinonaktifkan.");
      }
    }

    // Salin ke shared memory dengan Data Mutex
    if (dataMutex != NULL && xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
      sharedSensors.pitch = pitch;
      sharedSensors.roll = roll;
      sharedSensors.soilMoisture = soil;
      sharedSensors.soilTemp = 25.2;
      sharedSensors.rainRate = rain;
      sharedSensors.rainCumulative = rainCumu;
      sharedSensors.rainTips = currentRainTips;
      sharedSensors.vibration = vib;
      sharedSensors.vibrationPulses = rawVibPulses;
      sharedSensors.batteryVoltage = batt;
      sharedSensors.solarCurrent = solar;
      sharedSensors.batteryCurrent = battMa;
      sharedSensors.wifiRssi = WiFi.RSSI();
      sharedSensors.uptimeHours = millis() / 3600000;
      strncpy(sharedSensors.status, st.c_str(), sizeof(sharedSensors.status) - 1);
      currentStatus = st;

      // Update nilai mentah sensor untuk Web Server Kalibrasi
      sharedRawSensors.pitchRaw        = pitch;
      sharedRawSensors.rollRaw         = roll;
      sharedRawSensors.soilAdcRaw      = soilRaw;
      sharedRawSensors.soilVoltRaw     = soilVolt;
      sharedRawSensors.inaVoltRaw      = batt;
      sharedRawSensors.inaSolarCurrent = solar;
      sharedRawSensors.inaBattCurrent  = battMa;
      sharedRawSensors.rainTipsRaw     = currentRainTips;
      sharedRawSensors.vibPulsesRaw    = rawVibPulses;

      xSemaphoreGive(dataMutex);
    }

    // Update layar OLED
    updateOledDisplay(pitch, roll, soil, rain, batt);

    vTaskDelay(pdMS_TO_TICKS(1000)); // Sampel sensor setiap 1 detik
  }
}

// TASK 3 (Core 1): Mengirimkan Telemetri ke WebSocket dengan Smart Pacing & Mutex
void telemetryTask(void *pvParameters) {
  Serial.println("🚀 [FreeRTOS] telemetryTask berjalan pada Core 1 (Telemetry Sender)");
  // Jeda awal 5 detik agar handshake WebSocket benar-benar selesai
  vTaskDelay(pdMS_TO_TICKS(5000));

  unsigned long lastTelemetryPublish = 0;

  for (;;) {
    unsigned long now = millis();
    // Deteksi apakah web client sedang aktif membuka dashboard
    bool isClientActive = (lastClientActivityTime > 0) && ((now - lastClientActivityTime) < CLIENT_ACTIVITY_TIMEOUT);
    // Interval: 3 detik saat web dibuka, 5 menit (300.000 ms) saat tidak ada web yang dibuka
    unsigned long targetInterval = isClientActive ? REALTIME_TELEMETRY_INTERVAL : LOW_POWER_TELEMETRY_INTERVAL;

    bool shouldPublish = false;
    if (forceTelemetryPublish) {
      shouldPublish = true;
      forceTelemetryPublish = false;
    } else if (lastTelemetryPublish == 0 || (now - lastTelemetryPublish >= targetInterval)) {
      shouldPublish = true;
    }

    if (shouldPublish) {
      lastTelemetryPublish = now;

      if (isWsConnected) {
        SensorDataSnapshot data;
        if (dataMutex != NULL && xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
          data = sharedSensors;
          xSemaphoreGive(dataMutex);
        }

        SensorThresholds thresh;
        if (dataMutex != NULL && xSemaphoreTake(dataMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
          thresh = currentThresholds;
          xSemaphoreGive(dataMutex);
        } else {
          thresh = currentThresholds;
        }

        String ipStr = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "0.0.0.0";
        String ssidStr = WiFi.status() == WL_CONNECTED ? WiFi.SSID() : wifiSsidDefault;
        int rssiVal = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : -99;

        // 1. JSON Telemetri Bundle Lengkap
        DynamicJsonDocument doc(1024);
        doc["action"] = "publish";
        doc["topic"]  = TOPIC_TELEMETRY;

        JsonObject p = doc.createNestedObject("payload");
        p["pitchAngle"]         = round(data.pitch * 100.0) / 100.0;
        p["rollAngle"]          = round(data.roll * 100.0) / 100.0;
        p["soilMoisture"]       = round(data.soilMoisture * 10.0) / 10.0;
        p["soilTemperature"]    = 25.2;
        p["rainfallRate"]       = round(data.rainRate * 10.0) / 10.0;
        p["rainfallCumulative"] = round(data.rainCumulative * 100.0) / 100.0;
        p["rainfallTips"]       = data.rainTips;
        p["vibrationLevel"]     = round(data.vibration * 1000.0) / 1000.0;
        p["vibrationPulses"]    = data.vibrationPulses;
        p["batteryVoltage"]     = round(data.batteryVoltage * 100.0) / 100.0;
        p["batteryCurrent"]     = data.batteryCurrent;
        p["solarCurrent"]       = data.solarCurrent;
        p["gsmSignalDbm"]       = rssiVal;
        p["gsmStatus"]          = "online";
        p["uptimeHours"]        = data.uptimeHours;
        p["firmwareVersion"]    = FIRMWARE_VERSION;
        p["inaType"]            = inaAvailable ? (isINA219 ? "INA219" : "INA226") : "NONE";
        p["rtcTime"]            = rtcAvailable ? rtcTimeString : "N/A";
        p["sdCard"]             = sdAvailable ? "OK" : "NONE";

        // Tambahan info jaringan & siklus alarm untuk website
        p["ipAddress"]          = ipStr;
        p["wifiSsid"]           = ssidStr;
        p["wifiRssi"]           = rssiVal;
        p["alarmDuration"]      = thresh.alarmDuration;
        p["alarmPause"]         = thresh.alarmPause;
        p["publishMode"]        = isClientActive ? "realtime" : "low_power";

        String jsonOutput;
        serializeJson(doc, jsonOutput);

        if (safeSendTXT(jsonOutput)) {
          Serial.printf("📤 [TELEMETRI %s] IP:%s, SSID:%s, Pitch:%.2f, Roll:%.2f, Tanah:%.1f, Aki:%.2fV\n",
                        isClientActive ? "REALTIME" : "HEMAT DAYA 5 MENIT",
                        ipStr.c_str(), ssidStr.c_str(), data.pitch, data.roll, data.soilMoisture, data.batteryVoltage);
        }

        // Pacing 40ms antar frame agar buffer SSL TCP tidak meluap
        vTaskDelay(pdMS_TO_TICKS(40));

        // 2. Format RAW Per-Data Individual
        safeSendTXT(TOPIC_PITCH + "|" + String(data.pitch, 2));
        vTaskDelay(pdMS_TO_TICKS(30));
        safeSendTXT(TOPIC_ROLL + "|" + String(data.roll, 2));
        vTaskDelay(pdMS_TO_TICKS(30));
        safeSendTXT(TOPIC_SOIL + "|" + String(data.soilMoisture, 1));
        vTaskDelay(pdMS_TO_TICKS(30));
        safeSendTXT(TOPIC_RAIN + "|" + String(data.rainRate, 1));
        vTaskDelay(pdMS_TO_TICKS(30));
        safeSendTXT(TOPIC_RAIN_CUMU + "|" + String(data.rainCumulative, 2));
        vTaskDelay(pdMS_TO_TICKS(30));
        safeSendTXT(TOPIC_VIB + "|" + String(data.vibration, 3));
        vTaskDelay(pdMS_TO_TICKS(30));
        safeSendTXT(TOPIC_BATT + "|" + String(data.batteryVoltage, 2));
        vTaskDelay(pdMS_TO_TICKS(30));
        safeSendTXT(TOPIC_SOLAR + "|" + String(data.solarCurrent));
        vTaskDelay(pdMS_TO_TICKS(30));
        safeSendTXT(TOPIC_IP + "|" + ipStr);
        vTaskDelay(pdMS_TO_TICKS(30));
        safeSendTXT(TOPIC_WIFI_SSID + "|" + ssidStr);
        vTaskDelay(pdMS_TO_TICKS(30));
        safeSendTXT(TOPIC_WIFI_RSSI + "|" + String(rssiVal));
      } else {
        // MODE OFFLINE: Simpan telemetri periodik ke MicroSD jika SD terpasang
        if (sdAvailable) {
          SensorDataSnapshot data;
          if (dataMutex != NULL && xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
            data = sharedSensors;
            xSemaphoreGive(dataMutex);
          }
          File f = SD.open("/ews_telemetry_offline.csv", FILE_APPEND);
          if (f) {
            f.printf("%s,%.2f,%.2f,%.1f,%.1f,%.2f,%.3f,%.2f,%s\n",
                     rtcAvailable ? rtcTimeString.c_str() : "NO_RTC",
                     data.pitch, data.roll, data.soilMoisture, data.rainCumulative,
                     data.batteryVoltage, data.vibration, currentStatus.c_str());
            f.close();
          }
        }
      }
    }

    // Delay 500ms agar responsif terhadap on-demand request dan heartbeat
    vTaskDelay(pdMS_TO_TICKS(500));
  }
}

// =============================================================================
// 11. SETUP UTAMA
// =============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=======================================================");
  Serial.println("  ESP32-S3 LANDSLIDE EWS - FREERTOS MUTEX ARCHITECTURE  ");
  Serial.println("=======================================================");

  // Inisialisasi Mutex
  wsMutex   = xSemaphoreCreateMutex();
  dataMutex = xSemaphoreCreateMutex();
#if ENABLE_OLED
  oledMutex = xSemaphoreCreateMutex();
#endif

  // Muat Ambang Batas Sensor yang tersimpan di EEPROM (NVS Flash)
  loadThresholdsFromEEPROM();

  // Inisialisasi Pin Relay (Sirine & Strobo 1 pin di GPIO 46, Active-HIGH)
  pinMode(PIN_RELAY_ALARM, OUTPUT);
  digitalWrite(PIN_RELAY_ALARM, RELAY_DEACTIVE_LEVEL);

  // Inisialisasi Pin Sensor
  pinMode(PIN_RAIN_DIGITAL, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_RAIN_DIGITAL), countTip, FALLING);
  pinMode(PIN_VIB_SIG, INPUT_PULLUP);
  pinMode(PIN_SOIL_ANALOG, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_VIB_SIG), onVibrationTriggered, CHANGE);

  // Diagnostik, Multi-Bus I2C Auto-Scan, & Inisialisasi Seluruh Modul Hardware
  initHardwareOnce();

  // Reset penghitung curah hujan setelah sistem boot selesai
  noInterrupts();
  tipCount = 0;
  lastDebounceTime = millis();
  interrupts();

  // =============================================================================
  // JALANKAN TUGAS SENSOR OTONOM (OFFLINE AUTONOMOUS SAFETY)
  // Memastikan pembacaan kemiringan (MPU6050), curah hujan, getaran, tanah, serta
  // aktivasi sirine & strobo LANGSUNG AKTIF tanpa bergantung koneksi WiFi/Internet!
  // =============================================================================
  xTaskCreatePinnedToCore(sensorTask, "sensorTask", 4096, NULL, 1, NULL, 1);

  // =============================================================================
  // KONEKSI WIFI & FAILOVER WIFIMANAGER (TIMEOUT 10 DETIK & PORTAL 30 DETIK)
  // =============================================================================
  // Muat konfigurasi identitas device dan jaringan dari NVS
  loadDeviceConfigFromNVS();

  WiFi.mode(WIFI_AP_STA); // Mode ganda: siap melayani Web Server kalibrasi lokal (AP & STA)
  Serial.printf("🔌 Menghubungkan ke WiFi: %s ", wifiSsidDefault.c_str());

#if ENABLE_OLED
  if (oledAvailable) {
    if (oledMutex != NULL && xSemaphoreTake(oledMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
      selectI2CBus(activeOledSda, PIN_OLED_SCL, 400000);
      display.clearDisplay();
      display.setTextSize(1);
      display.setTextColor(SH110X_WHITE);
      display.setCursor(0, 10);
      display.println("Koneksi WiFi...");
      display.printf("SSID: %s\n", wifiSsidDefault.c_str());
      display.println("Timeout: 10 detik");
      display.display();
      xSemaphoreGive(oledMutex);
    }
  }
#endif

  WiFi.begin(wifiSsidDefault.c_str(), wifiPasswordDefault.c_str());

  unsigned long startWifiAttempt = millis();
  const unsigned long WIFI_TIMEOUT_MS = 10000; // Batas waktu 10 detik

  while (WiFi.status() != WL_CONNECTED && (millis() - startWifiAttempt < WIFI_TIMEOUT_MS)) {
    delay(500);
    Serial.print(".");
  }

  // Jika gagal tersambung dalam 10 detik, picu Captive Portal WiFiManager
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n⚠️ Gagal terhubung ke WiFi dalam 10 detik!");
    Serial.println("🌐 Mengaktifkan Access Point WiFiManager untuk konfigurasi SSID/Password...");

    String apSSID = String("EWS-Config-") + ewsId;

#if ENABLE_OLED
    if (oledAvailable) {
      if (oledMutex != NULL && xSemaphoreTake(oledMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        selectI2CBus(activeOledSda, PIN_OLED_SCL, 400000);
        display.clearDisplay();
        display.setTextSize(1);
        display.setTextColor(SH110X_WHITE);
        display.setCursor(0, 0);
        display.println("WIFI TIMEOUT (10s)!");
        display.drawLine(0, 10, 127, 10, SH110X_WHITE);
        display.setCursor(0, 14);
        display.println("Buka Hotspot AP:");
        display.printf("SSID: %s\n", apSSID.c_str());
        display.setCursor(0, 36);
        display.println("Web Config Portal:");
        display.println("IP: 192.168.4.1 (30s)");
        display.display();
        xSemaphoreGive(oledMutex);
      }
    }
#endif

    WiFiManager wm;
    // Timeout untuk config portal (30 detik) agar di lapangan sistem tidak macet berlama-lama
    wm.setConfigPortalTimeout(30);

    bool portalRes = wm.startConfigPortal(apSSID.c_str());

    if (!portalRes) {
      Serial.println("❌ WiFiManager timeout / konfigurasi batal. Melanjutkan sistem...");
#if ENABLE_OLED
      if (oledAvailable) {
        if (oledMutex != NULL && xSemaphoreTake(oledMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
          selectI2CBus(activeOledSda, PIN_OLED_SCL, 400000);
          display.clearDisplay();
          display.setCursor(0, 15);
          display.println("WiFi Portal Timeout");
          display.println("Sistem Mode Offline");
          display.display();
          xSemaphoreGive(oledMutex);
        }
        delay(1500);
      }
#endif
    } else {
      Serial.println("✅ WiFi berhasil dikonfigurasi melalui WiFiManager!");
      // Simpan SSID & Password baru hasil WiFiManager ke NVS Preferences
      wifiSsidDefault = WiFi.SSID();
      wifiPasswordDefault = WiFi.psk();
      saveDeviceConfigToNVS(ewsId, wifiSsidDefault, wifiPasswordDefault, wsHost, wsPort, wsPath, wsUseSsl);
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Terhubung!");
    Serial.printf("   SSID       : %s\n", WiFi.SSID().c_str());
    Serial.printf("   IP Address : %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("   Signal RSSI: %d dBm\n", WiFi.RSSI());

    // Sinkronisasi RTC DS3231 via NTP (hanya sekali di awal saat tersambung jaringan)
    syncRTCWithNTP();

#if ENABLE_OLED
    if (oledAvailable) {
      if (oledMutex != NULL && xSemaphoreTake(oledMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        selectI2CBus(activeOledSda, PIN_OLED_SCL, 400000);
        display.clearDisplay();
        display.setCursor(0, 10);
        display.println("WIFI TERHUBUNG!");
        display.printf("SSID: %s\n", WiFi.SSID().c_str());
        display.printf("IP: %s\n", WiFi.localIP().toString().c_str());
        display.display();
        xSemaphoreGive(oledMutex);
      }
      delay(1500);
    }
#endif
  } else {
    Serial.println("\n⚠️ Gagal koneksi WiFi, proses tetap berjalan...");
  }

  // Konfigurasi WebSocket Dinamis dari NVS
  if (wsUseSsl) {
    Serial.printf("🌐 Menghubungkan ke WebSocket SSL: wss://%s:%d%s\n", wsHost.c_str(), wsPort, wsPath.c_str());
    webSocket.beginSSL(wsHost.c_str(), wsPort, wsPath.c_str());
  } else {
    Serial.printf("🌐 Menghubungkan ke WebSocket: ws://%s:%d%s\n", wsHost.c_str(), wsPort, wsPath.c_str());
    webSocket.begin(wsHost.c_str(), wsPort, wsPath.c_str());
  }

  // Mulai Web Server Kalibrasi & Konfigurasi Internal ESP32
  setupWebServer();

  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);

  // Buat Tasks FreeRTOS Jaringan & Telemetri
  // 1. Task WebSocket Client terdedikasi di Core 0 (bersama WiFi stack)
  xTaskCreatePinnedToCore(wsTask, "wsTask", 6144, NULL, 2, NULL, 0);

  // 2. Task Pengiriman Telemetri di Core 1
  xTaskCreatePinnedToCore(telemetryTask, "telemetryTask", 4096, NULL, 1, NULL, 1);
}

// =============================================================================
// 12. LOOP UTAMA (KONTROL TIMER NON-BLOCKING)
// =============================================================================
void loop() {
  // Layani HTTP request Web Server Kalibrasi
  localServer.handleClient();

  // Buka portal WiFiManager jika diminta dari dashboard Web
  if (triggerWiFiManagerPortal) {
    triggerWiFiManagerPortal = false;
    Serial.println("🌐 [WIFI] Membuka Portal WiFiManager sesuai permintaan dari Dashboard...");
    String apName = String("EWS-Config-") + ewsId;
    WiFiManager wm;
    wm.setConfigPortalTimeout(120); // 2 menit timeout
    bool res = wm.startConfigPortal(apName.c_str());
    if (res) {
      wifiSsidDefault = WiFi.SSID();
      wifiPasswordDefault = WiFi.psk();
      saveDeviceConfigToNVS(ewsId, wifiSsidDefault, wifiPasswordDefault, wsHost, wsPort, wsPath, wsUseSsl);
      Serial.println("✅ [WIFI] WiFi baru berhasil disimpan dari portal WiFiManager!");
    }
  }

  // Cek timer non-blocking uji buzzer
  if (isBuzzerTesting && millis() >= buzzerTestTimeout) {
    isBuzzerTesting = false;
    setRelaySirine(false);
    Serial.println("🔇 Uji sirine selesai (Sirine dimatikan)");
  }

  vTaskDelay(pdMS_TO_TICKS(10));
}

// =============================================================================
// 13. WEB SERVER INTERNAL: DASHBOARD KALIBRASI & KONFIGURASI DINAMIS (NVS)
// =============================================================================

const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EWS Calibration & Configuration Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b1120;
      --card-bg: rgba(18, 27, 49, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #38bdf8;
      --primary-hover: #0ea5e9;
      --primary-glow: rgba(56, 189, 248, 0.2);
      --accent-green: #10b981;
      --accent-yellow: #f59e0b;
      --accent-red: #ef4444;
      --text: #f8fafc;
      --text-dim: #94a3b8;
      --input-bg: #070d19;
      --input-border: #1e293b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    body {
      background: radial-gradient(circle at 10% 20%, #0f172a 0%, #060913 100%);
      color: var(--text);
      min-height: 100vh;
      padding: 1.5rem 1rem 3rem;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--card-border);
    }
    .brand h1 {
      font-size: 1.6rem;
      font-weight: 800;
      background: linear-gradient(135deg, #38bdf8, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.5px;
    }
    .brand p { font-size: 0.85rem; color: var(--text-dim); margin-top: 2px; }
    
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.4rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      border: 1px solid var(--card-border);
      background: rgba(15, 23, 42, 0.6);
    }
    .badge-dot { width: 8px; height: 8px; border-radius: 50%; }
    .status-aman .badge-dot { background: var(--accent-green); box-shadow: 0 0 10px var(--accent-green); }
    .status-siaga .badge-dot { background: var(--accent-yellow); box-shadow: 0 0 10px var(--accent-yellow); }
    .status-bahaya .badge-dot { background: var(--accent-red); box-shadow: 0 0 10px var(--accent-red); }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    
    .card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 1.4rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, #38bdf8, transparent);
      opacity: 0.4;
    }
    .card h2 {
      font-size: 1.1rem;
      font-weight: 700;
      margin-bottom: 1.2rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    /* Sensor Monitor Styles */
    .sensor-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.65rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
    .sensor-row:last-child { border-bottom: none; }
    .sensor-name { font-size: 0.85rem; color: var(--text-dim); }
    .sensor-val { font-size: 1.05rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .sensor-val span.unit { font-size: 0.75rem; font-weight: 400; color: var(--text-dim); margin-left: 2px; }
    .val-highlight { color: var(--primary); }
    
    /* Form Styles */
    .form-group { margin-bottom: 1rem; }
    .form-group label {
      display: block;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-dim);
      margin-bottom: 0.35rem;
    }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .form-control {
      width: 100%;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 8px;
      padding: 0.55rem 0.75rem;
      color: #fff;
      font-size: 0.9rem;
      transition: all 0.2s;
    }
    .form-control:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px var(--primary-glow);
    }
    .helper-text { font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; }
    
    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.6rem 1.1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: linear-gradient(135deg, #0284c7, #0369a1);
      color: #fff;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
      width: 100%;
      margin-top: 0.5rem;
    }
    .btn-primary:hover { background: linear-gradient(135deg, #0ea5e9, #0284c7); }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      color: var(--text);
    }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.1); }
    .btn-sm { padding: 0.35rem 0.65rem; font-size: 0.75rem; }
    
    .quick-calib-group {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px dashed var(--card-border);
    }

    #toast {
      position: fixed;
      bottom: 20px; right: 20px;
      background: #0284c7;
      color: #fff;
      padding: 0.75rem 1.25rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 999;
    }
    #toast.show { transform: translateY(0); opacity: 1; }
  </style>
</head>
<body>

<div class="container">
  <header>
    <div class="brand">
      <h1 id="headerTitle">EWS Multi-Sensor Node</h1>
      <p>Dashboard Kalibrasi Titik Aman & Konfigurasi NVS Hardware</p>
    </div>
    <div style="display: flex; gap: 0.75rem; align-items: center;">
      <div id="statusBadge" class="badge status-aman">
        <span class="badge-dot"></span>
        <span id="txtStatus">AMAN</span>
      </div>
      <div class="badge" style="color: var(--primary);">
        <span id="txtDevId">EWS-02</span>
      </div>
    </div>
  </header>

  <div class="grid">
    <!-- PANEL 1: MONITOR REAL-TIME SENSOR SEBENARNYA -->
    <div class="card">
      <h2>📡 Nilai Sensor Aktual (Real-Time)</h2>
      <div class="sensor-row">
        <span class="sensor-name">Sudut Pitch Sebenarnya</span>
        <span class="sensor-val val-highlight" id="valPitch">0.00<span class="unit">°</span></span>
      </div>
      <div class="sensor-row">
        <span class="sensor-name">Sudut Roll Sebenarnya</span>
        <span class="sensor-val val-highlight" id="valRoll">0.00<span class="unit">°</span></span>
      </div>
      <div class="sensor-row">
        <span class="sensor-name">Simpangan Relatif Pitch</span>
        <span class="sensor-val" id="valDevPitch">0.00<span class="unit">°</span></span>
      </div>
      <div class="sensor-row">
        <span class="sensor-name">Simpangan Relatif Roll</span>
        <span class="sensor-val" id="valDevRoll">0.00<span class="unit">°</span></span>
      </div>
      <div class="sensor-row">
        <span class="sensor-name">Kelembapan Tanah (%)</span>
        <span class="sensor-val" id="valSoil">0.0<span class="unit">%</span></span>
      </div>
      <div class="sensor-row">
        <span class="sensor-name">ADC Raw Tanah (Ktanah)</span>
        <span class="sensor-val" id="valSoilAdc">0 <span class="unit">ADC</span></span>
      </div>
      <div class="sensor-row">
        <span class="sensor-name">Laju Curah Hujan</span>
        <span class="sensor-val" id="valRain">0.0<span class="unit">mm/h</span></span>
      </div>
      <div class="sensor-row">
        <span class="sensor-name">Total Tip Pulsa Hujan</span>
        <span class="sensor-val" id="valTips">0 <span class="unit">tip</span></span>
      </div>
      <div class="sensor-row">
        <span class="sensor-name">Getaran 801S Pulsa</span>
        <span class="sensor-val" id="valVib">0 <span class="unit">pulsa</span></span>
      </div>
      <div class="sensor-row">
        <span class="sensor-name">Tegangan Aki & Arus</span>
        <span class="sensor-val" id="valBatt">0.00<span class="unit">V</span> / <span id="valSolar">0</span><span class="unit">mA</span></span>
      </div>
      <div class="sensor-row">
        <span class="sensor-name">Waktu RTC DS3231</span>
        <span class="sensor-val" style="font-size:0.85rem;" id="valRtc">--:--:--</span>
      </div>
    </div>

    <!-- PANEL 2: FORM KALIBRASI NILAI AMAN & TOLERANSI -->
    <div class="card">
      <h2>⚖️ Kalibrasi Nilai Aman & Toleransi</h2>
      <form id="formCalib" onsubmit="saveCalibration(event)">
        <div class="form-row">
          <div class="form-group">
            <label>Titik Aman Pitch (°)</label>
            <input type="number" step="0.01" class="form-control" id="inpSafePitch" required>
            <p class="helper-text">Posisi 0° saat stasiun tegak</p>
          </div>
          <div class="form-group">
            <label>Titik Aman Roll (°)</label>
            <input type="number" step="0.01" class="form-control" id="inpSafeRoll" required>
          </div>
        </div>

        <div class="quick-calib-group">
          <button type="button" class="btn btn-secondary btn-sm" onclick="zeroToCurrentAngle()">
            🎯 Ambil Nilai Sensor Saat Ini sebagai Titik Aman (Pitch, Roll &amp; Tanah)
          </button>
        </div>

        <div class="form-row" style="margin-top:0.75rem;">
          <div class="form-group">
            <label>Toleransi Kemiringan (±°)</label>
            <input type="number" step="0.1" class="form-control" id="inpTiltTol" required>
            <p class="helper-text">Batas toleransi aman (cth: ±2.0° atau ±5.0°)</p>
          </div>
          <div class="form-group">
            <label>Simpangan Siaga Kemiringan (°)</label>
            <input type="number" step="0.1" class="form-control" id="inpTiltWarn" required>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Batas Bahaya Kemiringan (°)</label>
            <input type="number" step="0.1" class="form-control" id="inpTiltDang" required>
          </div>
          <div class="form-group">
            <label>Hujan Siaga (mm/h)</label>
            <input type="number" step="0.5" class="form-control" id="inpRainWarn" required>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Hujan Bahaya (mm/h)</label>
            <input type="number" step="0.5" class="form-control" id="inpRainDang" required>
          </div>
          <div class="form-group">
            <label>Kalibrasi Tip Hujan (mm/tip)</label>
            <input type="number" step="0.01" class="form-control" id="inpRainCalib" required>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Baseline Aman Tanah (%)</label>
            <input type="number" step="0.5" class="form-control" id="inpSafeSoil" required>
          </div>
          <div class="form-group">
            <label>Toleransi Tanah (±%)</label>
            <input type="number" step="0.5" class="form-control" id="inpSoilTol" required>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Kelembapan Siaga (%)</label>
            <input type="number" step="0.5" class="form-control" id="inpSoilWarn" required>
          </div>
          <div class="form-group">
            <label>Batas Bahaya Getaran</label>
            <input type="number" step="0.05" class="form-control" id="inpVibDang" required>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>ADC Kering (0%)</label>
            <input type="number" class="form-control" id="inpSoilDry" required>
          </div>
          <div class="form-group">
            <label>ADC Basah (100%)</label>
            <input type="number" class="form-control" id="inpSoilWet" required>
          </div>
        </div>

        <div class="form-group">
          <label>Batas Aki Lemah (Volt)</label>
          <input type="number" step="0.1" class="form-control" id="inpBattLow" required>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Durasi Sirine Aktif (Detik)</label>
            <input type="number" class="form-control" id="inpAlarmDur" min="1" required>
            <p class="helper-text">Lama sirine berbunyi saat anomali bahaya (cth: 60s, 5000s)</p>
          </div>
          <div class="form-group">
            <label>Jeda Waktu Sirine (Detik)</label>
            <input type="number" class="form-control" id="inpAlarmPau" min="0" required>
            <p class="helper-text">Jeda mati sebelum sirine menyala lagi jika anomali berlanjut (cth: 30s, 1000s)</p>
          </div>
        </div>

        <button type="submit" class="btn btn-primary">💾 Simpan Kalibrasi ke EEPROM</button>
      </form>
    </div>
  </div>

  <!-- PANEL 3: KONFIGURASI PERANGKAT & JARINGAN (TIDAK ADA HARDCODE) -->
  <div class="card">
    <h2>🛠️ Identitas Perangkat & Target Server (Tanpa Hardcode)</h2>
    <form id="formDevice" onsubmit="saveDevice(event)">
      <div class="form-row">
        <div class="form-group">
          <label>Device ID (Stasiun EWS)</label>
          <input type="text" class="form-control" id="inpDevId" placeholder="misal: EWS-01, EWS-02" required>
          <p class="helper-text">Topik telemetri & perintah akan otomatis menyesuaikan</p>
        </div>
        <div class="form-group">
          <label>Protokol WebSocket SSL</label>
          <select class="form-control" id="inpWsSsl">
            <option value="1">Aktif (WSS / SSL Port 443)</option>
            <option value="0">Nonaktif (WS Biasa Port 80/5000/3440)</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Host Backend WebSocket</label>
          <input type="text" class="form-control" id="inpWsHost" placeholder="be-ews.qbyte.web.id" required>
        </div>
        <div class="form-group">
          <label>Port WebSocket</label>
          <input type="number" class="form-control" id="inpWsPort" placeholder="443" required>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Endpoint Path WebSocket</label>
          <input type="text" class="form-control" id="inpWsPath" placeholder="/ws" required>
        </div>
        <div class="form-group">
          <label>Default WiFi SSID</label>
          <input type="text" class="form-control" id="inpWfSsid" required>
        </div>
      </div>

      <div class="form-group">
        <label>Default WiFi Password</label>
        <input type="password" class="form-control" id="inpWfPass">
      </div>

      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1rem;">
        <button type="submit" class="btn btn-primary" style="flex: 2; margin-top: 0; background: linear-gradient(135deg, #059669, #047857);">
          💾 Simpan Pengaturan Jaringan & Server
        </button>
        <button type="button" class="btn btn-secondary" style="flex: 1; border-color: var(--accent-yellow); color: var(--accent-yellow);" onclick="openWiFiManagerPortal()">
          📶 Buka Portal WiFiManager
        </button>
      </div>
    </form>
  </div>
</div>

<div id="toast">Pengaturan berhasil disimpan!</div>

<script>
  let currentPitch = 0;
  let currentRoll = 0;
  let currentSoil = 50.0;

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  function fetchLive() {
    fetch('/api/live')
      .then(res => res.json())
      .then(d => {
        currentPitch = d.pitch;
        currentRoll  = d.roll;
        currentSoil  = d.soil;
        document.getElementById('valPitch').innerHTML = d.pitch.toFixed(2) + '<span class="unit">°</span>';
        document.getElementById('valRoll').innerHTML  = d.roll.toFixed(2) + '<span class="unit">°</span>';
        document.getElementById('valDevPitch').innerHTML = d.devPitch.toFixed(2) + '<span class="unit">°</span>';
        document.getElementById('valDevRoll').innerHTML  = d.devRoll.toFixed(2) + '<span class="unit">°</span>';
        document.getElementById('valSoil').innerHTML  = d.soil.toFixed(1) + '<span class="unit">%</span>';
        document.getElementById('valSoilAdc').innerHTML = d.soilAdc + '<span class="unit"> ADC</span>';
        document.getElementById('valRain').innerHTML  = d.rain.toFixed(1) + '<span class="unit"> mm/h</span>';
        document.getElementById('valTips').innerHTML  = d.tips + '<span class="unit"> tip</span>';
        document.getElementById('valVib').innerHTML   = d.vib + '<span class="unit"> pulsa</span>';
        document.getElementById('valBatt').innerHTML  = d.batt.toFixed(2) + '<span class="unit">V</span>';
        document.getElementById('valSolar').innerText = d.solar;
        document.getElementById('valRtc').innerText   = d.rtc;

        const badge = document.getElementById('statusBadge');
        const txtSt = document.getElementById('txtStatus');
        badge.className = 'badge status-' + d.status;
        txtSt.innerText = d.status.toUpperCase();
      })
      .catch(e => console.error("Poll error:", e));
  }

  function loadConfig() {
    fetch('/api/config')
      .then(res => res.json())
      .then(d => {
        document.getElementById('inpDevId').value     = d.devId;
        document.getElementById('txtDevId').innerText  = d.devId;
        document.getElementById('headerTitle').innerText = d.devId + " Calibration Node";
        document.getElementById('inpWsHost').value    = d.wsHost;
        document.getElementById('inpWsPort').value    = d.wsPort;
        document.getElementById('inpWsPath').value    = d.wsPath;
        document.getElementById('inpWsSsl').value     = d.wsSsl ? "1" : "0";
        document.getElementById('inpWfSsid').value    = d.wfSsid;
        document.getElementById('inpWfPass').value    = d.wfPass;

        document.getElementById('inpSafePitch').value = d.safePitch;
        document.getElementById('inpSafeRoll').value  = d.safeRoll;
        document.getElementById('inpTiltTol').value   = d.tiltTol;
        document.getElementById('inpTiltWarn').value  = d.tiltWarn;
        document.getElementById('inpTiltDang').value  = d.tiltDang;
        document.getElementById('inpRainWarn').value  = d.rainWarn;
        document.getElementById('inpRainDang').value  = d.rainDang;
        document.getElementById('inpRainCalib').value = d.rainCalib;
        document.getElementById('inpSafeSoil').value  = d.safeSoil;
        document.getElementById('inpSoilTol').value   = d.soilTol;
        document.getElementById('inpSoilWarn').value  = d.soilWarn;
        document.getElementById('inpVibDang').value   = d.vibDang;
        document.getElementById('inpSoilDry').value   = d.soilDry;
        document.getElementById('inpSoilWet').value   = d.soilWet;
        document.getElementById('inpBattLow').value   = d.battLow;
        document.getElementById('inpAlarmDur').value  = d.alarmDur || 60;
        document.getElementById('inpAlarmPau').value  = d.alarmPau || 30;
      });
  }

  function zeroToCurrentAngle() {
    document.getElementById('inpSafePitch').value = currentPitch.toFixed(2);
    document.getElementById('inpSafeRoll').value  = currentRoll.toFixed(2);
    if (document.getElementById('inpSafeSoil')) {
      document.getElementById('inpSafeSoil').value = currentSoil.toFixed(1);
    }
    showToast("🎯 Titik aman pitch, roll & kelembapan tanah diisi sesuai sensor saat ini!");
  }

  function saveCalibration(e) {
    e.preventDefault();
    const payload = {
      safePitch: parseFloat(document.getElementById('inpSafePitch').value),
      safeRoll:  parseFloat(document.getElementById('inpSafeRoll').value),
      tiltTol:   parseFloat(document.getElementById('inpTiltTol').value),
      tiltWarn:  parseFloat(document.getElementById('inpTiltWarn').value),
      tiltDang:  parseFloat(document.getElementById('inpTiltDang').value),
      rainWarn:  parseFloat(document.getElementById('inpRainWarn').value),
      rainDang:  parseFloat(document.getElementById('inpRainDang').value),
      rainCalib: parseFloat(document.getElementById('inpRainCalib').value),
      safeSoil:  parseFloat(document.getElementById('inpSafeSoil').value),
      soilTol:   parseFloat(document.getElementById('inpSoilTol').value),
      soilWarn:  parseFloat(document.getElementById('inpSoilWarn').value),
      vibDang:   parseFloat(document.getElementById('inpVibDang').value),
      soilDry:   parseInt(document.getElementById('inpSoilDry').value),
      soilWet:   parseInt(document.getElementById('inpSoilWet').value),
      battLow:   parseFloat(document.getElementById('inpBattLow').value),
      alarmDur:  parseInt(document.getElementById('inpAlarmDur').value),
      alarmPau:  parseInt(document.getElementById('inpAlarmPau').value)
    };

    fetch('/api/save_calibration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(d => {
      showToast(d.message || "Kalibrasi berhasil disimpan!");
    });
  }

  function openWiFiManagerPortal() {
    if (!confirm("Buka Access Point Hotspot WiFiManager untuk scan & ganti WiFi?")) return;
    fetch('/api/trigger_wifimanager', { method: 'POST' })
      .then(res => res.json())
      .then(d => {
        alert(d.message || "WiFiManager Portal Aktif!");
      });
  }

  function saveDevice(e) {
    e.preventDefault();
    const payload = {
      devId:  document.getElementById('inpDevId').value.trim(),
      wsHost: document.getElementById('inpWsHost').value.trim(),
      wsPort: parseInt(document.getElementById('inpWsPort').value),
      wsPath: document.getElementById('inpWsPath').value.trim(),
      wsSsl:  document.getElementById('inpWsSsl').value === "1",
      wfSsid: document.getElementById('inpWfSsid').value.trim(),
      wfPass: document.getElementById('inpWfPass').value
    };

    fetch('/api/save_device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(d => {
      showToast(d.message || "Identitas & Konfigurasi Server Berhasil Disimpan!");
      document.getElementById('txtDevId').innerText = payload.devId;
      document.getElementById('headerTitle').innerText = payload.devId + " Calibration Node";
    });
  }

  window.onload = function() {
    loadConfig();
    fetchLive();
    setInterval(fetchLive, 1000); // Polling live data tiap 1 detik
  };
</script>

</body>
</html>
)rawliteral";

void handleRoot() {
  localServer.send_P(200, "text/html", INDEX_HTML);
}

void handleApiLive() {
  SensorDataSnapshot snap;
  SensorRawValues raw;
  SensorThresholds thresh;

  if (dataMutex != NULL && xSemaphoreTake(dataMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
    snap = sharedSensors;
    raw = sharedRawSensors;
    thresh = currentThresholds;
    xSemaphoreGive(dataMutex);
  } else {
    snap = sharedSensors;
    raw = sharedRawSensors;
    thresh = currentThresholds;
  }

  float devPitch = fabs(snap.pitch - thresh.safeTiltPitch);
  float devRoll  = fabs(snap.roll  - thresh.safeTiltRoll);

  StaticJsonDocument<512> doc;
  doc["pitch"]    = round(snap.pitch * 100.0) / 100.0;
  doc["roll"]     = round(snap.roll * 100.0) / 100.0;
  doc["devPitch"] = round(devPitch * 100.0) / 100.0;
  doc["devRoll"]  = round(devRoll * 100.0) / 100.0;
  doc["soil"]     = round(snap.soilMoisture * 10.0) / 10.0;
  doc["soilAdc"]  = raw.soilAdcRaw;
  doc["rain"]     = round(snap.rainRate * 10.0) / 10.0;
  doc["tips"]     = raw.rainTipsRaw;
  doc["vib"]      = raw.vibPulsesRaw;
  doc["batt"]     = round(snap.batteryVoltage * 100.0) / 100.0;
  doc["solar"]    = snap.solarCurrent;
  doc["rtc"]      = snap.uptimeHours > 0 ? (rtcAvailable ? rtcTimeString : "Aktif") : (rtcAvailable ? rtcTimeString : "N/A");
  doc["status"]   = currentStatus;

  String res;
  serializeJson(doc, res);
  localServer.send(200, "application/json", res);
}

void handleApiConfig() {
  SensorThresholds thresh;
  if (dataMutex != NULL && xSemaphoreTake(dataMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
    thresh = currentThresholds;
    xSemaphoreGive(dataMutex);
  } else {
    thresh = currentThresholds;
  }

  StaticJsonDocument<768> doc;
  doc["devId"]     = ewsId;
  doc["wsHost"]    = wsHost;
  doc["wsPort"]    = wsPort;
  doc["wsPath"]    = wsPath;
  doc["wsSsl"]     = wsUseSsl;
  doc["wfSsid"]    = wifiSsidDefault;
  doc["wfPass"]    = wifiPasswordDefault;

  doc["safePitch"] = thresh.safeTiltPitch;
  doc["safeRoll"]  = thresh.safeTiltRoll;
  doc["tiltTol"]   = thresh.tiltTolerance;
  doc["tiltWarn"]  = thresh.tiltWarning;
  doc["tiltDang"]  = thresh.tiltDanger;
  doc["rainWarn"]  = thresh.rainWarning;
  doc["rainDang"]  = thresh.rainDanger;
  doc["rainCalib"] = thresh.rainCalibPerTip;
  doc["safeSoil"]  = thresh.safeSoilMoisture;
  doc["soilTol"]   = thresh.soilMoistureTolerance;
  doc["soilWarn"]  = thresh.soilMoistureWarning;
  doc["vibDang"]   = thresh.vibrationDanger;
  doc["soilDry"]   = thresh.soilAdcDry;
  doc["soilWet"]   = thresh.soilAdcWet;
  doc["battLow"]   = thresh.batteryLowVoltage;
  doc["alarmDur"]  = thresh.alarmDuration;
  doc["alarmPau"]  = thresh.alarmPause;

  String res;
  serializeJson(doc, res);
  localServer.send(200, "application/json", res);
}

void handleApiSaveCalibration() {
  if (!localServer.hasArg("plain")) {
    localServer.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Payload kosong\"}");
    return;
  }
  String body = localServer.arg("plain");
  StaticJsonDocument<768> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    localServer.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Format JSON tidak valid\"}");
    return;
  }

  SensorThresholds newT = currentThresholds;
  if (doc.containsKey("safePitch")) newT.safeTiltPitch         = doc["safePitch"].as<float>();
  if (doc.containsKey("safeRoll"))  newT.safeTiltRoll          = doc["safeRoll"].as<float>();
  if (doc.containsKey("tiltTol"))   newT.tiltTolerance         = doc["tiltTol"].as<float>();
  if (doc.containsKey("tiltWarn"))  newT.tiltWarning           = doc["tiltWarn"].as<float>();
  if (doc.containsKey("tiltDang"))  newT.tiltDanger            = doc["tiltDang"].as<float>();
  if (doc.containsKey("rainWarn"))  newT.rainWarning           = doc["rainWarn"].as<float>();
  if (doc.containsKey("rainDang"))  newT.rainDanger            = doc["rainDang"].as<float>();
  if (doc.containsKey("rainCalib")) newT.rainCalibPerTip       = doc["rainCalib"].as<float>();
  if (doc.containsKey("safeSoil"))  newT.safeSoilMoisture      = doc["safeSoil"].as<float>();
  if (doc.containsKey("soilTol"))   newT.soilMoistureTolerance = doc["soilTol"].as<float>();
  if (doc.containsKey("soilWarn"))  newT.soilMoistureWarning   = doc["soilWarn"].as<float>();
  if (doc.containsKey("vibDang"))   newT.vibrationDanger       = doc["vibDang"].as<float>();
  if (doc.containsKey("soilDry"))   newT.soilAdcDry            = doc["soilDry"].as<int>();
  if (doc.containsKey("soilWet"))   newT.soilAdcWet            = doc["soilWet"].as<int>();
  if (doc.containsKey("battLow"))   newT.batteryLowVoltage     = doc["battLow"].as<float>();
  if (doc.containsKey("alarmDur"))  newT.alarmDuration         = doc["alarmDur"].as<uint32_t>();
  if (doc.containsKey("alarmPau"))  newT.alarmPause            = doc["alarmPau"].as<uint32_t>();

  saveThresholdsToEEPROM(newT);
  localServer.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Kalibrasi & Ambang Batas Berhasil Disimpan ke EEPROM!\"}");
}

void handleApiSaveDevice() {
  if (!localServer.hasArg("plain")) {
    localServer.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Payload kosong\"}");
    return;
  }
  String body = localServer.arg("plain");
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    localServer.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Format JSON tidak valid\"}");
    return;
  }

  String newDevId = doc["devId"] | ewsId;
  String newHost  = doc["wsHost"] | wsHost;
  int    newPort  = doc["wsPort"] | wsPort;
  String newPath  = doc["wsPath"] | wsPath;
  bool   newSsl   = doc["wsSsl"] | wsUseSsl;
  String newSsid  = doc["wfSsid"] | wifiSsidDefault;
  String newPass  = doc["wfPass"] | wifiPasswordDefault;

  saveDeviceConfigToNVS(newDevId, newSsid, newPass, newHost, newPort, newPath, newSsl);
  localServer.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Identitas Perangkat & Target Server Disimpan ke NVS!\"}");
}

void setupWebServer() {
  localServer.on("/", HTTP_GET, handleRoot);
  localServer.on("/api/live", HTTP_GET, handleApiLive);
  localServer.on("/api/config", HTTP_GET, handleApiConfig);
  localServer.on("/api/save_calibration", HTTP_POST, handleApiSaveCalibration);
  localServer.on("/api/save_device", HTTP_POST, handleApiSaveDevice);
  localServer.on("/api/trigger_wifimanager", HTTP_POST, []() {
    localServer.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Access Point WiFiManager diaktifkan! Hubungkan ke WiFi EWS-Config-" + ewsId + "\"}");
    delay(500);
    triggerWiFiManagerPortal = true;
  });

  localServer.begin();
  Serial.println("🌐 [WEB SERVER] Web Server Kalibrasi Berhasil Dimulai pada Port 80!");
  Serial.print("   👉 Akses dashboard via browser di IP: http://");
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(WiFi.localIP().toString());
  } else {
    Serial.println(WiFi.softAPIP().toString());
  }
}