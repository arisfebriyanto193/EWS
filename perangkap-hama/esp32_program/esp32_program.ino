/*
 ==============================================================================
  PROJEK         : PENGENDALI & PERANGKAP HAMA OTOMATIS (SMART PEST TRAP)
  MIKROKONTROLER : ESP32 WROOM (30 PIN) - DUAL CORE & FREERTOS MUTEX
  SKEMATIK       : Schematic_perangkap_hama_2026-10-03.pdf
 ==============================================================================
  ARSITEKTUR DUAL CORE & FREERTOS MUTEX:
  ------------------------------------------------------------------------------
  CORE 0 (Networking & Web Interface):
    - WiFi SoftAP & Captive Portal DNS Server (192.168.4.1)
    - WebServer Async/HTTP Request Handlers (/api/status, /api/schedule, dll)
    - Thread-safe membaca & menulis data sistem menggunakan FreeRTOS Mutex.

  CORE 1 (Real-Time Control, Sensor & I2C Bus):
    - Sensor ToF VL53L0X: Deteksi cepat halangan/hama tanpa terinterupsi WiFi.
    - Relay 1 (GPIO 14 - in1): Pemicu zapper/jebakan hama saat objek terdeteksi.
    - Relay 2 (GPIO 12 - in2): Pengendali Lampu UV otomatis mengikuti jadwal RTC.
    - Relay 3 (GPIO 13 - in3): Relay auxiliary/cadangan.
    - RTC DS3231: Manajemen jadwal operasional (mendukung jadwal lintas malam).
    - Sensor INA226: Pemantauan tegangan aki, arus, dan daya real-time.
    - OLED SSD1306 (128x64): Antarmuka display multi-halaman & status sistem.
    - Tombol Fisik (bt1: D25, bt2: D26, bt3: D27): Navigasi display, mode, & reset.
    - Eksklusif menangani I2C bus sehingga terhindar dari tabrakan multi-thread.
 ==============================================================================
*/

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>

// Library Display & Sensor I2C
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_VL53L0X.h>
#include <RTClib.h>
#include <INA226_WE.h>

// ==================== DEFINISI PIN SESUAI SKEMATIK ====================
#define PIN_I2C_SDA     21    // D21 - I2C SDA
#define PIN_I2C_SCL     22    // D22 - I2C SCL

#define PIN_RELAY_1     14    // in1 (Relay 1 - Trigger Trap / Zapper)
#define PIN_RELAY_2     12    // in2 (Relay 2 - Lampu UV menyala saat RUNNING)
#define PIN_RELAY_3     13    // in3 (Relay 3 - Auxiliary / Cadangan)

#define PIN_BT1         25    // bt1 - Tombol navigasi display / Manual Zap
#define PIN_BT2         26    // bt2 - Tombol ubah mode operasional (AUTO/ON/OFF)
#define PIN_BT3         27    // bt3 - Tombol reset counter hama (Hold 2 detik)

// ==================== PARAMETER SISTEM ====================
#define SCREEN_WIDTH    128
#define SCREEN_HEIGHT   64
#define OLED_RESET      -1
#define OLED_I2C_ADDR   0x3C
#define INA226_I2C_ADDR 0x40

enum OperationMode {
  MODE_AUTO = 0,        // Berdasarkan jadwal RTC (Lampu UV & Deteksi otomatis)
  MODE_MANUAL_ON = 1,   // Selalu RUNNING (Lampu UV & Deteksi selalu aktif)
  MODE_MANUAL_OFF = 2   // Selalu STANDBY (Lampu UV mati)
};

// ==================== STRUKTUR DATA BERSAMA (SHARED STATE) ====================
struct SystemState {
  // Status Hardware
  bool oledReady;
  bool sensorReady;
  bool rtcReady;
  bool inaReady;

  // Konfigurasi Sistem
  OperationMode mode;
  uint8_t startHour;
  uint8_t startMin;
  uint8_t endHour;
  uint8_t endMin;
  uint16_t distThreshold_mm;
  uint16_t relayPulse_ms;
  uint16_t zapCooldown_ms;
  bool relayActiveLow;
  float shuntResistor_ohm;

  // Data Runtime Sensor & Aktuator
  uint32_t pestCounter;
  uint16_t currentDistance;
  bool isObjectDetected;
  bool isSystemRunning;
  bool relay1State;
  bool relay2State;
  bool relay3State;

  float busVoltage_V;
  float current_mA;
  float power_mW;

  // Waktu RTC
  uint16_t rtcYear;
  uint8_t rtcMonth;
  uint8_t rtcDay;
  uint8_t rtcHour;
  uint8_t rtcMinute;
  uint8_t rtcSecond;

  // Request dari Core 0 (Web) ke Core 1 (Hardware/I2C)
  bool reqSyncRtc;
  uint16_t reqYear;
  uint8_t reqMonth, reqDay, reqHour, reqMin, reqSec;

  bool reqResetCounter;
  uint8_t reqManualRelay; // 0: none, 1: trigger R1, 2: toggle R2, 3: toggle R3
  bool reqSaveConfig;
  bool reqSaveCounter;
};

// Instansiasi data bersama dan Mutex FreeRTOS
SystemState sysData;
SemaphoreHandle_t dataMutex = NULL;

// Objek Perangkat Keras
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Adafruit_VL53L0X sensorVL53 = Adafruit_VL53L0X();
RTC_DS3231 rtc;
INA226_WE ina226(INA226_I2C_ADDR);
WebServer server(80);
DNSServer dnsServer;
Preferences prefs;

// Task Handle Core 0
TaskHandle_t taskWebHandle = NULL;

// Runtime non-blocking timer untuk Core 1
unsigned long lastSensorReadTime = 0;
unsigned long lastInaReadTime    = 0;
unsigned long lastRtcReadTime    = 0;
unsigned long lastOledUpdateTime = 0;
unsigned long relay1TurnOffTime  = 0;
unsigned long zapCooldownTimer   = 0;

uint8_t oledCurrentPage = 0;
const uint8_t OLED_TOTAL_PAGES = 3;
unsigned long lastPageAutoRotate = 0;
bool pageAutoRotate = true;

// Debounce Tombol
int lastBt1State = HIGH;
int lastBt2State = HIGH;
int lastBt3State = HIGH;
unsigned long bt1DebounceTime = 0;
unsigned long bt2DebounceTime = 0;
unsigned long bt3DebounceTime = 0;
unsigned long bt3PressStartTime = 0;
const unsigned long DEBOUNCE_DELAY = 50;

// Kredensial WiFi SoftAP
const char* apSSID = "Perangkap-Hama-ESP32";
const char* apPass = "12345678";

// ==================== PROTOTYPE FUNGSI ====================
void taskWebServerCore0(void *pvParameters);
void setupHardwareCore1();
void readVL53L0XCore1();
void readINA226Core1();
void readRTCCore1();
void checkScheduledOperationCore1();
void handleButtonsCore1();
void updateDisplayCore1();
void handlePendingWebRequestsCore1();
void loadConfigurations();
void saveConfigurations();
void savePestCounter();

// Web Server Handlers (Core 0)
void handleRoot();
void handleApiStatus();
void handleSaveSchedule();
void handleSaveSettings();
void handleSyncRtc();
void handleResetCounter();
void handleManualRelay();

// Helper Level Relay
inline uint8_t getRelayPinLevel(bool active, bool activeLow) {
  return (activeLow ? (active ? LOW : HIGH) : (active ? HIGH : LOW));
}

// ==================== SETUP (DIJALANKAN DI CORE 1) ====================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println(F("\n======================================================="));
  Serial.println(F("  SMART PEST TRAP - ESP32 DUAL CORE & FREERTOS MUTEX   "));
  Serial.println(F("======================================================="));

  // 1. Buat Mutex FreeRTOS untuk proteksi data bersama antar Core
  dataMutex = xSemaphoreCreateMutex();
  if (dataMutex == NULL) {
    Serial.println(F("[FATAL] Gagal membuat dataMutex FreeRTOS!"));
    while (1) { delay(1000); }
  }

  // Inisialisasi default nilai sysData
  memset(&sysData, 0, sizeof(SystemState));
  sysData.mode = MODE_AUTO;
  sysData.startHour = 18;
  sysData.startMin = 0;
  sysData.endHour = 2;
  sysData.endMin = 0;
  sysData.distThreshold_mm = 100;
  sysData.relayPulse_ms = 500;
  sysData.zapCooldown_ms = 800;
  sysData.relayActiveLow = true;
  sysData.shuntResistor_ohm = 0.1;

  // 2. Inisialisasi GPIO Pin Relay & Tombol
  pinMode(PIN_RELAY_1, OUTPUT);
  pinMode(PIN_RELAY_2, OUTPUT);
  pinMode(PIN_RELAY_3, OUTPUT);

  digitalWrite(PIN_RELAY_1, getRelayPinLevel(false, sysData.relayActiveLow));
  digitalWrite(PIN_RELAY_2, getRelayPinLevel(false, sysData.relayActiveLow));
  digitalWrite(PIN_RELAY_3, getRelayPinLevel(false, sysData.relayActiveLow));

  pinMode(PIN_BT1, INPUT_PULLUP);
  pinMode(PIN_BT2, INPUT_PULLUP);
  pinMode(PIN_BT3, INPUT_PULLUP);

  // 3. Baca Konfigurasi dari Memori Flash NVS
  loadConfigurations();

  // 4. Inisialisasi I2C Bus (SDA D21, SCL D22) & Sensor di Core 1
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(400000); // 400kHz Fast I2C
  setupHardwareCore1();

  // 5. Luncurkan Task Web Server di CORE 0 (Pinned to Core 0)
  xTaskCreatePinnedToCore(
    taskWebServerCore0,   // Fungsi task
    "TaskWebCore0",       // Nama task
    8192,                 // Ukuran stack (byte)
    NULL,                 // Parameter task
    1,                    // Prioritas (1 = normal background)
    &taskWebHandle,       // Handle task
    0                     // ID Core: 0
  );

  Serial.printf("[SYSTEM] Inisialisasi Selesai. Core Kontrol: %d, Task Web: Core 0.\n", xPortGetCoreID());
}

// ==================== CORE 0: TASK WEB SERVER & CAPTIVE PORTAL ====================
void taskWebServerCore0(void *pvParameters) {
  Serial.printf("[CORE 0] Task Web Server aktif pada Core ID: %d\n", xPortGetCoreID());

  // Setup WiFi Access Point
  WiFi.mode(WIFI_AP);
  WiFi.softAP(apSSID, apPass);

  IPAddress apIP = WiFi.softAPIP();
  Serial.printf("[WIFI] Access Point '%s' Aktif. IP: %s\n", apSSID, apIP.toString().c_str());

  // Captive Portal DNS
  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(53, "*", apIP);

  // Daftarkan Endpoint Web Server
  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/status", HTTP_GET, handleApiStatus);
  server.on("/api/schedule", HTTP_POST, handleSaveSchedule);
  server.on("/api/settings", HTTP_POST, handleSaveSettings);
  server.on("/api/sync-rtc", HTTP_POST, handleSyncRtc);
  server.on("/api/reset-count", HTTP_POST, handleResetCounter);
  server.on("/api/relay-test", HTTP_POST, handleManualRelay);

  // Captive Portal Fallbacks
  server.on("/generate_204", HTTP_GET, handleRoot);
  server.on("/canonical.html", HTTP_GET, handleRoot);
  server.onNotFound(handleRoot);

  server.begin();
  Serial.println(F("[WEB] HTTP Server Port 80 Berjalan di Core 0."));

  // Loop Task Core 0
  for (;;) {
    server.handleClient();
    dnsServer.processNextRequest();
    vTaskDelay(pdMS_TO_TICKS(5)); // Memberi jeda ke scheduler FreeRTOS Core 0
  }
}

// ==================== CORE 1: LOOP KONTROL & REAL-TIME SENSING ====================
void loop() {
  unsigned long currentMillis = millis();

  // 1. Eksekusi Request Tertunda dari Core 0 (Web UI)
  handlePendingWebRequestsCore1();

  // 2. Baca RTC setiap 1000 ms & Evaluasi Jadwal
  if (currentMillis - lastRtcReadTime >= 1000) {
    lastRtcReadTime = currentMillis;
    readRTCCore1();
    checkScheduledOperationCore1();
  }

  // 3. Kontrol Relay 1 (Zapper Trigger Timer)
  if (sysData.relay1State && currentMillis >= relay1TurnOffTime) {
    sysData.relay1State = false;
    digitalWrite(PIN_RELAY_1, getRelayPinLevel(false, sysData.relayActiveLow));
  }

  // 4. Kontrol Relay 2 (Lampu UV) mengikuti status isSystemRunning
  if (sysData.relay2State != sysData.isSystemRunning) {
    sysData.relay2State = sysData.isSystemRunning;
    digitalWrite(PIN_RELAY_2, getRelayPinLevel(sysData.relay2State, sysData.relayActiveLow));
    Serial.printf("[UV] Lampu UV (Relay 2): %s\n", sysData.relay2State ? "MENYALA" : "PADAM");
  }

  // 5. Pembacaan Sensor ToF VL53L0X setiap 60 ms
  if (currentMillis - lastSensorReadTime >= 60) {
    lastSensorReadTime = currentMillis;
    readVL53L0XCore1();
  }

  // 6. Pembacaan Sensor INA226 setiap 500 ms
  if (currentMillis - lastInaReadTime >= 500) {
    lastInaReadTime = currentMillis;
    readINA226Core1();
  }

  // 7. Polling Tombol Fisik
  handleButtonsCore1();

  // 8. Update Layar OLED setiap 200 ms
  if (currentMillis - lastOledUpdateTime >= 200) {
    lastOledUpdateTime = currentMillis;
    updateDisplayCore1();
  }

  // 9. Auto-rotate Halaman OLED setiap 5 detik
  if (pageAutoRotate && (currentMillis - lastPageAutoRotate >= 5000)) {
    lastPageAutoRotate = currentMillis;
    oledCurrentPage = (oledCurrentPage + 1) % OLED_TOTAL_PAGES;
  }

  // Beri yield sejenak agar watchdog timer Core 1 tenang
  vTaskDelay(pdMS_TO_TICKS(2));
}

// ==================== INISIALISASI HARDWARE DI CORE 1 ====================
void setupHardwareCore1() {
  // Inisialisasi Layar OLED SSD1306
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    sysData.oledReady = true;
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(10, 15);
    display.println(F("PERANGKAP HAMA"));
    display.setCursor(10, 30);
    display.println(F("DUAL CORE RTOS..."));
    display.display();
    Serial.println(F("[HARDWARE] OLED SSD1306 Siap."));
  } else {
    Serial.println(F("[ERROR] OLED SSD1306 Gagal diinisialisasi!"));
  }

  // Inisialisasi RTC DS3231
  if (rtc.begin()) {
    sysData.rtcReady = true;
    if (rtc.lostPower()) {
      Serial.println(F("[RTC] DS3231 kehilangan daya, menyetel waktu default!"));
      rtc.adjust(DateTime(2026, 10, 3, 18, 0, 0));
    }
    DateTime now = rtc.now();
    sysData.rtcYear   = now.year();
    sysData.rtcMonth  = now.month();
    sysData.rtcDay    = now.day();
    sysData.rtcHour   = now.hour();
    sysData.rtcMinute = now.minute();
    sysData.rtcSecond = now.second();
    Serial.printf("[HARDWARE] RTC DS3231 Siap: %02d:%02d:%02d\n", now.hour(), now.minute(), now.second());
  } else {
    Serial.println(F("[ERROR] RTC DS3231 Tidak Terdeteksi di I2C!"));
  }

  // Inisialisasi Sensor VL53L0X
  if (sensorVL53.begin()) {
    sysData.sensorReady = true;
    Serial.println(F("[HARDWARE] Sensor ToF VL53L0X Siap."));
  } else {
    Serial.println(F("[ERROR] Sensor VL53L0X Gagal diinisialisasi!"));
  }

  // Inisialisasi Sensor INA226
  if (ina226.init()) {
    sysData.inaReady = true;
    ina226.setResistorRange(sysData.shuntResistor_ohm, 3.2);
    Serial.println(F("[HARDWARE] INA226 Siap dan Dikonfigurasi."));
  } else {
    Serial.println(F("[ERROR] Sensor INA226 Tidak Terdeteksi di I2C!"));
  }

  delay(400);
}

// ==================== CORE 1: HANDLE REQUEST DARI WEB SERVER ====================
void handlePendingWebRequestsCore1() {
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
    // 1. Permintaan Sinkronisasi RTC
    if (sysData.reqSyncRtc) {
      sysData.reqSyncRtc = false;
      if (sysData.rtcReady) {
        rtc.adjust(DateTime(sysData.reqYear, sysData.reqMonth, sysData.reqDay,
                            sysData.reqHour, sysData.reqMin, sysData.reqSec));
        DateTime n = rtc.now();
        sysData.rtcYear   = n.year();
        sysData.rtcMonth  = n.month();
        sysData.rtcDay    = n.day();
        sysData.rtcHour   = n.hour();
        sysData.rtcMinute = n.minute();
        sysData.rtcSecond = n.second();
        Serial.printf("[CORE 1] Waktu RTC Diperbarui: %02d/%02d/%04d %02d:%02d:%02d\n",
                      n.day(), n.month(), n.year(), n.hour(), n.minute(), n.second());
      }
    }

    // 2. Permintaan Reset Counter
    if (sysData.reqResetCounter) {
      sysData.reqResetCounter = false;
      sysData.pestCounter = 0;
      savePestCounter();
      Serial.println(F("[CORE 1] Counter Hama di-Reset oleh Web UI."));
    }

    // 3. Permintaan Tes Manual Relay
    if (sysData.reqManualRelay > 0) {
      uint8_t r = sysData.reqManualRelay;
      sysData.reqManualRelay = 0;
      if (r == 1) {
        sysData.relay1State = true;
        digitalWrite(PIN_RELAY_1, getRelayPinLevel(true, sysData.relayActiveLow));
        relay1TurnOffTime = millis() + sysData.relayPulse_ms;
        Serial.println(F("[CORE 1] Manual Trigger Relay 1 via Web!"));
      } else if (r == 2) {
        sysData.isSystemRunning = !sysData.isSystemRunning;
        sysData.mode = sysData.isSystemRunning ? MODE_MANUAL_ON : MODE_MANUAL_OFF;
        saveConfigurations();
        Serial.printf("[CORE 1] Toggle Lampu UV via Web: %s\n", sysData.isSystemRunning ? "ON" : "OFF");
      }
    }

    // 4. Permintaan Simpan Konfigurasi
    if (sysData.reqSaveConfig) {
      sysData.reqSaveConfig = false;
      saveConfigurations();
    }

    xSemaphoreGive(dataMutex);
  }
}

// ==================== CORE 1: PEMBACAAN SENSOR VL53L0X ====================
void readVL53L0XCore1() {
  if (!sysData.sensorReady) return;

  VL53L0X_RangingMeasurementData_t measure;
  sensorVL53.rangingTest(&measure, false);

  uint16_t dist = (measure.RangeStatus != 4) ? measure.RangeMilliMeter : 9999;

  bool triggerZap = false;
  unsigned long now = millis();

  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(15)) == pdTRUE) {
    sysData.currentDistance = dist;

    if (dist > 5 && dist <= sysData.distThreshold_mm) {
      sysData.isObjectDetected = true;
      if (sysData.isSystemRunning && (now >= zapCooldownTimer)) {
        sysData.pestCounter++;
        sysData.relay1State = true;
        relay1TurnOffTime = now + sysData.relayPulse_ms;
        zapCooldownTimer  = now + sysData.relayPulse_ms + sysData.zapCooldown_ms;
        triggerZap = true;
        sysData.reqSaveCounter = true;
      }
    } else {
      sysData.isObjectDetected = false;
    }
    xSemaphoreGive(dataMutex);
  }

  if (triggerZap) {
    digitalWrite(PIN_RELAY_1, getRelayPinLevel(true, sysData.relayActiveLow));
    Serial.printf("[DETEKSI HAMA] Jarak: %d mm | Count: %lu | Relay 1 Triggered!\n",
                  dist, (unsigned long)sysData.pestCounter);
    savePestCounter();
  }
}

// ==================== CORE 1: PEMBACAAN INA226 ====================
void readINA226Core1() {
  if (!sysData.inaReady) return;

  float v = ina226.getBusVoltage_V();
  float c = ina226.getCurrent_mA();
  float p = ina226.getBusPower();

  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(15)) == pdTRUE) {
    sysData.busVoltage_V = v;
    sysData.current_mA   = c;
    sysData.power_mW     = p;
    xSemaphoreGive(dataMutex);
  }
}

// ==================== CORE 1: PEMBACAAN RTC DS3231 ====================
void readRTCCore1() {
  if (!sysData.rtcReady) return;

  DateTime now = rtc.now();

  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(15)) == pdTRUE) {
    sysData.rtcYear   = now.year();
    sysData.rtcMonth  = now.month();
    sysData.rtcDay    = now.day();
    sysData.rtcHour   = now.hour();
    sysData.rtcMinute = now.minute();
    sysData.rtcSecond = now.second();
    xSemaphoreGive(dataMutex);
  }
}

// ==================== CORE 1: EVALUASI JADWAL OPERASIONAL ====================
void checkScheduledOperationCore1() {
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(15)) == pdTRUE) {
    if (sysData.mode == MODE_MANUAL_ON) {
      sysData.isSystemRunning = true;
    } else if (sysData.mode == MODE_MANUAL_OFF) {
      sysData.isSystemRunning = false;
    } else {
      // MODE_AUTO: Hitung Waktu RTC
      if (!sysData.rtcReady) {
        sysData.isSystemRunning = true; // Fallback jika RTC gagal
      } else {
        int currentTotalMin = sysData.rtcHour * 60 + sysData.rtcMinute;
        int startTotalMin   = sysData.startHour * 60 + sysData.startMin;
        int endTotalMin     = sysData.endHour * 60 + sysData.endMin;

        if (startTotalMin <= endTotalMin) {
          // Jadwal siang (misal 08:00 - 17:00)
          sysData.isSystemRunning = (currentTotalMin >= startTotalMin && currentTotalMin < endTotalMin);
        } else {
          // Jadwal lintas malam (misal 18:00 - 02:00)
          sysData.isSystemRunning = (currentTotalMin >= startTotalMin || currentTotalMin < endTotalMin);
        }
      }
    }
    xSemaphoreGive(dataMutex);
  }
}

// ==================== CORE 1: PENANGANAN TOMBOL FISIK ====================
void handleButtonsCore1() {
  unsigned long now = millis();

  // --- TOMBOL 1 (bt1 - GPIO 25): Pindah Halaman OLED ---
  int r1 = digitalRead(PIN_BT1);
  if (r1 != lastBt1State) bt1DebounceTime = now;
  if ((now - bt1DebounceTime) > DEBOUNCE_DELAY) {
    static int s1 = HIGH;
    if (r1 != s1) {
      s1 = r1;
      if (s1 == LOW) {
        pageAutoRotate = false;
        oledCurrentPage = (oledCurrentPage + 1) % OLED_TOTAL_PAGES;
        Serial.printf("[BUTTON 1] Pindah Halaman Display: %d\n", oledCurrentPage);
      }
    }
  }
  lastBt1State = r1;

  // --- TOMBOL 2 (bt2 - GPIO 26): Ubah Mode Operasi (AUTO -> ON -> OFF) ---
  int r2 = digitalRead(PIN_BT2);
  if (r2 != lastBt2State) bt2DebounceTime = now;
  if ((now - bt2DebounceTime) > DEBOUNCE_DELAY) {
    static int s2 = HIGH;
    if (r2 != s2) {
      s2 = r2;
      if (s2 == LOW) {
        if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
          if (sysData.mode == MODE_AUTO) sysData.mode = MODE_MANUAL_ON;
          else if (sysData.mode == MODE_MANUAL_ON) sysData.mode = MODE_MANUAL_OFF;
          else sysData.mode = MODE_AUTO;

          sysData.reqSaveConfig = true;
          xSemaphoreGive(dataMutex);
          checkScheduledOperationCore1();
          Serial.printf("[BUTTON 2] Mode diubah: %d\n", sysData.mode);
        }
      }
    }
  }
  lastBt2State = r2;

  // --- TOMBOL 3 (bt3 - GPIO 27): Manual Zap (Klik) / Reset Counter (Hold 2 Detik) ---
  int r3 = digitalRead(PIN_BT3);
  if (r3 != lastBt3State) {
    bt3DebounceTime = now;
    if (r3 == LOW) {
      bt3PressStartTime = now;
    } else {
      unsigned long pressDuration = now - bt3PressStartTime;
      if (pressDuration >= 50 && pressDuration < 2000) {
        // Klik singkat: Uji coba trigger Relay 1
        sysData.relay1State = true;
        digitalWrite(PIN_RELAY_1, getRelayPinLevel(true, sysData.relayActiveLow));
        relay1TurnOffTime = now + sysData.relayPulse_ms;
        Serial.println(F("[BUTTON 3] Manual Test Zap!"));
      }
    }
  }
  if (r3 == LOW && (now - bt3PressStartTime >= 2000)) {
    // Tahan lebih dari 2 detik: Reset Counter Hama
    if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
      if (sysData.pestCounter != 0) {
        sysData.pestCounter = 0;
        savePestCounter();
        Serial.println(F("[BUTTON 3] Reset Hitungan Hama!"));
        if (sysData.oledReady) {
          display.clearDisplay();
          display.setTextSize(2);
          display.setCursor(15, 25);
          display.println(F("RESET OK!"));
          display.display();
          delay(400);
        }
      }
      xSemaphoreGive(dataMutex);
    }
  }
  lastBt3State = r3;
}

// ==================== CORE 1: TAMPILAN OLED SSD1306 ====================
void updateDisplayCore1() {
  if (!sysData.oledReady) return;

  SystemState local;
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
    local = sysData;
    xSemaphoreGive(dataMutex);
  } else {
    return;
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // HEADER TAMPILAN
  display.setTextSize(1);
  display.setCursor(0, 0);
  if (local.rtcReady) {
    display.printf("%02d:%02d:%02d", local.rtcHour, local.rtcMinute, local.rtcSecond);
  } else {
    display.print(F("00:00:00"));
  }

  display.setCursor(75, 0);
  if (local.isSystemRunning) {
    display.print(F("[RUN:UV]"));
  } else {
    display.print(F("[STBY]"));
  }

  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  // ISI HALAMAN
  if (oledCurrentPage == 0) {
    // HALAMAN 1: TOTAL HAMA & STATUS UTAMA
    display.setTextSize(1);
    display.setCursor(0, 14);
    display.print(F("TOTAL HAMA:"));

    display.setTextSize(2);
    display.setCursor(20, 24);
    display.printf("%04lu", (unsigned long)local.pestCounter);
    display.setTextSize(1);
    display.print(F(" ekor"));

    display.setCursor(0, 44);
    display.print(F("Jarak: "));
    if (local.sensorReady) {
      if (local.currentDistance >= 8000) display.print(F(">200cm"));
      else display.printf("%d mm", local.currentDistance);
    } else {
      display.print(F("Error!"));
    }

    if (local.relay1State) {
      display.setCursor(85, 44);
      display.print(F("*ZAP!*"));
    }

    display.setCursor(0, 55);
    display.printf("Aki:%4.1fV | %3.0fmA", local.busVoltage_V, local.current_mA);

  } else if (oledCurrentPage == 1) {
    // HALAMAN 2: MONITOR DAYA INA226
    display.setTextSize(1);
    display.setCursor(0, 14);
    display.print(F("--- MONITOR DAYA ---"));

    display.setCursor(0, 27);
    display.printf("Tegangan : %5.2f V", local.busVoltage_V);

    display.setCursor(0, 39);
    display.printf("Arus     : %5.0f mA", local.current_mA);

    display.setCursor(0, 51);
    display.printf("Daya     : %5.2f W", local.power_mW / 1000.0);

  } else if (oledCurrentPage == 2) {
    // HALAMAN 3: INFO JADWAL & AP
    display.setTextSize(1);
    display.setCursor(0, 14);
    display.print(F("--- JADWAL & AP ---"));

    display.setCursor(0, 26);
    display.printf("Mode: %s", (local.mode == MODE_AUTO) ? "AUTO" :
                              (local.mode == MODE_MANUAL_ON) ? "FORCE ON" : "OFF");

    display.setCursor(0, 37);
    display.printf("Jadwal: %02d:%02d-%02d:%02d", local.startHour, local.startMin, local.endHour, local.endMin);

    display.setCursor(0, 49);
    display.print(F("IP: 192.168.4.1"));

    display.setCursor(0, 57);
    display.printf("UV Lamp: %s", local.relay2State ? "MENYALA" : "PADAM");
  }

  display.display();
}

// ==================== PENYIMPANAN NVS (PREFERENCES) ====================
void loadConfigurations() {
  prefs.begin("pest_trap", true);
  sysData.pestCounter       = prefs.getULong("count", 0);
  sysData.mode              = (OperationMode)prefs.getInt("mode", (int)MODE_AUTO);
  sysData.startHour         = prefs.getUChar("sHour", 18);
  sysData.startMin          = prefs.getUChar("sMin", 0);
  sysData.endHour           = prefs.getUChar("eHour", 2);
  sysData.endMin            = prefs.getUChar("eMin", 0);
  sysData.distThreshold_mm  = prefs.getUShort("distTh", 100);
  sysData.relayPulse_ms     = prefs.getUShort("pulse", 500);
  sysData.zapCooldown_ms    = prefs.getUShort("cool", 800);
  sysData.relayActiveLow    = prefs.getBool("actLow", true);
  sysData.shuntResistor_ohm = prefs.getFloat("shunt", 0.1);
  prefs.end();

  Serial.printf("[NVS] Data Dimuat: Count=%lu, Mode=%d, Jadwal=%02d:%02d s/d %02d:%02d\n",
                (unsigned long)sysData.pestCounter, sysData.mode,
                sysData.startHour, sysData.startMin, sysData.endHour, sysData.endMin);
}

void saveConfigurations() {
  prefs.begin("pest_trap", false);
  prefs.putInt("mode", (int)sysData.mode);
  prefs.putUChar("sHour", sysData.startHour);
  prefs.putUChar("sMin", sysData.startMin);
  prefs.putUChar("eHour", sysData.endHour);
  prefs.putUChar("eMin", sysData.endMin);
  prefs.putUShort("distTh", sysData.distThreshold_mm);
  prefs.putUShort("pulse", sysData.relayPulse_ms);
  prefs.putUShort("cool", sysData.zapCooldown_ms);
  prefs.putBool("actLow", sysData.relayActiveLow);
  prefs.putFloat("shunt", sysData.shuntResistor_ohm);
  prefs.end();
  Serial.println(F("[NVS] Konfigurasi berhasil disimpan ke flash."));
}

void savePestCounter() {
  prefs.begin("pest_trap", false);
  prefs.putULong("count", sysData.pestCounter);
  prefs.end();
}

// ==================== CORE 0: WEB SERVER HANDLERS ====================
void handleRoot() {
  String html = F(
    "<!DOCTYPE html><html lang='id'>"
    "<head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'>"
    "<title>Smart Pest Trap - ESP32 Dual Core</title>"
    "<style>"
    ":root{--bg:#0f172a;--card:#1e293b;--accent:#10b981;--accent-hover:#059669;--text:#f8fafc;--sub:#94a3b8;--warn:#f59e0b;--danger:#ef4444;--border:#334155;}"
    "*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}"
    "body{background:var(--bg);color:var(--text);padding:16px;min-height:100vh;display:flex;flex-direction:column;align-items:center;}"
    ".container{width:100%;max-width:700px;display:flex;flex-direction:column;gap:16px;}"
    ".header{background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid var(--border);border-radius:16px;padding:20px;text-align:center;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);}"
    ".header h1{font-size:22px;color:var(--accent);margin-bottom:6px;display:flex;align-items:center;justify-content:center;gap:8px;}"
    ".header p{font-size:13px;color:var(--sub);}"
    ".badge-core{background:rgba(56,189,248,0.2);color:#38bdf8;border:1px solid #0284c7;font-size:11px;padding:2px 8px;border-radius:12px;margin-top:4px;display:inline-block;}"
    ".card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px;box-shadow:0 4px 12px rgba(0,0,0,0.15);}"
    ".card-title{font-size:16px;font-weight:600;margin-bottom:14px;color:var(--text);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:8px;}"
    ".grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}"
    ".stat-box{background:#0f172a;border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center;}"
    ".stat-val{font-size:26px;font-weight:700;color:var(--accent);margin-top:4px;}"
    ".stat-lbl{font-size:11px;color:var(--sub);text-transform:uppercase;letter-spacing:0.5px;}"
    ".badge{display:inline-block;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;}"
    ".badge-run{background:rgba(16,185,129,0.2);color:#34d399;border:1px solid #10b981;}"
    ".badge-stby{background:rgba(245,158,11,0.2);color:#fbbf24;border:1px solid #f59e0b;}"
    ".badge-off{background:rgba(239,68,68,0.2);color:#f87171;border:1px solid #ef4444;}"
    "label{font-size:13px;color:var(--sub);margin-bottom:4px;display:block;}"
    "input,select{width:100%;padding:10px 12px;background:#0f172a;border:1px solid var(--border);border-radius:8px;color:#fff;font-size:14px;outline:none;transition:0.2s;}"
    "input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 2px rgba(16,185,129,0.25);}"
    ".form-group{margin-bottom:12px;}"
    "button{background:var(--accent);color:#0f172a;font-weight:700;border:none;border-radius:8px;padding:12px 16px;cursor:pointer;width:100%;font-size:14px;transition:0.2s;display:inline-flex;align-items:center;justify-content:center;gap:6px;}"
    "button:hover{background:var(--accent-hover);color:#fff;}"
    ".btn-secondary{background:#334155;color:#f8fafc;}"
    ".btn-secondary:hover{background:#475569;}"
    ".btn-danger{background:#dc2626;color:#fff;}"
    ".btn-danger:hover{background:#b91c1c;}"
    ".btn-group{display:flex;gap:8px;margin-top:6px;}"
    ".toast{padding:10px;border-radius:8px;font-size:13px;text-align:center;display:none;margin-top:10px;}"
    ".footer{text-align:center;font-size:12px;color:var(--sub);margin-top:10px;}"
    "@media (max-width:500px){.grid-2{grid-template-columns:1fr;}}"
    "</style></head><body>"
    "<div class='container'>"
    "  <div class='header'>"
    "    <h1>&#x1F99F; SMART PEST TRAP</h1>"
    "    <p>Pengendali Perangkap Hama & Lampu UV Otomatis berbasis ESP32</p>"
    "    <span class='badge-core'>FreeRTOS Dual-Core & Mutex Enabled</span>"
    "  </div>"

    "  <!-- STATUS REALTIME -->"
    "  <div class='card'>"
    "    <div class='card-title'>"
    "      <span>Status Operasional</span>"
    "      <span id='statusBadge' class='badge badge-stby'>MEMUAT...</span>"
    "    </div>"
    "    <div class='grid-2'>"
    "      <div class='stat-box'>"
    "        <div class='stat-lbl'>Hama Terdeteksi</div>"
    "        <div class='stat-val' id='valCount'>0</div>"
    "      </div>"
    "      <div class='stat-box'>"
    "        <div class='stat-lbl'>Jarak Sensor ToF</div>"
    "        <div class='stat-val' id='valDist'>- mm</div>"
    "      </div>"
    "    </div>"
    "    <div class='grid-2' style='margin-top:10px;'>"
    "      <div class='stat-box'>"
    "        <div class='stat-lbl'>Tegangan Aki / Solar</div>"
    "        <div class='stat-val' style='color:#38bdf8;' id='valVolt'>0.0 V</div>"
    "      </div>"
    "      <div class='stat-box'>"
    "        <div class='stat-lbl'>Arus & Daya</div>"
    "        <div class='stat-val' style='color:#a78bfa;' id='valAmp'>0 mA</div>"
    "      </div>"
    "    </div>"
    "    <div class='grid-2' style='margin-top:10px;'>"
    "      <div class='stat-box'>"
    "        <div class='stat-lbl'>Waktu RTC (DS3231)</div>"
    "        <div style='font-size:16px;font-weight:600;margin-top:6px;color:#f8fafc;' id='valRtc'>--:--:--</div>"
    "      </div>"
    "      <div class='stat-box'>"
    "        <div class='stat-lbl'>Lampu UV (Relay 2)</div>"
    "        <div style='font-size:16px;font-weight:600;margin-top:6px;' id='valUvStatus'>-</div>"
    "      </div>"
    "    </div>"
    "    <div style='margin-top:12px;display:flex;gap:8px;'>"
    "      <button type='button' class='btn-danger' onclick='resetPestCount()'>&#x21BB; Reset Hitungan Hama</button>"
    "    </div>"
    "  </div>"

    "  <!-- ATUR JADWAL & MODE -->"
    "  <div class='card'>"
    "    <div class='card-title'>&#x23F0; Pengaturan Jadwal & Mode Operasi</div>"
    "    <form id='scheduleForm' onsubmit='saveSchedule(event)'>"
    "      <div class='form-group'>"
    "        <label>Mode Operasi:</label>"
    "        <select id='modeSelect' name='mode'>"
    "          <option value='0'>Otomatis (Berdasarkan Jadwal RTC)</option>"
    "          <option value='1'>Manual ON (Selalu Aktif / UV Menyala)</option>"
    "          <option value='2'>Manual OFF (Selalu Mati)</option>"
    "        </select>"
    "      </div>"
    "      <div class='grid-2'>"
    "        <div class='form-group'>"
    "          <label>Waktu Mulai (Jam:Menit):</label>"
    "          <input type='time' id='startTime' name='start' required>"
    "        </div>"
    "        <div class='form-group'>"
    "          <label>Waktu Selesai (Jam:Menit):</label>"
    "          <input type='time' id='endTime' name='end' required>"
    "        </div>"
    "      </div>"
    "      <p style='font-size:12px;color:var(--sub);margin-bottom:12px;'>"
    "        &#x2139; Contoh: Mulai 18:00 (sore) s/d 02:00 (malam). Sistem otomatis menangani jadwal lintas hari/malam."
    "      </p>"
    "      <button type='submit'>Simpan Jadwal Operasi</button>"
    "      <div id='schedToast' class='toast'></div>"
    "    </form>"
    "  </div>"

    "  <!-- SINKRONISASI JAM RTC -->"
    "  <div class='card'>"
    "    <div class='card-title'>&#x1F552; Kalibrasi Waktu RTC DS3231</div>"
    "    <p style='font-size:13px;color:var(--sub);margin-bottom:12px;'>"
    "      Waktu RTC di perangkat: <b id='currentDeviceTime' style='color:#fff;'>--</b>"
    "    </p>"
    "    <div style='display:flex;flex-direction:column;gap:10px;'>"
    "      <button type='button' onclick='syncWithClientTime()'>&#x2699; Sinkronkan dengan Waktu HP / Laptop Ini</button>"
    "      <div id='rtcToast' class='toast'></div>"
    "    </div>"
    "  </div>"

    "  <!-- PENGATURAN PARAMETER SENSOR & RELAY -->"
    "  <div class='card'>"
    "    <div class='card-title'>&#x2699; Pengaturan Parameter Sensor & Relay</div>"
    "    <form id='paramForm' onsubmit='saveSettings(event)'>"
    "      <div class='grid-2'>"
    "        <div class='form-group'>"
    "          <label>Jarak Pemicu Deteksi (mm):</label>"
    "          <input type='number' id='distTh' name='distTh' min='10' max='2000' required>"
    "        </div>"
    "        <div class='form-group'>"
    "          <label>Durasi Nyala Relay 1 (ms):</label>"
    "          <input type='number' id='pulse' name='pulse' min='100' max='5000' required>"
    "        </div>"
    "      </div>"
    "      <div class='grid-2'>"
    "        <div class='form-group'>"
    "          <label>Jeda Cooldown Deteksi (ms):</label>"
    "          <input type='number' id='cool' name='cool' min='100' max='5000' required>"
    "        </div>"
    "        <div class='form-group'>"
    "          <label>Tipe Modul Relay:</label>"
    "          <select id='actLow' name='actLow'>"
    "            <option value='1'>Active LOW (Standar Modul Relay)</option>"
    "            <option value='0'>Active HIGH</option>"
    "          </select>"
    "        </div>"
    "      </div>"
    "      <button type='submit' class='btn-secondary'>Simpan Parameter Sensor</button>"
    "      <div id='paramToast' class='toast'></div>"
    "    </form>"
    "  </div>"

    "  <!-- PENGUJIAN MANUAL RELAY -->"
    "  <div class='card'>"
    "    <div class='card-title'>&#x1F50C; Uji Coba Manual Relay</div>"
    "    <div class='btn-group'>"
    "      <button type='button' class='btn-secondary' onclick='testRelay(1)'>Picu Relay 1 (Zapper)</button>"
    "      <button type='button' class='btn-secondary' onclick='testRelay(2)'>Toggle Relay 2 (UV)</button>"
    "    </div>"
    "  </div>"

    "  <div class='footer'>"
    "    &copy; 2026 Smart Pest Trap System &bull; ESP32 FreeRTOS Dual-Core"
    "  </div>"
    "</div>"

    "<script>"
    "function fetchStatus(){"
    "  fetch('/api/status').then(r=>r.json()).then(d=>{"
    "    document.getElementById('valCount').innerText = d.count;"
    "    document.getElementById('valDist').innerText = (d.dist > 5000 ? '> 2000 mm' : d.dist + ' mm');"
    "    document.getElementById('valVolt').innerText = d.volt.toFixed(2) + ' V';"
    "    document.getElementById('valAmp').innerText = d.current.toFixed(0) + ' mA (' + (d.power/1000).toFixed(2) + ' W)';"
    "    document.getElementById('valRtc').innerText = d.rtcTime;"
    "    document.getElementById('currentDeviceTime').innerText = d.rtcDateTime;"
    "    const b = document.getElementById('statusBadge');"
    "    const uvLbl = document.getElementById('valUvStatus');"
    "    if(d.running){"
    "      b.className='badge badge-run'; b.innerText='RUNNING (AKTIF)';"
    "      uvLbl.innerHTML='<span style=\"color:#34d399;\">&#x25CF; MENYALA</span>';"
    "    } else {"
    "      b.className='badge badge-stby'; b.innerText='STANDBY (MATI)';"
    "      uvLbl.innerHTML='<span style=\"color:#f87171;\">&#x25CF; PADAM</span>';"
    "    }"
    "    if(!window.loadedInitialForm){"
    "      window.loadedInitialForm = true;"
    "      document.getElementById('modeSelect').value = d.mode;"
    "      document.getElementById('startTime').value = String(d.sHour).padStart(2,'0') + ':' + String(d.sMin).padStart(2,'0');"
    "      document.getElementById('endTime').value = String(d.eHour).padStart(2,'0') + ':' + String(d.eMin).padStart(2,'0');"
    "      document.getElementById('distTh').value = d.distTh;"
    "      document.getElementById('pulse').value = d.pulse;"
    "      document.getElementById('cool').value = d.cool;"
    "      document.getElementById('actLow').value = d.actLow ? '1' : '0';"
    "    }"
    "  }).catch(e=>console.error(e));"
    "}"
    "setInterval(fetchStatus, 1500);"
    "fetchStatus();"

    "function showToast(id, msg, isErr){"
    "  const t = document.getElementById(id);"
    "  t.innerText = msg;"
    "  t.style.display = 'block';"
    "  t.style.background = isErr ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)';"
    "  t.style.color = isErr ? '#f87171' : '#34d399';"
    "  t.style.border = isErr ? '1px solid #ef4444' : '1px solid #10b981';"
    "  setTimeout(()=>{ t.style.display='none'; }, 3500);"
    "}"

    "function saveSchedule(e){"
    "  e.preventDefault();"
    "  const f = new FormData(document.getElementById('scheduleForm'));"
    "  fetch('/api/schedule', {method:'POST', body:f})"
    "  .then(r=>r.text()).then(msg=>{"
    "    showToast('schedToast', msg, false);"
    "    fetchStatus();"
    "  }).catch(e=>showToast('schedToast', 'Gagal menyimpan: '+e, true));"
    "}"

    "function saveSettings(e){"
    "  e.preventDefault();"
    "  const f = new FormData(document.getElementById('paramForm'));"
    "  fetch('/api/settings', {method:'POST', body:f})"
    "  .then(r=>r.text()).then(msg=>{"
    "    showToast('paramToast', msg, false);"
    "  }).catch(e=>showToast('paramToast', 'Gagal menyimpan: '+e, true));"
    "}"

    "function syncWithClientTime(){"
    "  const now = new Date();"
    "  const f = new FormData();"
    "  f.append('year', now.getFullYear());"
    "  f.append('month', now.getMonth() + 1);"
    "  f.append('day', now.getDate());"
    "  f.append('hour', now.getHours());"
    "  f.append('min', now.getMinutes());"
    "  f.append('sec', now.getSeconds());"
    "  fetch('/api/sync-rtc', {method:'POST', body:f})"
    "  .then(r=>r.text()).then(msg=>{"
    "    showToast('rtcToast', msg, false);"
    "    fetchStatus();"
    "  }).catch(e=>showToast('rtcToast', 'Gagal sinkronisasi: '+e, true));"
    "}"

    "function resetPestCount(){"
    "  if(!confirm('Apakah Anda yakin ingin me-reset hitungan hama menjadi 0?')) return;"
    "  fetch('/api/reset-count', {method:'POST'})"
    "  .then(r=>r.text()).then(msg=>{"
    "    alert(msg);"
    "    fetchStatus();"
    "  });"
    "}"

    "function testRelay(num){"
    "  const f = new FormData();"
    "  f.append('relay', num);"
    "  fetch('/api/relay-test', {method:'POST', body:f})"
    "  .then(r=>r.text()).then(msg=>{"
    "    fetchStatus();"
    "  });"
    "}"
    "</script>"
    "</body></html>"
  );
  server.send(200, "text/html", html);
}

// API: Mengembalikan status sensor, RTC, dan sistem (Thread-Safe via Mutex)
void handleApiStatus() {
  SystemState local;
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    local = sysData;
    xSemaphoreGive(dataMutex);
  } else {
    server.send(503, "application/json", "{\"error\":\"Mutex timeout\"}");
    return;
  }

  char rtcTimeStr[12] = "--:--:--";
  char rtcDateStr[30] = "RTC Tidak Terdeteksi";

  if (local.rtcReady) {
    snprintf(rtcTimeStr, sizeof(rtcTimeStr), "%02d:%02d:%02d",
             local.rtcHour, local.rtcMinute, local.rtcSecond);
    snprintf(rtcDateStr, sizeof(rtcDateStr), "%02d/%02d/%04d %02d:%02d:%02d",
             local.rtcDay, local.rtcMonth, local.rtcYear,
             local.rtcHour, local.rtcMinute, local.rtcSecond);
  }

  String json = "{";
  json += "\"count\":" + String(local.pestCounter) + ",";
  json += "\"dist\":" + String(local.currentDistance) + ",";
  json += "\"volt\":" + String(local.busVoltage_V, 2) + ",";
  json += "\"current\":" + String(local.current_mA, 1) + ",";
  json += "\"power\":" + String(local.power_mW, 1) + ",";
  json += "\"running\":" + String(local.isSystemRunning ? "true" : "false") + ",";
  json += "\"relay1\":" + String(local.relay1State ? "true" : "false") + ",";
  json += "\"relay2\":" + String(local.relay2State ? "true" : "false") + ",";
  json += "\"mode\":" + String((int)local.mode) + ",";
  json += "\"sHour\":" + String(local.startHour) + ",";
  json += "\"sMin\":" + String(local.startMin) + ",";
  json += "\"eHour\":" + String(local.endHour) + ",";
  json += "\"eMin\":" + String(local.endMin) + ",";
  json += "\"distTh\":" + String(local.distThreshold_mm) + ",";
  json += "\"pulse\":" + String(local.relayPulse_ms) + ",";
  json += "\"cool\":" + String(local.zapCooldown_ms) + ",";
  json += "\"actLow\":" + String(local.relayActiveLow ? "true" : "false") + ",";
  json += "\"rtcTime\":\"" + String(rtcTimeStr) + "\",";
  json += "\"rtcDateTime\":\"" + String(rtcDateStr) + "\"";
  json += "}";

  server.send(200, "application/json", json);
}

// API: Simpan Pengaturan Jadwal & Mode (Thread-Safe via Mutex)
void handleSaveSchedule() {
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
    if (server.hasArg("mode")) {
      sysData.mode = (OperationMode)server.arg("mode").toInt();
    }

    if (server.hasArg("start")) {
      String s = server.arg("start");
      int colonIdx = s.indexOf(':');
      if (colonIdx > 0) {
        sysData.startHour = s.substring(0, colonIdx).toInt();
        sysData.startMin  = s.substring(colonIdx + 1).toInt();
      }
    }

    if (server.hasArg("end")) {
      String s = server.arg("end");
      int colonIdx = s.indexOf(':');
      if (colonIdx > 0) {
        sysData.endHour = s.substring(0, colonIdx).toInt();
        sysData.endMin  = s.substring(colonIdx + 1).toInt();
      }
    }

    sysData.reqSaveConfig = true;
    xSemaphoreGive(dataMutex);

    server.send(200, "text/plain", "Jadwal dan Mode Operasi berhasil disimpan!");
  } else {
    server.send(503, "text/plain", "Sistem sibuk, silakan coba lagi.");
  }
}

// API: Simpan Parameter Sensor & Relay (Thread-Safe via Mutex)
void handleSaveSettings() {
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
    if (server.hasArg("distTh")) sysData.distThreshold_mm = server.arg("distTh").toInt();
    if (server.hasArg("pulse"))  sysData.relayPulse_ms    = server.arg("pulse").toInt();
    if (server.hasArg("cool"))   sysData.zapCooldown_ms   = server.arg("cool").toInt();
    if (server.hasArg("actLow")) sysData.relayActiveLow   = (server.arg("actLow").toInt() == 1);

    sysData.reqSaveConfig = true;
    xSemaphoreGive(dataMutex);

    server.send(200, "text/plain", "Pengaturan Sensor & Relay berhasil disimpan!");
  } else {
    server.send(503, "text/plain", "Sistem sibuk, silakan coba lagi.");
  }
}

// API: Permintaan Sinkronisasi RTC (Core 0 -> Core 1 via Mutex)
void handleSyncRtc() {
  if (server.hasArg("year") && server.hasArg("month") && server.hasArg("day") &&
      server.hasArg("hour") && server.hasArg("min") && server.hasArg("sec")) {

    int y = server.arg("year").toInt();
    int m = server.arg("month").toInt();
    int d = server.arg("day").toInt();
    int hr = server.arg("hour").toInt();
    int mi = server.arg("min").toInt();
    int se = server.arg("sec").toInt();

    if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
      sysData.reqYear  = y;
      sysData.reqMonth = m;
      sysData.reqDay   = d;
      sysData.reqHour  = hr;
      sysData.reqMin   = mi;
      sysData.reqSec   = se;
      sysData.reqSyncRtc = true;
      xSemaphoreGive(dataMutex);

      server.send(200, "text/plain", "Permintaan sinkronisasi RTC dikirim ke Core 1!");
    } else {
      server.send(503, "text/plain", "Sistem sibuk.");
    }
  } else {
    server.send(400, "text/plain", "Parameter waktu tidak lengkap!");
  }
}

// API: Permintaan Reset Counter Hama (Core 0 -> Core 1 via Mutex)
void handleResetCounter() {
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
    sysData.reqResetCounter = true;
    xSemaphoreGive(dataMutex);
    server.send(200, "text/plain", "Hitungan hama berhasil di-reset ke 0!");
  } else {
    server.send(503, "text/plain", "Sistem sibuk.");
  }
}

// API: Permintaan Uji Coba Manual Relay (Core 0 -> Core 1 via Mutex)
void handleManualRelay() {
  if (server.hasArg("relay")) {
    int r = server.arg("relay").toInt();
    if (r >= 1 && r <= 3) {
      if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(200)) == pdTRUE) {
        sysData.reqManualRelay = r;
        xSemaphoreGive(dataMutex);
        server.send(200, "text/plain", "Perintah kontrol relay berhasil diproses!");
        return;
      }
    }
  }
  server.send(400, "text/plain", "Parameter relay tidak valid!");
}