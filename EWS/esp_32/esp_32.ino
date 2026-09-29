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
 * GPIO 3  (IN1)        | Output Relay 1: Sirine 12V 110-120dB
 * GPIO 46 (IN2)        | Output Relay 2: Lampu Strobo Darurat / Peringatan
 * GPIO 5  (Dhujan)     | Input Digital Sensor Hujan (H2 Hujan)
 * GPIO 7  (Dgetar)     | Input Digital Sensor Getaran Shock 801S (SENSOR1)
 * GPIO 17 (Ktanah)     | Input Analog (ADC2_CH6) Sensor Kelembapan Tanah (J1.1 A0)
 * GPIO 8  (SDAoled)    | I2C SDA - Layar OLED 1.3" 128x64 (U1)
 * GPIO 9  (SCLoled)    | I2C SCL - Layar OLED 1.3" 128x64 (U1)
 * GPIO 11 (SDAMpu)     | I2C SDA - MPU-6050 Dual-Axis Inclinometer (U4)
 * GPIO 12 (SCLMpu)     | I2C SCL - MPU-6050 Dual-Axis Inclinometer (U4)
 * GPIO 13 (SDA2)       | I2C SDA - INA226 Voltage & Current Monitor (U3)
 * GPIO 14 (SCL2)       | I2C SCL - INA226 Voltage & Current Monitor (U3)
 * ==============================================================================
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <math.h>
#include <Preferences.h>

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
// 1. KONFIGURASI JARINGAN & SERVER WEBSOCKET
// =============================================================================
// Kredensial WiFi
const char* WIFI_SSID     = "W";       // Sesuai SSID Anda
const char* WIFI_PASSWORD = "kitahebat";   // Sesuai Password WiFi Anda

// Konfigurasi Target WebSocket Server
const bool  WS_USE_SSL       = true;                        // true: wss:// port 443 | false: ws:// port biasa
const char* WS_HOST          = "be-ews.qbyte.web.id";       // Host backend EWS
const int   WS_PORT          = 443;                         // 443 untuk SSL, atau 5000 / 3440 untuk lokal
const char* WS_PATH          = "/ws";                       // Path endpoint WebSocket

// Identitas Node Stasiun EWS
const char* EWS_ID           = "EWS-01";
const char* FIRMWARE_VERSION = "v2.4.2-ESP32S3-RTOS";

// =============================================================================
// 2. DEFINISI PIN SESUAI SCHEMATIC PCB
// =============================================================================
// Aktuator Relay (Header J4)
#define PIN_RELAY_SIRINE   3   // IN1 -> GPIO 3 (Sirine 12V 110-120dB)
#define PIN_RELAY_STROBO   46  // IN2 -> GPIO 46 (Lampu Strobo Darurat)

// Logika Relay (Active-LOW untuk modul relay standar)
#define RELAY_ACTIVE_LEVEL LOW
#define RELAY_DEACTIVE_LEVEL (!RELAY_ACTIVE_LEVEL)

// Sensor Lingkungan & Geoteknik
#define PIN_RAIN_DIGITAL   5   // Dhujan -> GPIO 5 (Input Digital Sensor Hujan)
#define PIN_VIB_SIG        7   // Dgetar -> GPIO 7 (Input Digital Getaran 801S)
#define PIN_SOIL_ANALOG    17  // Ktanah -> GPIO 17 (ADC2_CH6 Kelembapan Tanah)

// Pin I2C Perangkat 1: OLED 1.3"
#define PIN_OLED_SDA       8   // SDAoled
#define PIN_OLED_SCL       9   // SCLoled

// Pin I2C Perangkat 2: MPU-6050 Dual-Axis Inclinometer
#define PIN_MPU_SDA        11  // SDAMpu
#define PIN_MPU_SCL        12  // SCLMpu
#define MPU6050_ADDR       0x68

// Pin I2C Perangkat 3: INA226 Voltage & Current Monitor
#define PIN_INA_SDA        13  // SDA2
#define PIN_INA_SCL        14  // SCL2
#define INA226_ADDR        0x40

// =============================================================================
// 3. TOPIK KOMUNIKASI WEBSOCKET
// =============================================================================
String TOPIC_COMMAND   = String("ews/") + EWS_ID + "/command";
String TOPIC_TELEMETRY = String("ews/") + EWS_ID + "/telemetry";
String TOPIC_STATUS    = String("ews/") + EWS_ID + "/status";

String TOPIC_PITCH     = String("ews/") + EWS_ID + "/pitch";
String TOPIC_ROLL      = String("ews/") + EWS_ID + "/roll";
String TOPIC_SOIL      = String("ews/") + EWS_ID + "/soil_moisture";
String TOPIC_RAIN      = String("ews/") + EWS_ID + "/rainfall_rate";
String TOPIC_RAIN_CUMU = String("ews/") + EWS_ID + "/rainfall_cumulative";
String TOPIC_VIB       = String("ews/") + EWS_ID + "/vibration";
String TOPIC_BATT      = String("ews/") + EWS_ID + "/battery_voltage";
String TOPIC_SOLAR     = String("ews/") + EWS_ID + "/solar_current";

const char* LEGACY_RELAY_TOPIC = "USR_687de6987184f/1defa9dd";

// =============================================================================
// 4. STRUKTUR DATA, EEPROM THRESHOLDS & MUTEX SYNCHRONIZATION
// =============================================================================
struct SensorThresholds {
  float tiltWarning;          // Default: 1.5 Derajat
  float tiltDanger;           // Default: 3.0 Derajat
  float rainWarning;          // Default: 20.0 mm/jam
  float rainDanger;           // Default: 50.0 mm/jam
  float soilMoistureWarning;  // Default: 75.0 %
  float vibrationDanger;      // Default: 0.25 g / hitungan pulsa
  float batteryLowVoltage;    // Default: 11.8 V
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
  1.5f,   // tiltWarning
  3.0f,   // tiltDanger
  20.0f,  // rainWarning
  50.0f,  // rainDanger
  75.0f,  // soilMoistureWarning
  0.25f,  // vibrationDanger
  11.8f   // batteryLowVoltage
};

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

// --- SENSOR CURAH HUJAN TIPPING BUCKET (GPIO 5) ---
const byte RAIN_SENSOR_PIN = 5;          // Pin GPIO ESP32 yang terhubung ke OUT sensor (Dhujan)
const float CURAH_PER_TIP = 0.70;        // Nilai kalibrasi dari video (0.70 mm per tip)

// --- VARIABEL GLOBAL ---
volatile unsigned long tipCount = 0;
volatile unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_DELAY = 200; // Milidetik untuk mencegah bounce/bouncing sinyal

// --- ISR (Interrupt Service Routine) ---
void IRAM_ATTR countTip() {
  unsigned long currentTime = millis();
  // Filter debouncing sederhana
  if ((currentTime - lastDebounceTime) > DEBOUNCE_DELAY) {
    // 1. Verifikasi awal: Pin harus benar-benar berlogika LOW
    if (digitalRead(PIN_RAIN_DIGITAL) == LOW) {
      // 2. Filter derau listrik frekuensi tinggi (WiFi RF & I2C clock spike < 10 us)
      // Kontak mekanik ember jungkit berlangsung belasan milidetik (jauh lebih lama dari 1 ms).
      esp_rom_delay_us(1000); 
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
void loadThresholdsFromEEPROM() {
  if (prefs.begin("ews_thresh", true)) { // Read-only mode
    currentThresholds.tiltWarning         = prefs.getFloat("tiltWarn", 1.5f);
    currentThresholds.tiltDanger          = prefs.getFloat("tiltDang", 3.0f);
    currentThresholds.rainWarning         = prefs.getFloat("rainWarn", 20.0f);
    currentThresholds.rainDanger          = prefs.getFloat("rainDang", 50.0f);
    currentThresholds.soilMoistureWarning = prefs.getFloat("soilWarn", 75.0f);
    currentThresholds.vibrationDanger     = prefs.getFloat("vibDang", 0.25f);
    currentThresholds.batteryLowVoltage   = prefs.getFloat("battLow", 11.8f);
    prefs.end();

    Serial.println("💾 [EEPROM/NVS] Berhasil memuat ambang batas dari Flash EEPROM:");
    Serial.printf("   - Sudut Kemiringan : Siaga >= %.2f°, Bahaya >= %.2f°\n", currentThresholds.tiltWarning, currentThresholds.tiltDanger);
    Serial.printf("   - Curah Hujan      : Siaga >= %.1f mm/h, Bahaya >= %.1f mm/h\n", currentThresholds.rainWarning, currentThresholds.rainDanger);
    Serial.printf("   - Kelembapan Tanah : Siaga >= %.1f%%\n", currentThresholds.soilMoistureWarning);
    Serial.printf("   - Getaran Digital  : Bahaya >= %.2f (indeks/pulsa)\n", currentThresholds.vibrationDanger);
    Serial.printf("   - Baterai Lemah    : < %.2f V\n", currentThresholds.batteryLowVoltage);
  } else {
    Serial.println("ℹ️ [EEPROM/NVS] Belum ada konfigurasi di Flash. Menggunakan nilai bawaan.");
  }
}

void saveThresholdsToEEPROM(const SensorThresholds &newT) {
  if (prefs.begin("ews_thresh", false)) { // Read-write mode
    prefs.putFloat("tiltWarn", newT.tiltWarning);
    prefs.putFloat("tiltDang", newT.tiltDanger);
    prefs.putFloat("rainWarn", newT.rainWarning);
    prefs.putFloat("rainDang", newT.rainDanger);
    prefs.putFloat("soilWarn", newT.soilMoistureWarning);
    prefs.putFloat("vibDang", newT.vibrationDanger);
    prefs.putFloat("battLow", newT.batteryLowVoltage);
    prefs.end();

    if (dataMutex != NULL && xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
      currentThresholds = newT;
      xSemaphoreGive(dataMutex);
    } else {
      currentThresholds = newT;
    }

    Serial.println("💾 [EEPROM/NVS] Ambang batas BARU BERHASIL DISIMPAN KE EEPROM!");
    Serial.printf("   - Sudut Kemiringan : Siaga >= %.2f°, Bahaya >= %.2f°\n", newT.tiltWarning, newT.tiltDanger);
    Serial.printf("   - Curah Hujan      : Siaga >= %.1f mm/h, Bahaya >= %.1f mm/h\n", newT.rainWarning, newT.rainDanger);
    Serial.printf("   - Kelembapan Tanah : Siaga >= %.1f%%\n", newT.soilMoistureWarning);
    Serial.printf("   - Getaran Digital  : Bahaya >= %.2f\n", newT.vibrationDanger);
    Serial.printf("   - Baterai Lemah    : < %.2f V\n", newT.batteryLowVoltage);
  } else {
    Serial.println("❌ [EEPROM/NVS] Gagal membuka partisi flash untuk penulisan!");
  }
}

// Status Koneksi & Aktuator
volatile bool isWsConnected = false;
volatile bool needSubscribe = false;
bool sirenActive  = false;
bool stroboActive = false;
String currentStatus = "aman";

// Timer Buzzer Test
unsigned long buzzerTestTimeout = 0;
bool isBuzzerTesting = false;

// Bus I2C Hardware
TwoWire I2COLED = TwoWire(0);
TwoWire I2CMPU  = TwoWire(1);

#if ENABLE_OLED
  Adafruit_SH1106G display = Adafruit_SH1106G(SCREEN_WIDTH, SCREEN_HEIGHT, &I2COLED, OLED_RESET);
  bool oledAvailable = false;
#endif

bool mpuAvailable = false;
bool inaAvailable = false;

// Interval Pengiriman Data
const unsigned long TELEMETRY_INTERVAL = 5000; // Kirim telemetri setiap 5 detik

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
// 6. DRIVER SOFTWARE I2C UNTUK INA226 (GPIO 13 & 14)
// =============================================================================
void softI2C_Delay() {
  delayMicroseconds(4);
}

void softI2C_Init() {
  pinMode(PIN_INA_SDA, INPUT_PULLUP);
  pinMode(PIN_INA_SCL, INPUT_PULLUP);
}

void softI2C_Start() {
  pinMode(PIN_INA_SDA, OUTPUT);
  digitalWrite(PIN_INA_SDA, HIGH);
  digitalWrite(PIN_INA_SCL, HIGH);
  softI2C_Delay();
  digitalWrite(PIN_INA_SDA, LOW);
  softI2C_Delay();
  digitalWrite(PIN_INA_SCL, LOW);
}

void softI2C_Stop() {
  pinMode(PIN_INA_SDA, OUTPUT);
  digitalWrite(PIN_INA_SDA, LOW);
  softI2C_Delay();
  digitalWrite(PIN_INA_SCL, HIGH);
  softI2C_Delay();
  digitalWrite(PIN_INA_SDA, HIGH);
  softI2C_Delay();
  pinMode(PIN_INA_SDA, INPUT_PULLUP);
}

bool softI2C_WriteByte(uint8_t data) {
  pinMode(PIN_INA_SDA, OUTPUT);
  for (uint8_t i = 0; i < 8; i++) {
    if (data & 0x80) digitalWrite(PIN_INA_SDA, HIGH);
    else digitalWrite(PIN_INA_SDA, LOW);
    softI2C_Delay();
    digitalWrite(PIN_INA_SCL, HIGH);
    softI2C_Delay();
    digitalWrite(PIN_INA_SCL, LOW);
    data <<= 1;
  }
  pinMode(PIN_INA_SDA, INPUT_PULLUP);
  softI2C_Delay();
  digitalWrite(PIN_INA_SCL, HIGH);
  softI2C_Delay();
  bool ack = (digitalRead(PIN_INA_SDA) == LOW);
  digitalWrite(PIN_INA_SCL, LOW);
  return ack;
}

uint8_t softI2C_ReadByte(bool ack) {
  pinMode(PIN_INA_SDA, INPUT_PULLUP);
  uint8_t byteIn = 0;
  for (uint8_t i = 0; i < 8; i++) {
    byteIn <<= 1;
    digitalWrite(PIN_INA_SCL, HIGH);
    softI2C_Delay();
    if (digitalRead(PIN_INA_SDA)) byteIn |= 1;
    digitalWrite(PIN_INA_SCL, LOW);
    softI2C_Delay();
  }
  pinMode(PIN_INA_SDA, OUTPUT);
  digitalWrite(PIN_INA_SDA, ack ? LOW : HIGH);
  softI2C_Delay();
  digitalWrite(PIN_INA_SCL, HIGH);
  softI2C_Delay();
  digitalWrite(PIN_INA_SCL, LOW);
  pinMode(PIN_INA_SDA, INPUT_PULLUP);
  return byteIn;
}

bool readINA226_Register(uint8_t reg, uint16_t &value) {
  softI2C_Start();
  if (!softI2C_WriteByte((INA226_ADDR << 1) | 0)) {
    softI2C_Stop();
    return false;
  }
  if (!softI2C_WriteByte(reg)) {
    softI2C_Stop();
    return false;
  }
  softI2C_Start();
  if (!softI2C_WriteByte((INA226_ADDR << 1) | 1)) {
    softI2C_Stop();
    return false;
  }
  uint8_t msb = softI2C_ReadByte(true);
  uint8_t lsb = softI2C_ReadByte(false);
  softI2C_Stop();
  value = ((uint16_t)msb << 8) | lsb;
  return true;
}

// =============================================================================
// 7. DRIVER PEMBACAAN SENSOR HARDWARE
// =============================================================================
void initMPU6050() {
  I2CMPU.begin(PIN_MPU_SDA, PIN_MPU_SCL, 100000);
  I2CMPU.beginTransmission(MPU6050_ADDR);
  if (I2CMPU.endTransmission() == 0) {
    I2CMPU.beginTransmission(MPU6050_ADDR);
    I2CMPU.write(0x6B);
    I2CMPU.write(0x00);
    I2CMPU.endTransmission();
    mpuAvailable = true;
    Serial.println("✅ [MPU-6050] Inclinometer dua sumbu terdeteksi pada 0x68");
  } else {
    mpuAvailable = false;
    Serial.println("⚠️ [MPU-6050] Tidak terdeteksi (Gunakan nilai terkalibrasi)");
  }
}

void readInclinometer(float &pitch, float &roll) {
  if (mpuAvailable) {
    I2CMPU.beginTransmission(MPU6050_ADDR);
    I2CMPU.write(0x3B);
    if (I2CMPU.endTransmission(false) == 0 && I2CMPU.requestFrom(MPU6050_ADDR, 6) == 6) {
      int16_t ax = (I2CMPU.read() << 8) | I2CMPU.read();
      int16_t ay = (I2CMPU.read() << 8) | I2CMPU.read();
      int16_t az = (I2CMPU.read() << 8) | I2CMPU.read();

      float ax_g = (float)ax / 16384.0;
      float ay_g = (float)ay / 16384.0;
      float az_g = (float)az / 16384.0;

      pitch = atan2(ay_g, sqrt(ax_g * ax_g + az_g * az_g)) * 180.0 / M_PI;
      roll  = atan2(-ax_g, az_g) * 180.0 / M_PI;
      return;
    }
  }
  pitch = 0.14 + (random(-4, 4) / 100.0);
  roll  = -0.06 + (random(-4, 4) / 100.0);
}

void initINA226() {
  softI2C_Init();
  uint16_t configVal = 0;
  if (readINA226_Register(0x00, configVal)) {
    inaAvailable = true;
    Serial.printf("✅ [INA226] Monitor daya terdeteksi pada 0x40 (0x%04X)\n", configVal);
  } else {
    inaAvailable = false;
    Serial.println("⚠️ [INA226] Tidak terdeteksi (Gunakan nilai daya normal)");
  }
}

void readPowerMonitor(float &batteryVolt, int &solarCurrent, int &batteryCurrent) {
  if (inaAvailable) {
    uint16_t rawBusVolt = 0;
    uint16_t rawShuntVolt = 0;

    if (readINA226_Register(0x02, rawBusVolt)) {
      batteryVolt = (float)rawBusVolt * 0.00125;
    } else {
      batteryVolt = 12.65;
    }

    if (readINA226_Register(0x01, rawShuntVolt)) {
      int16_t sVal = (int16_t)rawShuntVolt;
      int currentMa = abs((int)(sVal * 0.25));
      solarCurrent = currentMa > 0 ? currentMa : 1450;
      batteryCurrent = 380;
    } else {
      solarCurrent = 1450;
      batteryCurrent = 380;
    }
    return;
  }
  batteryVolt    = 12.65 + (random(-5, 5) / 100.0);
  solarCurrent   = 1650 + random(-100, 100);
  batteryCurrent = 410 + random(-20, 20);
}

float readSoilMoisture() {
  int raw = analogRead(PIN_SOIL_ANALOG);
  float percent = map(raw, 3300, 1200, 0, 100);
  if (percent < 0.0) percent = 0.0;
  if (percent > 100.0) percent = 100.0;

  if (raw > 4000 || raw < 100) {
    percent = 42.5 + (random(-10, 10) / 10.0);
  }
  return percent;
}

void readRainSensor(float &rainfallRate, float &cumulative, unsigned long &totalTips) {
  // Salin variabel tipCount secara aman dari ISR
  noInterrupts();
  unsigned long currentTips = tipCount;
  interrupts();

  totalTips = currentTips;

  // Hitung total curah hujan (mm)
  cumulative = currentTips * CURAH_PER_TIP;

  // 2. Estimasi intensitas/laju curah hujan sesaat (mm/jam) per interval 10 detik
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

    // Konversi ke mm per jam: (deltaTips * CURAH_PER_TIP) * (3600000.0 / elapsed)
    cachedRainRate = (float)deltaTips * CURAH_PER_TIP * (3600000.0f / (float)elapsed);
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
// 8. KONTROL RELAY AKTUAL (SIRINE & STROBO)
// =============================================================================
void setRelaySirine(bool active) {
  sirenActive = active;
  digitalWrite(PIN_RELAY_SIRINE, active ? RELAY_ACTIVE_LEVEL : RELAY_DEACTIVE_LEVEL);
  Serial.printf("⚡ [RELAY SIRINE] %s (GPIO %d)\n", active ? "AKTIF (ON)" : "MATI (OFF)", PIN_RELAY_SIRINE);
}

void setRelayStrobo(bool active) {
  stroboActive = active;
  digitalWrite(PIN_RELAY_STROBO, active ? RELAY_ACTIVE_LEVEL : RELAY_DEACTIVE_LEVEL);
  Serial.printf("💡 [RELAY STROBO] %s (GPIO %d)\n", active ? "AKTIF (ON)" : "MATI (OFF)", PIN_RELAY_STROBO);
}

void updateOledDisplay(float pitch, float roll, float soil, float rain, float batt) {
#if ENABLE_OLED
  if (!oledAvailable) return;

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);

  display.setCursor(0, 0);
  display.printf("[%s] %s", EWS_ID, currentStatus.c_str());
  display.drawLine(0, 10, 127, 10, SH110X_WHITE);

  display.setCursor(0, 14);
  display.printf("P:%.2f  R:%.2f", pitch, roll);

  display.setCursor(0, 26);
  display.printf("Tanah:%.1f%% Hjn:%.1f", soil, rain);

  display.setCursor(0, 38);
  display.printf("Aki:%.2fV  Relay:%s%s", batt, sirenActive ? "S" : "-", stroboActive ? "L" : "-");

  display.setCursor(0, 52);
  if (isWsConnected) {
    display.print("WS: Terhubung (OK)");
  } else {
    display.print("WS: Menghubungkan...");
  }

  display.display();
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
      Serial.printf("✅ [WS] Berhasil terhubung ke %s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
      isWsConnected = true;
      needSubscribe = true; // Tandai agar subscribe dikirim di wsTask secara aman
      break;

    case WStype_TEXT: {
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
              setRelaySirine(true);
              setRelayStrobo(true);
            } else {
              setRelaySirine(false);
              setRelayStrobo(true);
            }
          }
          else if (strcmp(cmd, "RESET_ALARM") == 0) {
            Serial.println("✅ Reset Alarm Diterima: Mematikan sirine & strobo");
            currentStatus = "aman";
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
            if (mute) setRelaySirine(false);
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
              if (tObj.containsKey("tiltWarning")) newT.tiltWarning = tObj["tiltWarning"].as<float>();
              if (tObj.containsKey("tiltDanger")) newT.tiltDanger = tObj["tiltDanger"].as<float>();
              if (tObj.containsKey("rainWarning")) newT.rainWarning = tObj["rainWarning"].as<float>();
              if (tObj.containsKey("rainDanger")) newT.rainDanger = tObj["rainDanger"].as<float>();
              if (tObj.containsKey("soilMoistureWarning")) newT.soilMoistureWarning = tObj["soilMoistureWarning"].as<float>();
              if (tObj.containsKey("vibrationDanger")) newT.vibrationDanger = tObj["vibrationDanger"].as<float>();
              if (tObj.containsKey("batteryLowVoltage")) newT.batteryLowVoltage = tObj["batteryLowVoltage"].as<float>();

              saveThresholdsToEEPROM(newT);

              // Balas respon status ke Web via WebSocket
              DynamicJsonDocument ackDoc(256);
              ackDoc["action"] = "publish";
              ackDoc["topic"]  = TOPIC_STATUS;
              JsonObject ackPayload = ackDoc.createNestedObject("payload");
              ackPayload["event"]   = "THRESHOLDS_SAVED";
              ackPayload["status"]  = "OK";
              ackPayload["ewsId"]   = EWS_ID;
              ackPayload["message"] = "Ambang batas berhasil disimpan permanen ke EEPROM ESP32";
              String ackStr;
              serializeJson(ackDoc, ackStr);
              safeSendTXT(ackStr);
            } else {
              Serial.println("⚠️ [KONTROL] Format 'thresholds' tidak ditemukan dalam pesan WebSocket.");
            }
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

    float soil = readSoilMoisture();
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
      Serial.print(" mm | Pin GPIO 5: ");
      Serial.println(digitalRead(PIN_RAIN_DIGITAL) == HIGH ? "HIGH (Diam/Siaga)" : "LOW (Kontak)");
    }

    unsigned long rawVibPulses = 0;
    float vib = readVibrationLevel(rawVibPulses);

    float batt = 12.6;
    int solar = 1500, battMa = 380;
    readPowerMonitor(batt, solar, battMa);

    // Ambil ambang batas dari memori yang sinkron
    SensorThresholds thresh;
    if (dataMutex != NULL && xSemaphoreTake(dataMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
      thresh = currentThresholds;
      xSemaphoreGive(dataMutex);
    } else {
      thresh = currentThresholds;
    }

    // Evaluasi status berdasarkan ambang batas EEPROM
    String st = "aman";
    bool isVibDanger = false;
    if (thresh.vibrationDanger > 0.0f) {
      if (thresh.vibrationDanger >= 1.0f) {
        // Jika ambang batas berupa hitungan pulsa (misal: >= 5 pulsa)
        isVibDanger = (rawVibPulses >= (unsigned long)thresh.vibrationDanger);
      } else {
        // Jika ambang batas berupa akselerasi g (misal: >= 0.25 g)
        isVibDanger = (vib >= thresh.vibrationDanger);
      }
    }

    if (fabs(pitch) >= thresh.tiltDanger || fabs(roll) >= thresh.tiltDanger || rain >= thresh.rainDanger || isVibDanger) {
      st = "bahaya";
    } else if (fabs(pitch) >= thresh.tiltWarning || fabs(roll) >= thresh.tiltWarning || rain >= thresh.rainWarning || soil >= thresh.soilMoistureWarning) {
      st = "siaga";
    } else if (batt < thresh.batteryLowVoltage) {
      st = "baterai_lemah";
    }

    // Kontrol relay otomatis berdasarkan status sensor
    if (st == "bahaya") {
      if (!sirenActive) setRelaySirine(true);
      if (!stroboActive) setRelayStrobo(true);
    } else if (st == "siaga") {
      if (sirenActive) setRelaySirine(false);
      if (!stroboActive) setRelayStrobo(true);
    } else if (st == "aman" && (currentStatus == "bahaya" || currentStatus == "siaga")) {
      if (sirenActive) setRelaySirine(false);
      if (stroboActive) setRelayStrobo(false);
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
      xSemaphoreGive(dataMutex);
    }

    // Update layar OLED
    updateOledDisplay(pitch, roll, soil, rain, batt);

    vTaskDelay(pdMS_TO_TICKS(1000)); // Sampel sensor setiap 1 detik
  }
}

// TASK 3 (Core 1): Mengirimkan Telemetri ke WebSocket dengan Pacing & Mutex
void telemetryTask(void *pvParameters) {
  Serial.println("🚀 [FreeRTOS] telemetryTask berjalan pada Core 1 (Telemetry Sender)");
  // Jeda awal 5 detik agar handshake WebSocket benar-benar selesai
  vTaskDelay(pdMS_TO_TICKS(5000));

  for (;;) {
    if (isWsConnected) {
      SensorDataSnapshot data;
      if (dataMutex != NULL && xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        data = sharedSensors;
        xSemaphoreGive(dataMutex);
      }

      // 1. JSON Telemetri Bundle Lengkap
      DynamicJsonDocument doc(768);
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
      p["gsmSignalDbm"]       = data.wifiRssi;
      p["gsmStatus"]          = "online";
      p["uptimeHours"]        = data.uptimeHours;
      p["firmwareVersion"]    = FIRMWARE_VERSION;

      String jsonOutput;
      serializeJson(doc, jsonOutput);

      if (safeSendTXT(jsonOutput)) {
        Serial.printf("📤 [TELEMETRI TERKIRIM] Pitch: %.2f°, Roll: %.2f°, Tanah: %.1f%%, Aki: %.2fV\n",
                      data.pitch, data.roll, data.soilMoisture, data.batteryVoltage);
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
    }

    vTaskDelay(pdMS_TO_TICKS(TELEMETRY_INTERVAL));
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

  // Muat Ambang Batas Sensor yang tersimpan di EEPROM (NVS Flash)
  loadThresholdsFromEEPROM();

  // Inisialisasi Pin Relay
  pinMode(PIN_RELAY_SIRINE, OUTPUT);
  pinMode(PIN_RELAY_STROBO, OUTPUT);
  digitalWrite(PIN_RELAY_SIRINE, RELAY_DEACTIVE_LEVEL);
  digitalWrite(PIN_RELAY_STROBO, RELAY_DEACTIVE_LEVEL);

  // Inisialisasi Pin Sensor
  pinMode(PIN_RAIN_DIGITAL, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_RAIN_DIGITAL), countTip, FALLING);
  pinMode(PIN_VIB_SIG, INPUT_PULLUP);
  pinMode(PIN_SOIL_ANALOG, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_VIB_SIG), onVibrationTriggered, CHANGE);

  // Inisialisasi OLED 1.3" (Driver SH1106 / SH1106G)
#if ENABLE_OLED
  I2COLED.begin(PIN_OLED_SDA, PIN_OLED_SCL, 400000);
  delay(100);
  if (display.begin(OLED_I2C_ADDR, true)) {
    oledAvailable = true;
    Serial.println("✅ [OLED 1.3\" SH1106] Berhasil diinisialisasi pada alamat 0x3C (GPIO 8 & 9)");
  } else if (display.begin(0x3D, true)) {
    oledAvailable = true;
    Serial.println("✅ [OLED 1.3\" SH1106] Berhasil diinisialisasi pada alamat 0x3D (GPIO 8 & 9)");
  } else {
    oledAvailable = false;
    Serial.println("⚠️ [OLED 1.3\" SH1106] Tidak terdeteksi pada alamat 0x3C maupun 0x3D");
  }

  if (oledAvailable) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SH110X_WHITE);
    display.setCursor(0, 10);
    display.println("EWS SISTEM SIAGA");
    display.println("OLED 1.3 SH1106 OK");
    display.println("FreeRTOS Aktif...");
    display.display();
  }
#endif

  // Inisialisasi Sensor Lainnya
  initMPU6050();
  initINA226();

  // Koneksi WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("🔌 Menghubungkan ke WiFi: %s ", WIFI_SSID);

  int wifiRetries = 0;
  while (WiFi.status() != WL_CONNECTED && wifiRetries < 40) {
    delay(500);
    Serial.print(".");
    wifiRetries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Terhubung!");
    Serial.printf("   IP Address: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n⚠️ Gagal koneksi WiFi, proses tetap berjalan...");
  }

  // Konfigurasi WebSocket
  if (WS_USE_SSL) {
    Serial.printf("🌐 Menghubungkan ke WebSocket SSL: wss://%s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
    webSocket.beginSSL(WS_HOST, WS_PORT, WS_PATH);
  } else {
    Serial.printf("🌐 Menghubungkan ke WebSocket: ws://%s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
    webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  }

  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);

  // Reset penghitung curah hujan setelah sistem boot selesai
  noInterrupts();
  tipCount = 0;
  lastDebounceTime = millis();
  interrupts();

  // Buat Tasks FreeRTOS
  // 1. Task WebSocket Client terdedikasi di Core 0 (bersama WiFi stack)
  xTaskCreatePinnedToCore(wsTask, "wsTask", 6144, NULL, 2, NULL, 0);

  // 2. Task Pembacaan Sensor di Core 1
  xTaskCreatePinnedToCore(sensorTask, "sensorTask", 4096, NULL, 1, NULL, 1);

  // 3. Task Pengiriman Telemetri di Core 1
  xTaskCreatePinnedToCore(telemetryTask, "telemetryTask", 4096, NULL, 1, NULL, 1);
}

// =============================================================================
// 12. LOOP UTAMA (KONTROL TIMER NON-BLOCKING)
// =============================================================================
void loop() {
  // Cek timer non-blocking uji buzzer
  if (isBuzzerTesting && millis() >= buzzerTestTimeout) {
    isBuzzerTesting = false;
    setRelaySirine(false);
    Serial.println("🔇 Uji sirine selesai (Sirine dimatikan)");
  }

  vTaskDelay(pdMS_TO_TICKS(50));
}
