/*
 ==============================================================================
  PROJEK         : PENGENDALI & PERANGKAP HAMA OTOMATIS (SMART PEST TRAP)
  MIKROKONTROLER : ESP32 WROOM (30 PIN) - DUAL CORE & FREERTOS MUTEX
  SKEMATIK       : Schematic_perangkap_hama_2026-10-03.pdf
 ==============================================================================
  FITUR SMART AUTO-RECOVERY & HARDWARE DETECTION:
  ------------------------------------------------------------------------------
  1. SMART HARDWARE FALLBACK & HOT-PLUG AUTO-RECOVERY:
     - I2C Timeout Guard: Mencegah sistem freeze/lockup jika ada modul dilepas.
     - Deteksi Otomatis & Pemulihan Mandiri:
       * OLED SSD1306 (0x3C) : Jika tidak terpasang/terputus, aman di-bypass.
       * RTC DS3231 (0x68)   : Jika tidak terdeteksi, otomatis beralih ke
                               Smart Soft-Clock internal (jadwal tetap bekerja).
       * VL53L0X (0x29)      : Jika tidak terdeteksi, deteksi dilewati tanpa
                               memicu zap palsu, dan mencoba auto-reconnect.
       * INA226 (0x40)       : Jika offline, membaca 0V/0mA secara aman.
     - Setiap modul yang dipasang belakangan akan otomatis terhubung kembali!

  2. MONITORING STATUS TOMBOL FISIK (0 / 1):
     - Membaca digital status pin GPIO 25 (bt1), GPIO 26 (bt2), GPIO 27 (bt3).
     - Serial Monitor mencetak status 0/1 setiap ada tombol ditekan/dilepas:
       "0 = DITEKAN (LOW / GND)" | "1 = DILEPAS (HIGH / PULLUP)"
     - Periodic Heartbeat mencetak status tombol & modul hardware ke Serial.
     - Web Server Dashboard menampilkan status tombol 0/1 secara live.

  3. DUAL-CORE & FREERTOS MUTEX:
     - Core 0 : WiFi SoftAP, Captive Portal DNS, dan WebServer HTTP.
     - Core 1 : Real-time sensing (VL53L0X), Aktuator Relay 1 & 2, I2C, Display.
     - Mutex  : Melindungi data bersama antar core (thread-safe).

  4. SMART POWER SAVING (IDLE MODE):
     - Saat MODE_AUTO dan di luar jadwal operasi → masuk mode hemat daya.
     - Sensor VL53L0X & INA226 berhenti polling (hemat ~20mA).
     - OLED dimatikan setelah 5 detik idle (hemat ~15mA).
     - WiFi Modem Sleep aktif (hemat ~40mA, WiFi tetap konek).
     - Web Server tetap bisa menerima request (Core 0 aktif).
     - RTC dicek setiap 30 detik untuk deteksi kapan jadwal mulai.
     - Loop melambat ke 500ms interval (dari 2ms normal).
     - Otomatis bangun saat jadwal tiba atau mode diubah via tombol/web.
==============================================================================
*/

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <esp_wifi.h>
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

#define PIN_BT1         25    // bt1 - Tombol navigasi display
#define PIN_BT2         26    // bt2 - Tombol ubah mode operasional (AUTO/ON/OFF)
#define PIN_BT3         27    // bt3 - Tombol reset counter hama (Hold 2 detik)

// ==================== ALAMAT I2C PERANGKAT ====================
#define OLED_I2C_ADDR   0x3C
#define INA226_I2C_ADDR 0x40
#define DS3231_I2C_ADDR 0x68
#define VL53_I2C_ADDR   0x29

// ==================== PARAMETER SISTEM ====================
#define SCREEN_WIDTH    128
#define SCREEN_HEIGHT   64
#define OLED_RESET      -1

enum OperationMode {
  MODE_AUTO = 0,        // Berdasarkan jadwal RTC (Lampu UV & Deteksi otomatis)
  MODE_MANUAL_ON = 1,   // Selalu RUNNING (Lampu UV & Deteksi selalu aktif)
  MODE_MANUAL_OFF = 2   // Selalu STANDBY (Lampu UV mati)
};

// ==================== STRUKTUR DATA BERSAMA (SHARED STATE) ====================
struct SystemState {
  // Status Kesehatan Hardware (True jika terhubung & online)
  bool oledReady;
  bool sensorReady;
  bool rtcReady;
  bool inaReady;
  bool usingSoftClock;

  // Status Pin Tombol Fisik (0 = Ditekan / LOW, 1 = Dilepas / HIGH)
  uint8_t bt1Raw;
  uint8_t bt2Raw;
  uint8_t bt3Raw;

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
  bool isIdleSleeping;      // True saat MODE_AUTO dan di luar jadwal (hemat daya)
  bool relay1State;
  bool relay2State;
  bool relay3State;

  float busVoltage_V;
  float current_mA;
  float power_mW;

  // Waktu RTC / Soft-Clock
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

// Runtime timer non-blocking untuk Core 1
unsigned long lastSensorReadTime  = 0;
unsigned long lastInaReadTime     = 0;
unsigned long lastRtcReadTime     = 0;
unsigned long lastOledUpdateTime  = 0;
unsigned long lastHardwareProbe   = 0;
unsigned long lastHeartbeatPrint  = 0;
unsigned long relay1TurnOffTime   = 0;
unsigned long lastIdleCheck       = 0;  // Timer cek jadwal saat idle
bool wasIdleSleeping              = false; // Tracking transisi idle
unsigned long idleOledOffTime     = 0;  // Waktu matikan OLED saat idle
unsigned long zapCooldownTimer    = 0;

// Smart Soft-Clock Variables (Fallback jika RTC tidak terpasang)
uint32_t softBaseEpoch = 1791050400; // Standar default: 2026-10-03 18:00:00
unsigned long softBaseMillis = 0;

// Navigasi Display OLED
uint8_t oledCurrentPage = 0;
const uint8_t OLED_TOTAL_PAGES = 3;
unsigned long lastPageAutoRotate = 0;
bool pageAutoRotate = true;

// Debounce Tombol & State Tracking
int lastBt1State = HIGH;
int lastBt2State = HIGH;
int lastBt3State = HIGH;
int prevReportedBt1 = -1;
int prevReportedBt2 = -1;
int prevReportedBt3 = -1;
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
bool checkI2CAddress(uint8_t addr);
void autoDetectHardwareCore1();
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

// ==================== HELPER I2C ADDRESS CHECKER ====================
bool checkI2CAddress(uint8_t addr) {
  Wire.beginTransmission(addr);
  return (Wire.endTransmission() == 0);
}

// ==================== SETUP (DIJALANKAN DI CORE 1) ====================
void setup() {
  Serial.begin(115200);
  delay(600);
  Serial.println(F("\n======================================================="));
  Serial.println(F("  SMART PEST TRAP - ESP32 DUAL CORE & SMART RECOVERY   "));
  Serial.println(F("======================================================="));

  // 1. Buat Mutex FreeRTOS
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
  sysData.bt1Raw = 1;
  sysData.bt2Raw = 1;
  sysData.bt3Raw = 1;
  sysData.currentDistance = 9999;
  softBaseMillis = millis();

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

  // Baca status awal tombol
  sysData.bt1Raw = digitalRead(PIN_BT1);
  sysData.bt2Raw = digitalRead(PIN_BT2);
  sysData.bt3Raw = digitalRead(PIN_BT3);
  Serial.printf("[INISIAL TOMBOL] bt1 (D25)=%d | bt2 (D26)=%d | bt3 (D27)=%d (1=LEPAS, 0=DITEKAN)\n",
                sysData.bt1Raw, sysData.bt2Raw, sysData.bt3Raw);

  // 3. Baca Konfigurasi dari Memori Flash NVS
  loadConfigurations();

  // 4. Inisialisasi Bus I2C dengan Timeout Aman
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(400000);
  Wire.setTimeOut(50); // Timeout 50ms: Mencegah I2C hang saat modul offline/dilepas

  // Lakukan pemindaian awal perangkat I2C
  Serial.println(F("[I2C SCAN] Memindai modul hardware di I2C bus (D21 SDA, D22 SCL)..."));
  autoDetectHardwareCore1();

  // 5. Luncurkan Task Web Server di CORE 0
  xTaskCreatePinnedToCore(
    taskWebServerCore0,
    "TaskWebCore0",
    10240,
    NULL,
    1,
    &taskWebHandle,
    0
  );

  Serial.printf("[SYSTEM] Sistem Siap Beroperasi. Core Kontrol: %d, Task Web: Core 0.\n", xPortGetCoreID());
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

  for (;;) {
    server.handleClient();
    dnsServer.processNextRequest();
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

// ==================== CORE 1: DETEKSI & AUTO-RECOVERY HARDWARE ====================
void autoDetectHardwareCore1() {
  // 1. Cek & Inisialisasi OLED SSD1306 (0x3C)
  bool oledFound = checkI2CAddress(OLED_I2C_ADDR);
  if (oledFound) {
    if (!sysData.oledReady) {
      if (display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
        sysData.oledReady = true;
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(10, 15);
        display.println(F("PERANGKAP HAMA"));
        display.setCursor(10, 30);
        display.println(F("SMART AUTO-RECOVERY"));
        display.display();
        Serial.println(F("[HARDWARE] OLED SSD1306 (0x3C): [ONLINE]"));
      }
    }
  } else {
    if (sysData.oledReady) {
      Serial.println(F("[WARNING] OLED SSD1306 Terputus / Tidak Terdeteksi!"));
    }
    sysData.oledReady = false;
  }

  // 2. Cek & Inisialisasi RTC DS3231 (0x68)
  bool rtcFound = checkI2CAddress(DS3231_I2C_ADDR);
  if (rtcFound) {
    if (!sysData.rtcReady) {
      if (rtc.begin()) {
        sysData.rtcReady = true;
        sysData.usingSoftClock = false;
        if (rtc.lostPower()) {
          Serial.println(F("[RTC] DS3231 kehilangan daya, setel waktu default!"));
          rtc.adjust(DateTime(2026, 10, 3, 18, 0, 0));
        }
        DateTime now = rtc.now();
        softBaseEpoch = now.unixtime();
        softBaseMillis = millis();
        Serial.printf("[HARDWARE] RTC DS3231 (0x68): [ONLINE] Waktu RTC: %02d/%02d/%04d %02d:%02d:%02d\n",
                      now.day(), now.month(), now.year(), now.hour(), now.minute(), now.second());
      }
    }
  } else {
    if (sysData.rtcReady || !sysData.usingSoftClock) {
      Serial.println(F("[WARNING] RTC DS3231 (0x68): [TIDAK TERDETEKSI] -> Mengaktifkan Smart Soft-Clock Internal!"));
    }
    sysData.rtcReady = false;
    sysData.usingSoftClock = true;
  }

  // 3. Cek & Inisialisasi Sensor VL53L0X (0x29)
  bool vlFound = checkI2CAddress(VL53_I2C_ADDR);
  if (vlFound) {
    if (!sysData.sensorReady) {
      if (sensorVL53.begin()) {
        sysData.sensorReady = true;
        Serial.println(F("[HARDWARE] Sensor VL53L0X (0x29): [ONLINE]"));
      }
    }
  } else {
    if (sysData.sensorReady) {
      Serial.println(F("[WARNING] Sensor VL53L0X Terputus!"));
    }
    sysData.sensorReady = false;
    sysData.currentDistance = 9999;
  }

  // 4. Cek & Inisialisasi INA226 (0x40)
  bool inaFound = checkI2CAddress(INA226_I2C_ADDR);
  if (inaFound) {
    if (!sysData.inaReady) {
      if (ina226.init()) {
        sysData.inaReady = true;
        ina226.setResistorRange(sysData.shuntResistor_ohm, 3.2);
        Serial.println(F("[HARDWARE] Sensor INA226 (0x40): [ONLINE]"));
      }
    }
  } else {
    if (sysData.inaReady) {
      Serial.println(F("[WARNING] Sensor INA226 Terputus!"));
    }
    sysData.inaReady = false;
    sysData.busVoltage_V = 0.0;
    sysData.current_mA = 0.0;
    sysData.power_mW = 0.0;
  }
}

// ==================== CORE 1: LOOP KONTROL & REAL-TIME SENSING ====================
void loop() {
  unsigned long currentMillis = millis();

  // 1. Eksekusi Request Tertunda dari Core 0 (Web UI) - SELALU aktif
  handlePendingWebRequestsCore1();

  // 2. Polling Tombol Fisik & Cetak Status 0/1 - SELALU aktif (agar bisa ganti mode)
  handleButtonsCore1();

  // ==================== MODE IDLE / POWER SAVING ====================
  // Saat MODE_AUTO dan di luar jadwal operasi → hemat daya:
  //   - Sensor VL53L0X & INA226 berhenti polling
  //   - OLED dimatikan setelah 5 detik idle
  //   - WiFi modem sleep aktif (WiFi tetap konek, radio tidur antar beacon)
  //   - Web server tetap bisa menerima request (Core 0 tetap jalan)
  //   - RTC dicek setiap 30 detik untuk deteksi kapan jadwal mulai
  //   - Loop melambat ke 500ms interval (dari 2ms normal)

  if (sysData.isIdleSleeping) {
    // === TRANSISI MASUK IDLE ===
    if (!wasIdleSleeping) {
      wasIdleSleeping = true;
      idleOledOffTime = currentMillis + 5000; // OLED mati dalam 5 detik

      // Matikan semua relay saat masuk idle
      sysData.relay1State = false;
      sysData.relay2State = false;
      digitalWrite(PIN_RELAY_1, getRelayPinLevel(false, sysData.relayActiveLow));
      digitalWrite(PIN_RELAY_2, getRelayPinLevel(false, sysData.relayActiveLow));

      // Aktifkan WiFi Modem Sleep (hemat ~40mA)
      esp_wifi_set_ps(WIFI_PS_MAX_MODEM);

      Serial.println(F("[POWER] >>> MASUK MODE IDLE / HEMAT DAYA <<<"));
      Serial.println(F("[POWER] Sensor VL53/INA STOP | OLED mati 5s | WiFi Modem Sleep ON"));
      Serial.printf("[POWER] Jadwal aktif: %02d:%02d - %02d:%02d | Sekarang: %02d:%02d\n",
                    sysData.startHour, sysData.startMin, sysData.endHour, sysData.endMin,
                    sysData.rtcHour, sysData.rtcMinute);

      // Tampilkan pesan idle di OLED sebelum dimatikan
      if (sysData.oledReady) {
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(10, 0);
        display.print(F("=== IDLE MODE ==="));
        display.setCursor(0, 14);
        display.print(F("Hemat Daya Aktif"));
        display.setCursor(0, 26);
        display.printf("Jadwal: %02d:%02d-%02d:%02d",
                       sysData.startHour, sysData.startMin,
                       sysData.endHour, sysData.endMin);
        display.setCursor(0, 38);
        display.printf("Waktu : %02d:%02d:%02d",
                       sysData.rtcHour, sysData.rtcMinute, sysData.rtcSecond);
        display.setCursor(0, 52);
        display.print(F("WiFi: Aktif (Sleep)"));
        display.display();
      }
    }

    // === MATIKAN OLED SETELAH 5 DETIK IDLE ===
    if (sysData.oledReady && currentMillis >= idleOledOffTime) {
      display.clearDisplay();
      display.display(); // Layar gelap total → hemat daya OLED
    }

    // === CEK RTC & JADWAL SETIAP 30 DETIK (bukan 1 detik) ===
    if (currentMillis - lastIdleCheck >= 30000) {
      lastIdleCheck = currentMillis;
      readRTCCore1();
      checkScheduledOperationCore1();

      Serial.printf("[IDLE] Cek jadwal: %02d:%02d:%02d | isIdle: %s\n",
                    sysData.rtcHour, sysData.rtcMinute, sysData.rtcSecond,
                    sysData.isIdleSleeping ? "YA" : "BANGUN!");
    }

    // === HEARTBEAT IDLE SETIAP 30 DETIK ===
    if (currentMillis - lastHeartbeatPrint >= 30000) {
      lastHeartbeatPrint = currentMillis;
      Serial.printf("[IDLE HEARTBEAT] %02d:%02d:%02d | Mode:AUTO | Status:IDLE | WiFi:Modem-Sleep\n",
                    sysData.rtcHour, sysData.rtcMinute, sysData.rtcSecond);
    }

    // Loop melambat drastis: 500ms (dari 2ms) → hemat CPU ~99%
    vTaskDelay(pdMS_TO_TICKS(500));
    return; // Skip semua operasi sensor & display di bawah
  }

  // ==================== TRANSISI BANGUN DARI IDLE ====================
  if (wasIdleSleeping) {
    wasIdleSleeping = false;

    // Matikan WiFi Modem Sleep → kembali ke performa penuh
    esp_wifi_set_ps(WIFI_PS_NONE);

    Serial.println(F("[POWER] <<< BANGUN DARI IDLE - SISTEM AKTIF >>>"));
    Serial.printf("[POWER] Waktu: %02d:%02d:%02d | Mode: %s\n",
                  sysData.rtcHour, sysData.rtcMinute, sysData.rtcSecond,
                  sysData.mode == MODE_AUTO ? "AUTO" : "MANUAL");

    // Reset timer sensor supaya langsung baca
    lastSensorReadTime = 0;
    lastInaReadTime = 0;
    lastOledUpdateTime = 0;
    lastHardwareProbe = 0;
  }

  // ==================== MODE AKTIF / NORMAL OPERATION ====================

  // 2. Auto-Detection / Hot-Plug Check setiap 3 detik
  if (currentMillis - lastHardwareProbe >= 3000) {
    lastHardwareProbe = currentMillis;
    autoDetectHardwareCore1();
  }

  // 3. Baca RTC / Update Soft-Clock setiap 1000 ms & Evaluasi Jadwal
  if (currentMillis - lastRtcReadTime >= 1000) {
    lastRtcReadTime = currentMillis;
    readRTCCore1();
    checkScheduledOperationCore1();

    // Tampilkan waktu dari RTC di Serial Monitor setiap detik
    Serial.printf("[RTC WAKTU] %02d/%02d/%04d %02d:%02d:%02d [%s] | Mode: %s | Status: %s | UV: %s\n",
                  sysData.rtcDay, sysData.rtcMonth, sysData.rtcYear,
                  sysData.rtcHour, sysData.rtcMinute, sysData.rtcSecond,
                  sysData.rtcReady ? "DS3231" : (sysData.usingSoftClock ? "Soft-Clock" : "OFFLINE"),
                  sysData.mode == MODE_AUTO ? "AUTO" : (sysData.mode == MODE_MANUAL_ON ? "MANUAL-ON" : "MANUAL-OFF"),
                  sysData.isSystemRunning ? "RUNNING" : "STANDBY",
                  sysData.relay2State ? "ON" : "OFF");
  }

  // 4. Kontrol Relay 1 (Zapper Trigger Timer)
  if (sysData.relay1State && currentMillis >= relay1TurnOffTime) {
    sysData.relay1State = false;
    digitalWrite(PIN_RELAY_1, getRelayPinLevel(false, sysData.relayActiveLow));
  }

  // 5. Kontrol Relay 2 (Lampu UV) mengikuti status isSystemRunning
  if (sysData.relay2State != sysData.isSystemRunning) {
    sysData.relay2State = sysData.isSystemRunning;
    digitalWrite(PIN_RELAY_2, getRelayPinLevel(sysData.relay2State, sysData.relayActiveLow));
    Serial.printf("[UV] Lampu UV (Relay 2): %s\n", sysData.relay2State ? "MENYALA" : "PADAM");
  }

  // 6. Pembacaan Sensor ToF VL53L0X setiap 60 ms
  if (currentMillis - lastSensorReadTime >= 60) {
    lastSensorReadTime = currentMillis;
    readVL53L0XCore1();
  }

  // 7. Pembacaan Sensor INA226 setiap 500 ms
  if (currentMillis - lastInaReadTime >= 500) {
    lastInaReadTime = currentMillis;
    readINA226Core1();
  }

  // 9. Periodic Heartbeat Print ke Serial Monitor setiap 3 detik
  if (currentMillis - lastHeartbeatPrint >= 3000) {
    lastHeartbeatPrint = currentMillis;
    Serial.printf("[HEARTBEAT] Jam RTC: %02d:%02d:%02d | Tombol: [bt1=%d, bt2=%d, bt3=%d] | Modul: [OLED:%s, RTC:%s, VL53:%s, INA:%s]\n",
                  sysData.rtcHour, sysData.rtcMinute, sysData.rtcSecond,
                  sysData.bt1Raw, sysData.bt2Raw, sysData.bt3Raw,
                  sysData.oledReady ? "OK" : "NO_OLED",
                  sysData.rtcReady ? "OK" : (sysData.usingSoftClock ? "SOFT_CLOCK" : "NO_RTC"),
                  sysData.sensorReady ? "OK" : "NO_VL53",
                  sysData.inaReady ? "OK" : "NO_INA");
  }

  // 10. Update Layar OLED setiap 200 ms (Aman dilewati jika OLED offline)
  if (currentMillis - lastOledUpdateTime >= 200) {
    lastOledUpdateTime = currentMillis;
    updateDisplayCore1();
  }

  // 11. Auto-rotate Halaman OLED setiap 5 detik
  if (pageAutoRotate && (currentMillis - lastPageAutoRotate >= 5000)) {
    lastPageAutoRotate = currentMillis;
    oledCurrentPage = (oledCurrentPage + 1) % OLED_TOTAL_PAGES;
  }

  vTaskDelay(pdMS_TO_TICKS(2));
}


// ==================== CORE 1: HANDLE REQUEST DARI WEB SERVER ====================
void handlePendingWebRequestsCore1() {
  bool doSyncRtc = false;
  DateTime targetDt;
  bool doResetCounter = false;
  uint8_t manualRelayCmd = 0;
  bool doSaveConfig = false;

  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(15)) == pdTRUE) {
    if (sysData.reqSyncRtc) {
      sysData.reqSyncRtc = false;
      targetDt = DateTime(sysData.reqYear, sysData.reqMonth, sysData.reqDay,
                          sysData.reqHour, sysData.reqMin, sysData.reqSec);
      doSyncRtc = true;
    }

    if (sysData.reqResetCounter) {
      sysData.reqResetCounter = false;
      sysData.pestCounter = 0;
      doResetCounter = true;
    }

    if (sysData.reqManualRelay > 0) {
      manualRelayCmd = sysData.reqManualRelay;
      sysData.reqManualRelay = 0;
      if (manualRelayCmd == 1) {
        sysData.relay1State = true;
        digitalWrite(PIN_RELAY_1, getRelayPinLevel(true, sysData.relayActiveLow));
        relay1TurnOffTime = millis() + sysData.relayPulse_ms;
      } else if (manualRelayCmd == 2) {
        sysData.isSystemRunning = !sysData.isSystemRunning;
        sysData.relay2State = sysData.isSystemRunning;
        digitalWrite(PIN_RELAY_2, getRelayPinLevel(sysData.relay2State, sysData.relayActiveLow));
        sysData.mode = sysData.isSystemRunning ? MODE_MANUAL_ON : MODE_MANUAL_OFF;
        doSaveConfig = true;
      }
    }

    if (sysData.reqSaveConfig) {
      sysData.reqSaveConfig = false;
      doSaveConfig = true;
    }

    xSemaphoreGive(dataMutex);
  }

  // Lakukan operasi I/O dan Flash di LUAR mutex agar tidak menahan Core 0
  if (doSyncRtc) {
    if (sysData.rtcReady) {
      rtc.adjust(targetDt);
      DateTime n = rtc.now();
      softBaseEpoch = n.unixtime();
      softBaseMillis = millis();
      Serial.printf("[CORE 1] Waktu Hardware RTC DS3231 Diperbarui: %02d/%02d/%04d %02d:%02d:%02d\n",
                    n.day(), n.month(), n.year(), n.hour(), n.minute(), n.second());
    } else {
      softBaseEpoch = targetDt.unixtime();
      softBaseMillis = millis();
      Serial.printf("[CORE 1] Smart Soft-Clock Diperbarui: %02d/%02d/%04d %02d:%02d:%02d\n",
                    targetDt.day(), targetDt.month(), targetDt.year(),
                    targetDt.hour(), targetDt.minute(), targetDt.second());
    }
    readRTCCore1();
  }

  if (doResetCounter) {
    savePestCounter();
    Serial.println(F("[CORE 1] Counter Hama di-Reset oleh Web UI."));
  }

  if (manualRelayCmd == 1) {
    Serial.println(F("[CORE 1] Manual Trigger Relay 1 (Zapper) via Web!"));
  } else if (manualRelayCmd == 2) {
    Serial.printf("[CORE 1] Toggle Lampu UV via Web: %s\n", sysData.isSystemRunning ? "ON" : "OFF");
  }

  if (doSaveConfig) {
    saveConfigurations();
  }
}

// ==================== CORE 1: PEMBACAAN SENSOR VL53L0X ====================
void readVL53L0XCore1() {
  if (!sysData.sensorReady) {
    // Sensor offline: pastikan tidak ada deteksi palsu
    if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(5)) == pdTRUE) {
      sysData.currentDistance = 9999;
      sysData.isObjectDetected = false;
      xSemaphoreGive(dataMutex);
    }
    return;
  }

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
  if (!sysData.inaReady) {
    if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(15)) == pdTRUE) {
      sysData.busVoltage_V = 0.0;
      sysData.current_mA   = 0.0;
      sysData.power_mW     = 0.0;
      xSemaphoreGive(dataMutex);
    }
    return;
  }

  float v = ina226.getBusVoltage_V();
  float c = ina226.getCurrent_mA();
  float p = ina226.getBusPower();

  // Proteksi nilai NaN / Inf agar tidak merusak serialisasi JSON di Web Server
  if (isnan(v) || isinf(v)) v = 0.0;
  if (isnan(c) || isinf(c)) c = 0.0;
  if (isnan(p) || isinf(p)) p = 0.0;

  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
    sysData.busVoltage_V = v;
    sysData.current_mA   = c;
    sysData.power_mW     = p;
    xSemaphoreGive(dataMutex);
  }
}

// ==================== CORE 1: PEMBACAAN RTC / SMART SOFT-CLOCK ====================
void readRTCCore1() {
  DateTime curTime;

  if (sysData.rtcReady) {
    curTime = rtc.now();
  } else {
    // Smart Fallback ke Soft-Clock internal
    unsigned long elapsedSec = (millis() - softBaseMillis) / 1000;
    curTime = DateTime(softBaseEpoch + elapsedSec);
  }

  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(15)) == pdTRUE) {
    sysData.rtcYear   = curTime.year();
    sysData.rtcMonth  = curTime.month();
    sysData.rtcDay    = curTime.day();
    sysData.rtcHour   = curTime.hour();
    sysData.rtcMinute = curTime.minute();
    sysData.rtcSecond = curTime.second();
    xSemaphoreGive(dataMutex);
  }
}

// ==================== CORE 1: EVALUASI JADWAL OPERASIONAL ====================
void checkScheduledOperationCore1() {
  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(15)) == pdTRUE) {
    if (sysData.mode == MODE_MANUAL_ON) {
      sysData.isSystemRunning = true;
      sysData.isIdleSleeping = false;
    } else if (sysData.mode == MODE_MANUAL_OFF) {
      sysData.isSystemRunning = false;
      sysData.isIdleSleeping = false;
    } else {
      // MODE_AUTO: Hitung waktu jadwal
      int currentTotalMin = sysData.rtcHour * 60 + sysData.rtcMinute;
      int startTotalMin   = sysData.startHour * 60 + sysData.startMin;
      int endTotalMin     = sysData.endHour * 60 + sysData.endMin;

      bool inSchedule;
      if (startTotalMin <= endTotalMin) {
        inSchedule = (currentTotalMin >= startTotalMin && currentTotalMin < endTotalMin);
      } else {
        inSchedule = (currentTotalMin >= startTotalMin || currentTotalMin < endTotalMin);
      }
      sysData.isSystemRunning = inSchedule;
      sysData.isIdleSleeping = !inSchedule; // Idle/sleep saat di luar jadwal
    }
    xSemaphoreGive(dataMutex);
  }
}

// ==================== CORE 1: PENANGANAN TOMBOL & PRINT STATUS 0/1 ====================
void handleButtonsCore1() {
  unsigned long now = millis();

  // 1. Baca langsung pin tombol (1 = Lepas, 0 = Ditekan)
  int r1 = digitalRead(PIN_BT1);
  int r2 = digitalRead(PIN_BT2);
  int r3 = digitalRead(PIN_BT3);

  // Simpan nilai raw ke sysData
  sysData.bt1Raw = r1;
  sysData.bt2Raw = r2;
  sysData.bt3Raw = r3;

  // Cetak setiap ada perubahan status pin tombol (0 / 1)
  if (r1 != prevReportedBt1 || r2 != prevReportedBt2 || r3 != prevReportedBt3) {
    prevReportedBt1 = r1;
    prevReportedBt2 = r2;
    prevReportedBt3 = r3;
    Serial.printf("[TOMBOL EVENT] bt1 (D25)=%d | bt2 (D26)=%d | bt3 (D27)=%d  [%s]\n",
                  r1, r2, r3,
                  (r1 == 0 ? "bt1 DITEKAN" : (r2 == 0 ? "bt2 DITEKAN" : (r3 == 0 ? "bt3 DITEKAN" : "SEMUA LEPAS"))));
  }

  // --- LOGIKA TOMBOL 1 (bt1 - GPIO 25): Pindah Halaman OLED ---
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

  // --- LOGIKA TOMBOL 2 (bt2 - GPIO 26): Ubah Mode Operasi ---
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

  // --- LOGIKA TOMBOL 3 (bt3 - GPIO 27): Manual Zap / Reset Counter ---
  static bool bt3ResetDone = false;
  if (r3 != lastBt3State) {
    bt3DebounceTime = now;
    if (r3 == LOW) {
      bt3PressStartTime = now;
      bt3ResetDone = false;
    } else {
      unsigned long pressDuration = now - bt3PressStartTime;
      if (!bt3ResetDone && pressDuration >= 50 && pressDuration < 2000) {
        if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
          sysData.relay1State = true;
          digitalWrite(PIN_RELAY_1, getRelayPinLevel(true, sysData.relayActiveLow));
          relay1TurnOffTime = now + sysData.relayPulse_ms;
          xSemaphoreGive(dataMutex);
          Serial.println(F("[BUTTON 3] Manual Test Zap!"));
        }
      }
    }
  }

  if (r3 == LOW && !bt3ResetDone && (now - bt3PressStartTime >= 2000)) {
    bt3ResetDone = true;
    bool doResetFeedback = false;
    if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
      if (sysData.pestCounter != 0) {
        sysData.pestCounter = 0;
        doResetFeedback = true;
      }
      xSemaphoreGive(dataMutex);
    }

    if (doResetFeedback) {
      savePestCounter();
      Serial.println(F("[BUTTON 3] Reset Hitungan Hama Berhasil!"));
      if (sysData.oledReady) {
        display.clearDisplay();
        display.setTextSize(2);
        display.setCursor(15, 25);
        display.println(F("RESET OK!"));
        display.display();
        delay(400);
      }
    }
  }
  lastBt3State = r3;
}

// ==================== CORE 1: TAMPILAN OLED SSD1306 (SMART FALLBACK) ====================
void updateDisplayCore1() {
  // Jika OLED tidak terpasang / offline, lewati tanpa error
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
    display.printf("~%02d:%02d [S]", local.rtcHour, local.rtcMinute);
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
      display.print(F("NO SENSOR"));
    }

    if (local.relay1State) {
      display.setCursor(85, 44);
      display.print(F("*ZAP!*"));
    }

    display.setCursor(0, 55);
    if (local.inaReady) {
      display.printf("Aki:%4.1fV | %3.0fmA", local.busVoltage_V, local.current_mA);
    } else {
      display.printf("BT:1=%d 2=%d 3=%d", local.bt1Raw, local.bt2Raw, local.bt3Raw);
    }

  } else if (oledCurrentPage == 1) {
    // HALAMAN 2: MONITOR DAYA INA226 & STATUS HARDWARE
    display.setTextSize(1);
    display.setCursor(0, 14);
    display.print(F("-- STATUS HARDWARE --"));

    display.setCursor(0, 26);
    display.printf("RTC : %s", local.rtcReady ? "DS3231 OK" : "SOFT-CLOCK");

    display.setCursor(0, 37);
    display.printf("ToF : %s", local.sensorReady ? "VL53L0X OK" : "OFFLINE");

    display.setCursor(0, 48);
    display.printf("INA : %s (%4.1fV)", local.inaReady ? "ONLINE" : "OFFLINE", local.busVoltage_V);

    display.setCursor(0, 57);
    display.printf("PIN: B1=%d B2=%d B3=%d", local.bt1Raw, local.bt2Raw, local.bt3Raw);

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
// Helper: Kirim string PROGMEM sebagai satu chunk kecil (hemat RAM)
static void sendChunk(const char* data) {
  server.sendContent_P(data);
}

void handleRoot() {
  // Gunakan chunked transfer: kirim HTML dalam potongan kecil dari PROGMEM
  // Ini mencegah alokasi String 20KB+ yang menyebabkan heap fragmentation
  server.setContentLength(CONTENT_LENGTH_UNKNOWN);
  server.send(200, "text/html", "");

  // ===== CHUNK 1: HEAD & CSS =====
  sendChunk(
    "<!DOCTYPE html><html lang='id'>"
    "<head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'>"
    "<title>Smart Pest Trap - ESP32 Smart Recovery</title>"
    "<style>"
    ":root{--bg:#0f172a;--card:#1e293b;--accent:#10b981;--accent-hover:#059669;--text:#f8fafc;--sub:#94a3b8;--warn:#f59e0b;--danger:#ef4444;--border:#334155;}"
    "*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}"
    "body{background:var(--bg);color:var(--text);padding:16px;min-height:100vh;display:flex;flex-direction:column;align-items:center;}"
    ".container{width:100%;max-width:700px;display:flex;flex-direction:column;gap:16px;}"
    ".header{background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid var(--border);border-radius:16px;padding:20px;text-align:center;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);}"
    ".header h1{font-size:22px;color:var(--accent);margin-bottom:6px;display:flex;align-items:center;justify-content:center;gap:8px;}"
    ".header p{font-size:13px;color:var(--sub);}"
    ".badge-core{background:rgba(56,189,248,0.2);color:#38bdf8;border:1px solid #0284c7;font-size:11px;padding:2px 8px;border-radius:12px;margin-top:4px;display:inline-block;}"
  );

  // ===== CHUNK 2: CSS (lanjutan) =====
  sendChunk(
    ".card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px;box-shadow:0 4px 12px rgba(0,0,0,0.15);}"
    ".card-title{font-size:16px;font-weight:600;margin-bottom:14px;color:var(--text);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:8px;}"
    ".grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}"
    ".grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}"
    ".grid-4{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;}"
    ".stat-box{background:#0f172a;border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;}"
    ".stat-val{font-size:24px;font-weight:700;color:var(--accent);margin-top:4px;}"
    ".stat-lbl{font-size:11px;color:var(--sub);text-transform:uppercase;letter-spacing:0.5px;}"
    ".badge{display:inline-block;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;}"
    ".badge-run{background:rgba(16,185,129,0.2);color:#34d399;border:1px solid #10b981;}"
    ".badge-stby{background:rgba(245,158,11,0.2);color:#fbbf24;border:1px solid #f59e0b;}"
    ".badge-idle{background:rgba(99,102,241,0.2);color:#a78bfa;border:1px solid #6366f1;animation:pulse-idle 2s ease-in-out infinite;}"
    "@keyframes pulse-idle{0%,100%{opacity:1;}50%{opacity:0.5;}}"
    ".badge-off{background:rgba(239,68,68,0.2);color:#f87171;border:1px solid #ef4444;}"
    ".badge-hw-ok{background:rgba(16,185,129,0.2);color:#34d399;border:1px solid #10b981;font-size:11px;padding:2px 8px;border-radius:6px;}"
    ".badge-hw-err{background:rgba(239,68,68,0.2);color:#f87171;border:1px solid #ef4444;font-size:11px;padding:2px 8px;border-radius:6px;}"
    ".badge-hw-warn{background:rgba(245,158,11,0.2);color:#fbbf24;border:1px solid #f59e0b;font-size:11px;padding:2px 8px;border-radius:6px;}"
    ".btn-pin{display:flex;flex-direction:column;align-items:center;background:#0f172a;border:1px solid var(--border);border-radius:10px;padding:10px;}"
    ".btn-pin-val{font-size:20px;font-weight:bold;margin:4px 0;}"
  );

  // ===== CHUNK 3: CSS (form, button, relay) =====
  sendChunk(
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
    ".btn-relay{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:14px 12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;transition:all 0.25s ease;text-decoration:none;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);}"
    ".btn-relay-ready{background:#1e293b;border-color:#38bdf8;color:#f8fafc;}"
    ".btn-relay-ready:hover{background:#0284c7;color:#fff;box-shadow:0 0 14px rgba(56,189,248,0.4);}"
    ".btn-relay-pulse{background:#dc2626 !important;border-color:#f87171 !important;color:#fff !important;box-shadow:0 0 18px rgba(239,68,68,0.7) !important;animation:zapGlow 0.4s infinite alternate;}"
    ".btn-relay-on{background:linear-gradient(135deg,#059669,#10b981) !important;border-color:#34d399 !important;color:#ffffff !important;box-shadow:0 0 16px rgba(16,185,129,0.5) !important;}"
    ".btn-relay-off{background:#1e293b !important;border-color:#ef4444 !important;color:#94a3b8 !important;box-shadow:0 0 8px rgba(239,68,68,0.2) !important;}"
    ".btn-relay-off:hover{background:#334155 !important;color:#fff !important;}"
    ".relay-tag{font-size:11px;font-weight:700;padding:2px 10px;border-radius:12px;letter-spacing:0.5px;text-transform:uppercase;}"
    "@keyframes zapGlow{from{opacity:0.85;transform:scale(0.99);}to{opacity:1;transform:scale(1.02);}}"
    ".toast{padding:10px;border-radius:8px;font-size:13px;text-align:center;display:none;margin-top:10px;}"
    ".footer{text-align:center;font-size:12px;color:var(--sub);margin-top:10px;}"
    "@media (max-width:500px){.grid-2,.grid-3{grid-template-columns:1fr;}}"
    "</style></head><body>"
  );

  // ===== CHUNK 4: HEADER & STATUS HARDWARE =====
  sendChunk(
    "<div class='container'>"
    "  <div class='header'>"
    "    <h1>&#x1F99F; SMART PEST TRAP</h1>"
    "    <p>Pengendali Perangkap Hama & Lampu UV Otomatis berbasis ESP32</p>"
    "    <span class='badge-core'>FreeRTOS Dual-Core & Smart Auto-Recovery</span>"
    "  </div>"
    "  <div class='card'>"
    "    <div class='card-title'>&#x1F6E0;&#xFE0F; Status Modul Hardware (Auto-Detect)</div>"
    "    <div class='grid-4'>"
    "      <div class='stat-box'>"
    "        <div class='stat-lbl'>OLED SSD1306</div>"
    "        <div id='hwOled' style='margin-top:6px;' class='badge-hw-err'>OFFLINE</div>"
    "      </div>"
    "      <div class='stat-box'>"
    "        <div class='stat-lbl'>RTC DS3231</div>"
    "        <div id='hwRtc' style='margin-top:6px;' class='badge-hw-err'>OFFLINE</div>"
    "      </div>"
    "      <div class='stat-box'>"
    "        <div class='stat-lbl'>ToF VL53L0X</div>"
    "        <div id='hwVl' style='margin-top:6px;' class='badge-hw-err'>OFFLINE</div>"
    "      </div>"
    "      <div class='stat-box'>"
    "        <div class='stat-lbl'>Sensor INA226</div>"
    "        <div id='hwIna' style='margin-top:6px;' class='badge-hw-err'>OFFLINE</div>"
    "      </div>"
    "    </div>"
    "  </div>"
  );

  // ===== CHUNK 5: STATUS TOMBOL & STATUS OPERASIONAL =====
  sendChunk(
    "  <div class='card'>"
    "    <div class='card-title'>&#x1F518; Status Pin Tombol Fisik (Real-time 0/1)</div>"
    "    <div class='grid-3'>"
    "      <div class='btn-pin'>"
    "        <div class='stat-lbl'>Tombol 1 (GPIO 25)</div>"
    "        <div id='valBt1' class='btn-pin-val'>1</div>"
    "        <span id='lblBt1' class='badge-hw-ok'>LEPAS (1)</span>"
    "      </div>"
    "      <div class='btn-pin'>"
    "        <div class='stat-lbl'>Tombol 2 (GPIO 26)</div>"
    "        <div id='valBt2' class='btn-pin-val'>1</div>"
    "        <span id='lblBt2' class='badge-hw-ok'>LEPAS (1)</span>"
    "      </div>"
    "      <div class='btn-pin'>"
    "        <div class='stat-lbl'>Tombol 3 (GPIO 27)</div>"
    "        <div id='valBt3' class='btn-pin-val'>1</div>"
    "        <span id='lblBt3' class='badge-hw-ok'>LEPAS (1)</span>"
    "      </div>"
    "    </div>"
    "  </div>"
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
  );

  // ===== CHUNK 6: SENSOR DATA & WAKTU =====
  sendChunk(
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
    "        <div class='stat-lbl'>Waktu Sistem</div>"
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
  );

  // ===== CHUNK 7: FORM JADWAL =====
  sendChunk(
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
  );

  // ===== CHUNK 8: SINKRONISASI RTC & PARAMETER =====
  sendChunk(
    "  <div class='card'>"
    "    <div class='card-title'>&#x1F552; Sinkronisasi Waktu (RTC & Soft-Clock)</div>"
    "    <p style='font-size:13px;color:var(--sub);margin-bottom:12px;'>"
    "      Waktu berjalan di perangkat: <b id='currentDeviceTime' style='color:#fff;'>--</b>"
    "    </p>"
    "    <div style='display:flex;flex-direction:column;gap:10px;'>"
    "      <button type='button' onclick='syncWithClientTime()'>&#x2699; Sinkronkan dengan Waktu HP / Laptop Ini</button>"
    "      <div id='rtcToast' class='toast'></div>"
    "    </div>"
    "  </div>"
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
  );

  // ===== CHUNK 9: RELAY TEST & FOOTER =====
  sendChunk(
    "  <div class='card'>"
    "    <div class='card-title'>&#x1F50C; Uji Coba Manual Relay</div>"
    "    <div class='grid-2'>"
    "      <button type='button' id='btnRelay1' class='btn-relay btn-relay-ready' onclick='testRelay(1)'>"
    "        <span style='font-size:15px;font-weight:700;display:flex;align-items:center;gap:6px;'>&#x26A1; Relay 1 (Zapper)</span>"
    "        <span id='tagRelay1' class='relay-tag' style='background:rgba(56,189,248,0.2);color:#38bdf8;'>SIAP (KLIK PICU)</span>"
    "      </button>"
    "      <button type='button' id='btnRelay2' class='btn-relay btn-relay-off' onclick='testRelay(2)'>"
    "        <span style='font-size:15px;font-weight:700;display:flex;align-items:center;gap:6px;'>&#x1F4A1; Relay 2 (Lampu UV)</span>"
    "        <span id='tagRelay2' class='relay-tag' style='background:rgba(239,68,68,0.2);color:#f87171;'>MATI (OFF)</span>"
    "      </button>"
    "    </div>"
    "    <p style='font-size:12px;color:var(--sub);margin-top:10px;text-align:center;'>"
    "      &#x2139; Status Tombol: <b style='color:#34d399;'>HIJAU = HIDUP (ON)</b> &bull; <b style='color:#f87171;'>MERAH/GELAP = MATI (OFF)</b>"
    "    </p>"
    "  </div>"
    "  <div class='footer'>"
    "    &copy; 2026 Smart Pest Trap System &bull; ESP32 Smart Auto-Recovery"
    "  </div>"
    "</div>"
  );

  // ===== CHUNK 10: JAVASCRIPT - updateRelayButtons & fetchStatus =====
  sendChunk(
    "<script>"
    "function updateRelayButtons(r1,r2){"
    "var b1=document.getElementById('btnRelay1');"
    "var t1=document.getElementById('tagRelay1');"
    "if(b1&&t1){"
    "if(r1){b1.className='btn-relay btn-relay-pulse';t1.innerText='AKTIF (ZAP!)';t1.style.background='rgba(255,255,255,0.25)';t1.style.color='#ffffff';}"
    "else{b1.className='btn-relay btn-relay-ready';t1.innerText='SIAP (KLIK PICU)';t1.style.background='rgba(56,189,248,0.2)';t1.style.color='#38bdf8';}}"
    "var b2=document.getElementById('btnRelay2');"
    "var t2=document.getElementById('tagRelay2');"
    "if(b2&&t2){"
    "if(r2){b2.className='btn-relay btn-relay-on';t2.innerText='HIDUP (ON)';t2.style.background='rgba(255,255,255,0.3)';t2.style.color='#ffffff';}"
    "else{b2.className='btn-relay btn-relay-off';t2.innerText='MATI (OFF)';t2.style.background='rgba(239,68,68,0.2)';t2.style.color='#f87171';}}}"
  );

  // ===== CHUNK 11: JAVASCRIPT - fetchStatus =====
  sendChunk(
    "function fetchStatus(){"
    "fetch('/api/status?t='+Date.now()).then(function(r){"
    "if(!r.ok)throw new Error('HTTP '+r.status);"
    "return r.json();"
    "}).then(function(d){"
    "if(!d)return;"
    "var b=document.getElementById('statusBadge');"
    "var uvLbl=document.getElementById('valUvStatus');"
    "if(b){if(d.idle){b.className='badge badge-idle';b.innerText='\u26A1 IDLE (HEMAT DAYA)';}else if(d.running){b.className='badge badge-run';b.innerText='RUNNING (AKTIF)';}else{b.className='badge badge-stby';b.innerText='STANDBY (MATI)';}}"
    "if(uvLbl){uvLbl.innerHTML=d.idle?'<span style=\"color:#a78bfa;font-weight:700;\">\u26A1 IDLE/SLEEP</span>':(d.running?'<span style=\"color:#34d399;font-weight:700;\">&#x25CF; MENYALA</span>':'<span style=\"color:#f87171;font-weight:700;\">&#x25CF; PADAM</span>');}"
    "updateRelayButtons(d.relay1,d.relay2);"
    "setHwBadge('hwOled',d.hwOled?'ONLINE':'DISCONNECTED',d.hwOled);"
    "if(d.hwRtc){setHwBadge('hwRtc','ONLINE',true);}else{setHwBadge('hwRtc',d.softClock?'SOFT-CLOCK':'OFFLINE',false,true);}"
    "setHwBadge('hwVl',d.hwVl?'ONLINE':'DISCONNECTED',d.hwVl);"
    "setHwBadge('hwIna',d.hwIna?'ONLINE':'DISCONNECTED',d.hwIna);"
    "setBtnDisplay('valBt1','lblBt1',d.bt1);"
    "setBtnDisplay('valBt2','lblBt2',d.bt2);"
    "setBtnDisplay('valBt3','lblBt3',d.bt3);"
  );

  // ===== CHUNK 12: JAVASCRIPT - fetchStatus (sensor values & form) =====
  sendChunk(
    "var elC=document.getElementById('valCount');if(elC)elC.innerText=(typeof d.count!=='undefined')?d.count:0;"
    "var elD=document.getElementById('valDist');"
    "if(elD){var dv=(typeof d.dist!=='undefined')?d.dist:0;elD.innerText=(dv>5000?(d.hwVl?'> 2000 mm':'NO SENSOR'):dv+' mm');}"
    "var vn=(typeof d.volt==='number'&&!isNaN(d.volt))?d.volt:0;"
    "var cn=(typeof d.current==='number'&&!isNaN(d.current))?d.current:0;"
    "var pn=(typeof d.power==='number'&&!isNaN(d.power))?d.power:0;"
    "var eV=document.getElementById('valVolt');if(eV)eV.innerText=vn.toFixed(2)+' V';"
    "var eA=document.getElementById('valAmp');if(eA)eA.innerText=cn.toFixed(0)+' mA ('+(pn/1000).toFixed(2)+' W)';"
    "var eR=document.getElementById('valRtc');if(eR)eR.innerText=(d.rtcTime||'--:--:--')+(d.softClock?' [Soft]':'');"
    "var eDT=document.getElementById('currentDeviceTime');if(eDT)eDT.innerText=(d.rtcDateTime||'--')+(d.softClock?' (Mode Soft-Clock Internal)':'');"
    "if(!window._lf&&typeof d.mode!=='undefined'){"
    "window._lf=true;"
    "var mS=document.getElementById('modeSelect');if(mS)mS.value=d.mode;"
    "var sH=(d.sHour<10?'0':'')+d.sHour;var sM=(d.sMin<10?'0':'')+d.sMin;"
    "var eH=(d.eHour<10?'0':'')+d.eHour;var eM=(d.eMin<10?'0':'')+d.eMin;"
    "var st=document.getElementById('startTime');if(st)st.value=sH+':'+sM;"
    "var et=document.getElementById('endTime');if(et)et.value=eH+':'+eM;"
    "var dt=document.getElementById('distTh');if(dt)dt.value=d.distTh;"
    "var pl=document.getElementById('pulse');if(pl)pl.value=d.pulse;"
    "var cl=document.getElementById('cool');if(cl)cl.value=d.cool;"
    "var al=document.getElementById('actLow');if(al)al.value=d.actLow?'1':'0';}"
    "}).catch(function(e){console.error('Fetch err:',e);});}"
  );

  // ===== CHUNK 13: JAVASCRIPT - helper functions & action functions =====
  sendChunk(
    "function setHwBadge(id,text,isOk,isWarn){"
    "var el=document.getElementById(id);if(!el)return;"
    "el.innerText=text;el.className=isOk?'badge-hw-ok':(isWarn?'badge-hw-warn':'badge-hw-err');}"
    "function setBtnDisplay(vi,li,state){"
    "var v=document.getElementById(vi);var l=document.getElementById(li);if(!v||!l)return;"
    "v.innerText=state;"
    "if(state===0){v.style.color='#f87171';l.innerText='DITEKAN (0)';l.className='badge-hw-err';}"
    "else{v.style.color='#34d399';l.innerText='LEPAS (1)';l.className='badge-hw-ok';}}"
    "setInterval(fetchStatus,1200);fetchStatus();"
    "function showToast(id,msg,isErr){"
    "var t=document.getElementById(id);t.innerText=msg;t.style.display='block';"
    "t.style.background=isErr?'rgba(239,68,68,0.2)':'rgba(16,185,129,0.2)';"
    "t.style.color=isErr?'#f87171':'#34d399';"
    "t.style.border=isErr?'1px solid #ef4444':'1px solid #10b981';"
    "setTimeout(function(){t.style.display='none';},3500);}"
  );

  // ===== CHUNK 14: JAVASCRIPT - form handlers =====
  sendChunk(
    "function saveSchedule(e){e.preventDefault();"
    "var f=new FormData(document.getElementById('scheduleForm'));"
    "fetch('/api/schedule',{method:'POST',body:f}).then(function(r){return r.text();}).then(function(m){"
    "showToast('schedToast',m,false);fetchStatus();}).catch(function(e){showToast('schedToast','Gagal: '+e,true);});}"
    "function saveSettings(e){e.preventDefault();"
    "var f=new FormData(document.getElementById('paramForm'));"
    "fetch('/api/settings',{method:'POST',body:f}).then(function(r){return r.text();}).then(function(m){"
    "showToast('paramToast',m,false);}).catch(function(e){showToast('paramToast','Gagal: '+e,true);});}"
    "function syncWithClientTime(){"
    "var now=new Date();var f=new FormData();"
    "f.append('year',now.getFullYear());f.append('month',now.getMonth()+1);"
    "f.append('day',now.getDate());f.append('hour',now.getHours());"
    "f.append('min',now.getMinutes());f.append('sec',now.getSeconds());"
    "fetch('/api/sync-rtc',{method:'POST',body:f}).then(function(r){return r.text();}).then(function(m){"
    "showToast('rtcToast',m,false);fetchStatus();}).catch(function(e){showToast('rtcToast','Gagal: '+e,true);});}"
    "function resetPestCount(){if(!confirm('Reset hitungan hama ke 0?'))return;"
    "fetch('/api/reset-count',{method:'POST'}).then(function(r){return r.text();}).then(function(m){alert(m);fetchStatus();});}"
    "function testRelay(num){var f=new FormData();f.append('relay',num);"
    "fetch('/api/relay-test',{method:'POST',body:f}).then(function(r){return r.text();}).then(function(m){fetchStatus();});}"
    "</script></body></html>"
  );

  // Akhiri chunked transfer
  server.sendContent("");
  server.client().stop();
}

// API: Mengembalikan status sensor, RTC, tombol, dan sistem (Thread-Safe via Mutex)
void handleApiStatus() {
  static SystemState cachedState;
  static bool hasCached = false;
  SystemState local;
  bool gotData = false;

  if (xSemaphoreTake(dataMutex, pdMS_TO_TICKS(300)) == pdTRUE) {
    local = sysData;
    cachedState = sysData;
    hasCached = true;
    gotData = true;
    xSemaphoreGive(dataMutex);
  } else if (hasCached) {
    local = cachedState;
    gotData = true;
  }

  if (!gotData) {
    memset(&local, 0, sizeof(SystemState));
    local.distThreshold_mm = 100;
    local.startHour = 18;
    local.endHour = 2;
  }

  char rtcTimeStr[12];
  char rtcDateStr[35];

  snprintf(rtcTimeStr, sizeof(rtcTimeStr), "%02d:%02d:%02d",
           local.rtcHour, local.rtcMinute, local.rtcSecond);
  snprintf(rtcDateStr, sizeof(rtcDateStr), "%02d/%02d/%04d %02d:%02d:%02d",
           local.rtcDay, local.rtcMonth, local.rtcYear,
           local.rtcHour, local.rtcMinute, local.rtcSecond);

  // Proteksi Float NaN & Infinity agar JSON valid 100%
  float volt = (isnan(local.busVoltage_V) || isinf(local.busVoltage_V)) ? 0.0 : local.busVoltage_V;
  float curr = (isnan(local.current_mA) || isinf(local.current_mA)) ? 0.0 : local.current_mA;
  float pwr  = (isnan(local.power_mW) || isinf(local.power_mW)) ? 0.0 : local.power_mW;

  // Gunakan buffer statis (hemat heap, tidak ada fragmentasi dari String concatenation)
  static char jsonBuf[650];
  int len = snprintf(jsonBuf, sizeof(jsonBuf),
    "{\"count\":%lu,\"dist\":%u,"
    "\"volt\":%.2f,\"current\":%.1f,\"power\":%.1f,"
    "\"running\":%s,\"idle\":%s,\"relay1\":%s,\"relay2\":%s,"
    "\"mode\":%d,"
    "\"sHour\":%d,\"sMin\":%d,\"eHour\":%d,\"eMin\":%d,"
    "\"distTh\":%d,\"pulse\":%lu,\"cool\":%lu,"
    "\"actLow\":%s,"
    "\"rtcTime\":\"%s\",\"rtcDateTime\":\"%s\","
    "\"hwOled\":%s,\"hwRtc\":%s,\"hwVl\":%s,\"hwIna\":%s,"
    "\"softClock\":%s,"
    "\"bt1\":%d,\"bt2\":%d,\"bt3\":%d}",
    (unsigned long)local.pestCounter, (unsigned)local.currentDistance,
    volt, curr, pwr,
    local.isSystemRunning ? "true" : "false",
    local.isIdleSleeping ? "true" : "false",
    local.relay1State ? "true" : "false",
    local.relay2State ? "true" : "false",
    (int)local.mode,
    (int)local.startHour, (int)local.startMin,
    (int)local.endHour, (int)local.endMin,
    (int)local.distThreshold_mm,
    (unsigned long)local.relayPulse_ms,
    (unsigned long)local.zapCooldown_ms,
    local.relayActiveLow ? "true" : "false",
    rtcTimeStr, rtcDateStr,
    local.oledReady ? "true" : "false",
    local.rtcReady ? "true" : "false",
    local.sensorReady ? "true" : "false",
    local.inaReady ? "true" : "false",
    local.usingSoftClock ? "true" : "false",
    (int)local.bt1Raw, (int)local.bt2Raw, (int)local.bt3Raw
  );
  (void)len; // suppress unused variable warning

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  server.sendHeader("Pragma", "no-cache");
  server.sendHeader("Expires", "-1");
  server.send(200, "application/json", jsonBuf);
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

// API: Permintaan Sinkronisasi RTC / Soft-Clock (Core 0 -> Core 1 via Mutex)
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

      server.send(200, "text/plain", "Waktu sistem berhasil disinkronkan!");
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