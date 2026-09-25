/**
 * ==============================================================================
 * CONTOH FIRMWARE ARDUINO / ESP32: CLIENT EWS KE WEBSOCKET SERVER
 * ==============================================================================
 * Platform: ESP32 Dev Module / NodeMCU-32S
 * Koneksi : WiFi atau Modem GSM/4G SIMCom A7670C (via PPP / AT Commands)
 * Library : WebSocketsClient by Markus Sattler (Arduino Library Manager)
 *           ArduinoJson by Benoit Blanchon (v6 atau v7)
 * ==============================================================================
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// -----------------------------------------------------------------------------
// KONFIGURASI JARINGAN & SERVER
// -----------------------------------------------------------------------------
const char* WIFI_SSID     = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD = "PASSWORD_WIFI_ANDA";

// Alamat IP atau domain Backend IoT WebSocket Server
const char* WS_SERVER_HOST = "192.168.1.100"; // Ganti dengan IP server backend
const int   WS_SERVER_PORT = 3440;            // Sesuai port di server.js
const char* WS_SERVER_PATH = "/";

// Identitas Node Titik EWS
const char* EWS_ID   = "EWS-01";
const char* TOPIC_TELEMETRY = "ews/EWS-01/telemetry";
const char* TOPIC_COMMAND   = "ews/EWS-01/command";

// Pin Aktuator
const int PIN_SIREN_RELAY  = 25; // Relay Sirine 12V 110-120dB
const int PIN_STROBO_RELAY = 26; // Relay Lampu Strobo Darurat
const int PIN_BUZZER_LOCAL = 27; // Buzzer warning lokal

WebSocketsClient webSocket;
unsigned long lastTelemetryMillis = 0;
const unsigned long TELEMETRY_INTERVAL = 10000; // Kirim tiap 10 detik

// -----------------------------------------------------------------------------
// HANDLER EVENT WEBSOCKET
// -----------------------------------------------------------------------------
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] ❌ Terputus dari WebSocket Server!");
      break;

    case WStype_CONNECTED: {
      Serial.printf("[WS] ✅ Berhasil terhubung ke ws://%s:%d%s\n", WS_SERVER_HOST, WS_SERVER_PORT, WS_SERVER_PATH);

      // Subscribe ke topik kontrol untuk menerima perintah dari Web Dashboard
      StaticJsonDocument<256> subDoc;
      subDoc["action"] = "subscribe";
      subDoc["topic"] = TOPIC_COMMAND;

      String subMsg;
      serializeJson(subDoc, subMsg);
      webSocket.sendTXT(subMsg);
      Serial.printf("[WS] 📡 Mengirim subscribe ke: %s\n", TOPIC_COMMAND);
      break;
    }

    case WStype_TEXT: {
      Serial.printf("[WS] 📥 Pesan masuk: %s\n", payload);

      StaticJsonDocument<512> doc;
      DeserializationError error = deserializeJson(doc, payload);
      if (error) {
        Serial.println("[WS] Gagal parse JSON pesan masuk");
        return;
      }

      // Periksa apakah pesan untuk topik perintah kontrol
      const char* topic = doc["topic"];
      if (topic && String(topic) == TOPIC_COMMAND) {
        JsonObject payloadObj = doc["payload"];
        const char* cmd = payloadObj["command"];

        Serial.printf("[KONTROL] Menerima instruksi: %s\n", cmd);

        if (String(cmd) == "TRIGGER_ALARM") {
          const char* type = payloadObj["type"];
          Serial.printf("🚨 ALARM AKTIF (%s)! Mengaktifkan sirine & strobo\n", type);
          digitalWrite(PIN_STROBO_RELAY, HIGH);
          if (String(type) == "bahaya") {
            digitalWrite(PIN_SIREN_RELAY, HIGH);
          }
        } 
        else if (String(cmd) == "RESET_ALARM") {
          Serial.println("✅ Reset alarm. Sirine & strobo dimatikan.");
          digitalWrite(PIN_SIREN_RELAY, LOW);
          digitalWrite(PIN_STROBO_RELAY, LOW);
        }
        else if (String(cmd) == "TEST_BUZZER") {
          Serial.println("🔊 Uji coba bunyi sirine 2 detik...");
          digitalWrite(PIN_SIREN_RELAY, HIGH);
          delay(2000);
          digitalWrite(PIN_SIREN_RELAY, LOW);
        }
      }
      break;
    }

    case WStype_PONG:
      // Heartbeat respon dari server
      break;

    default:
      break;
  }
}

// -----------------------------------------------------------------------------
// FUNGSI PENGIRIMAN TELEMETRI SENSOR KE WEBSOCKET
// -----------------------------------------------------------------------------
void sendSensorTelemetry() {
  if (!webSocket.isConnected()) return;

  // Baca nilai sensor (Simulasi / Modbus RS485 riil)
  float pitchAngle = 0.14 + (random(-5, 5) / 100.0); // Inclinometer X
  float rollAngle  = -0.08 + (random(-5, 5) / 100.0); // Inclinometer Y
  float soilMoist  = 42.5 + (random(-10, 10) / 10.0); // Sensor tanah %
  float soilTemp   = 24.8 + (random(-5, 5) / 10.0);   // Suhu tanah °C
  float rainRate   = 0.0;                             // Curah hujan mm/jam
  float rainCumul  = 18.4;
  float vibration  = 0.02 + (random(0, 10) / 1000.0); // ADXL345 (g)
  float battVolt   = 12.8;                            // INA219 (V)
  int   battCurr   = 410;                             // mA
  int   solarCurr  = 1820;                            // mA (Panel 30Wp)
  int   gsmSignal  = -68;                             // RSSI A7670C
  int   uptimeHours = (millis() / 3600000) + 342;

  // ---------------------------------------------------------------------------
  // CONTOH 1: PENGIRIMAN PER-TOPIK DATA SENSOR MANDIRI (SESUAI PERMINTAAN)
  // Tiap data memiliki topiknya sendiri (misal: ews/EWS-01/pitch, ews/EWS-01/rainfall_rate)
  // ---------------------------------------------------------------------------
  // Format RAW: ews/EWS-01/pitch|1.45 atau JSON: {"action":"publish","topic":"ews/EWS-01/pitch","payload":1.45}
  
  webSocket.sendTXT("ews/" + String(EWS_ID) + "/pitch|" + String(pitchAngle, 2));
  webSocket.sendTXT("ews/" + String(EWS_ID) + "/roll|" + String(rollAngle, 2));
  webSocket.sendTXT("ews/" + String(EWS_ID) + "/soil_moisture|" + String(soilMoist, 1));
  webSocket.sendTXT("ews/" + String(EWS_ID) + "/soil_temperature|" + String(soilTemp, 1));
  webSocket.sendTXT("ews/" + String(EWS_ID) + "/rainfall_rate|" + String(rainRate, 1));
  webSocket.sendTXT("ews/" + String(EWS_ID) + "/rainfall_cumulative|" + String(rainCumul, 1));
  webSocket.sendTXT("ews/" + String(EWS_ID) + "/vibration|" + String(vibration, 3));
  webSocket.sendTXT("ews/" + String(EWS_ID) + "/battery_voltage|" + String(battVolt, 2));
  webSocket.sendTXT("ews/" + String(EWS_ID) + "/solar_current|" + String(solarCurr));
  webSocket.sendTXT("ews/" + String(EWS_ID) + "/gsm_signal|" + String(gsmSignal));

  Serial.println("[WS] 📤 Data sensor terkirim per-topik individu (pitch, roll, rain, soil, vib, batt)");

  // ---------------------------------------------------------------------------
  // CONTOH 2: BUNDLE JSON TELEMETRI (OPSIONAL / BACKWARD COMPATIBILITY)
  // ---------------------------------------------------------------------------
  StaticJsonDocument<768> doc;
  doc["action"] = "publish";
  doc["topic"]  = TOPIC_TELEMETRY;

  JsonObject p = doc.createNestedObject("payload");
  p["pitchAngle"]         = pitchAngle;
  p["rollAngle"]          = rollAngle;
  p["soilMoisture"]       = soilMoist;
  p["soilTemperature"]    = soilTemp;
  p["rainfallRate"]       = rainRate;
  p["rainfallCumulative"] = rainCumul;
  p["vibrationLevel"]     = vibration;
  p["batteryVoltage"]     = battVolt;
  p["batteryCurrent"]     = battCurr;
  p["solarCurrent"]       = solarCurr;
  p["gsmSignalDbm"]       = gsmSignal;
  p["gsmStatus"]          = "online";
  p["uptimeHours"]        = uptimeHours;
  p["firmwareVersion"]    = "v2.4.1-ESP32-A7670C";

  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(output);
}

// -----------------------------------------------------------------------------
// SETUP & LOOP UTAMA
// -----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=============================================");
  Serial.println("  ESP32 EWS IOT CLIENT - WEBSOCKET INTEGRATION");
  Serial.println("=============================================");

  pinMode(PIN_SIREN_RELAY, OUTPUT);
  pinMode(PIN_STROBO_RELAY, OUTPUT);
  pinMode(PIN_BUZZER_LOCAL, OUTPUT);
  digitalWrite(PIN_SIREN_RELAY, LOW);
  digitalWrite(PIN_STROBO_RELAY, LOW);
  digitalWrite(PIN_BUZZER_LOCAL, LOW);

  // Sambungkan ke WiFi (atau inisialisasi GSM A7670C)
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Menghubungkan ke WiFi %s ", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi terhubung! IP: " + WiFi.localIP().toString());

  // Inisialisasi WebSocket Client
  // Header User-Agent 'Arduino-ESP32' akan lolos filter verifyClient di server
  webSocket.setExtraHeaders("User-Agent: Arduino-ESP32-EWS-Client\r\n");
  webSocket.begin(WS_SERVER_HOST, WS_SERVER_PORT, WS_SERVER_PATH);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000); // Coba sambung kembali tiap 5 detik jika putus
  webSocket.enableHeartbeat(15000, 3000, 2);
}

void loop() {
  webSocket.loop();

  // Pengiriman berkala data telemetri
  unsigned long now = millis();
  if (now - lastTelemetryMillis >= TELEMETRY_INTERVAL) {
    lastTelemetryMillis = now;
    sendSensorTelemetry();
  }
}
