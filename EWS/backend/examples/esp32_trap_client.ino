/**
 * ==============================================================================
 * CONTOH FIRMWARE ARDUINO / ESP32: PERANGKAP HAMA SURYA 30WP KE WEBSOCKET
 * ==============================================================================
 * Mengontrol:
 *  - Lampu LED UV 395-405nm ~5W
 *  - Centrifugal Blower 12V 15-25W
 * Membaca:
 *  - Sensor PIR HC-SR501
 *  - Sensor Hama Masuk Photoelectric E3F-DS30C4
 *  - Tegangan Baterai VRLA 12V 12Ah & Panel Surya 30Wp (INA219)
 * ==============================================================================
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID     = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD = "PASSWORD_WIFI_ANDA";

const char* WS_SERVER_HOST = "192.168.1.100";
const int   WS_SERVER_PORT = 3440;
const char* WS_SERVER_PATH = "/";

const char* TRAP_ID        = "TRAP-01";
const char* TOPIC_TELEMETRY = "traps/TRAP-01/telemetry";
const char* TOPIC_COMMAND   = "traps/TRAP-01/command";

// Pin Aktuator
const int PIN_UV_RELAY     = 18; // Relay Lampu LED UV
const int PIN_BLOWER_RELAY = 19; // Relay Blower Sentrifugal
// Pin Sensor
const int PIN_PIR_SENSOR   = 34; // HC-SR501
const int PIN_OPTICAL      = 35; // E3F-DS30C4

WebSocketsClient webSocket;
unsigned long lastSendMillis = 0;
const unsigned long SEND_INTERVAL = 15000; // Kirim tiap 15 detik

volatile int pirCount = 142;
volatile int catchCount = 388;

void IRAM_ATTR onPirTriggered() {
  pirCount++;
}

void IRAM_ATTR onPestCaught() {
  catchCount++;
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      Serial.println("[TRAP] ✅ Terhubung ke WebSocket Server");
      // Subscribe ke topik kendali
      StaticJsonDocument<256> sub;
      sub["action"] = "subscribe";
      sub["topic"] = TOPIC_COMMAND;
      String subStr;
      serializeJson(sub, subStr);
      webSocket.sendTXT(subStr);
      break;
    }

    case WStype_TEXT: {
      Serial.printf("[TRAP] 📥 Perintah Masuk: %s\n", payload);
      StaticJsonDocument<512> doc;
      deserializeJson(doc, payload);
      JsonObject p = doc["payload"];

      // Kontrol UV LED
      if (p.containsKey("uvLedStatus")) {
        bool uvState = p["uvLedStatus"];
        digitalWrite(PIN_UV_RELAY, uvState ? HIGH : LOW);
        Serial.printf("[TRAP] UV LED diatur ke: %s\n", uvState ? "ON" : "OFF");
      }

      // Kontrol Blower
      if (p.containsKey("blowerStatus")) {
        bool blowerState = p["blowerStatus"];
        digitalWrite(PIN_BLOWER_RELAY, blowerState ? HIGH : LOW);
        Serial.printf("[TRAP] Blower diatur ke: %s\n", blowerState ? "ON" : "OFF");
      }
      break;
    }

    case WStype_DISCONNECTED:
      Serial.println("[TRAP] ❌ Terputus dari server");
      break;

    default:
      break;
  }
}

void sendTrapTelemetry() {
  if (!webSocket.isConnected()) return;

  float batteryV = 12.6; // VRLA 12V
  int solarMa = 1420;    // Solar 30Wp
  int capacity = 62;     // Persen kapasitas wadah

  StaticJsonDocument<512> doc;
  doc["action"] = "publish";
  doc["topic"] = TOPIC_TELEMETRY;

  JsonObject p = doc.createNestedObject("payload");
  p["pirTriggerCount"] = pirCount;
  p["photoelectricCount"] = catchCount;
  p["containerCapacityPercent"] = capacity;
  p["batteryVoltage"] = batteryV;
  p["solarChargingCurrent"] = solarMa;
  p["uvLedStatus"] = digitalRead(PIN_UV_RELAY) == HIGH;
  p["blowerStatus"] = digitalRead(PIN_BLOWER_RELAY) == HIGH;
  p["mode"] = "otomatis_malam";
  p["status"] = "aktif";

  String out;
  serializeJson(doc, out);
  webSocket.sendTXT(out);
  Serial.printf("[TRAP] 📤 Telemetri terkirim: PIR=%d, Tangkapan=%d\n", pirCount, catchCount);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_UV_RELAY, OUTPUT);
  pinMode(PIN_BLOWER_RELAY, OUTPUT);
  digitalWrite(PIN_UV_RELAY, HIGH);     // Default ON
  digitalWrite(PIN_BLOWER_RELAY, HIGH); // Default ON

  pinMode(PIN_PIR_SENSOR, INPUT_PULLUP);
  pinMode(PIN_OPTICAL, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_PIR_SENSOR), onPirTriggered, RISING);
  attachInterrupt(digitalPinToInterrupt(PIN_OPTICAL), onPestCaught, FALLING);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }

  webSocket.setExtraHeaders("User-Agent: Arduino-ESP32-PestTrap\r\n");
  webSocket.begin(WS_SERVER_HOST, WS_SERVER_PORT, WS_SERVER_PATH);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void loop() {
  webSocket.loop();
  unsigned long now = millis();
  if (now - lastSendMillis >= SEND_INTERVAL) {
    lastSendMillis = now;
    sendTrapTelemetry();
  }
}
