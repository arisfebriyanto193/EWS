/*
 * ==============================================================================
 * MULTI-BUS I2C SCANNER UNTUK SISTEM EWS (EARLY WARNING SYSTEM)
 * Hardware Target : ESP32-S3 (ESP32S3N16R8)
 * Dokumen PCB     : Schematic_EWS45_2026-09-28.pdf
 * Kecepatan Serial: 115200 Baud
 * ==============================================================================
 * 
 * Program ini memindai (scan) seluruh jalur I2C yang ada pada PCB EWS:
 *   1. BUS OLED        : SDA = GPIO 8,  SCL = GPIO 9   (Alamat normal: 0x3C / 0x3D)
 *   2. BUS MPU-6050    : SDA = GPIO 11, SCL = GPIO 12  (Alamat normal: 0x68 / 0x69)
 *   3. BUS INA POWER   : SDA = GPIO 13, SCL = GPIO 14  (Alamat normal: 0x40, 0x41, 0x44, 0x45)
 *                        + Opsi pin terbalik: SDA = GPIO 14, SCL = GPIO 13
 *   4. BUS RTC DS3231  : SDA = GPIO 15, SCL = GPIO 16  (Alamat normal: 0x68 [RTC], 0x57 [EEPROM])
 *                        + Opsi pin terbalik: SDA = GPIO 16, SCL = GPIO 15
 * 
 * Fitur:
 *   - Mengidentifikasi nama perangkat berdasarkan alamat hex I2C yang ditemukan
 *   - Melakukan deteksi otomatis jalur terbalik (reversed pins)
 *   - Menampilkan tabel ringkasan hasil scan yang langsung terlihat di Serial Monitor
 * ==============================================================================
 */

#include <Arduino.h>
#include <Wire.h>

// Definisi pin sesuai skematik PCB EWS
#define PIN_OLED_SDA   8
#define PIN_OLED_SCL   9

#define PIN_MPU_SDA    11
#define PIN_MPU_SCL    12

#define PIN_INA_SDA    13
#define PIN_INA_SCL    14

#define PIN_RTC_SDA    15
#define PIN_RTC_SCL    16

// Struktur deskripsi bus I2C
struct I2CBusConfig {
  const char* busName;
  int sdaPin;
  int sclPin;
};

// Daftar bus I2C yang diuji
const I2CBusConfig BUS_LIST[] = {
  { "OLED Display 1.3\" (J5)",            PIN_OLED_SDA, PIN_OLED_SCL },
  { "MPU-6050 Inclinometer (U4)",        PIN_MPU_SDA,  PIN_MPU_SCL  },
  { "INA219 / INA226 Power Monitor (U3)", PIN_INA_SDA,  PIN_INA_SCL  },
  { "INA219 / INA226 (Pin Terbalik)",    PIN_INA_SCL,  PIN_INA_SDA  },
  { "DS3231 High-Precision RTC",         PIN_RTC_SDA,  PIN_RTC_SCL  },
  { "DS3231 RTC (Pin Terbalik)",         PIN_RTC_SCL,  PIN_RTC_SDA  }
};

const int TOTAL_BUS = sizeof(BUS_LIST) / sizeof(BUS_LIST[0]);

// Fungsi menerjemahkan alamat I2C ke nama perangkat umum
const char* getDeviceGuess(byte address) {
  switch (address) {
    case 0x27: return "LCD 1602/2004 (PCF8574T)";
    case 0x38: return "AHT10 / AHT20 Temp & Humidity";
    case 0x3C: return "OLED (SSD1306 / SH1106)";
    case 0x3D: return "OLED (Alamat Alternatif)";
    case 0x3F: return "LCD 1602/2004 (PCF8574AT)";
    case 0x40: return "INA219 / INA226 (Default 0x40)";
    case 0x41: return "INA219 / INA226 (0x41)";
    case 0x44: return "INA219 / INA226 (0x44)";
    case 0x45: return "INA219 / INA226 (0x45)";
    case 0x48: return "ADS1115 ADC 16-Bit / LM75";
    case 0x57: return "AT24C32 EEPROM (Memori Modul DS3231)";
    case 0x68: return "DS3231 RTC / MPU-6050 (0x68)";
    case 0x69: return "MPU-6050 (AD0=HIGH, 0x69)";
    case 0x76: return "BMP280 / BME280 (0x76)";
    case 0x77: return "BMP280 / BME280 (0x77)";
    default:   return "Perangkat I2C";
  }
}

// Fungsi scan I2C pada pin SDA & SCL tertentu menggunakan Wire
int scanI2CBus(const char* label, int sda, int scl, String &details) {
  Serial.println();
  Serial.println("--------------------------------------------------------------------------------");
  Serial.printf("🔍 MEMINDAI BUS: %s (SDA=%d, SCL=%d)\n", label, sda, scl);

  Wire.end();
  delay(10);
  bool wireOk = Wire.begin(sda, scl, 100000);
  if (!wireOk) {
    Serial.println("   ❌ Gagal inisialisasi I2C Wire pada pin tersebut!");
    details = "Gagal inisialisasi GPIO";
    return -1;
  }
  Wire.setTimeOut(30);

  int devicesFound = 0;
  details = "";

  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();

    if (error == 0) {
      char hexStr[32];
      snprintf(hexStr, sizeof(hexStr), "0x%02X (%s)", address, getDeviceGuess(address));
      if (details.length() > 0) details += ", ";
      details += hexStr;

      Serial.printf("   ✅ DITEMUKAN: Alamat 0x%02X -> %s\n", address, getDeviceGuess(address));
      devicesFound++;
    }
  }

  if (devicesFound == 0) {
    Serial.println("   ⭕ Tidak ada perangkat I2C yang merespons pada bus ini.");
    details = "Tidak Terdeteksi (Kosong)";
  }

  return devicesFound;
}

void setup() {
  Serial.begin(115200);
  
  unsigned long startWait = millis();
  while (!Serial && (millis() - startWait < 2500)) {
    delay(10);
  }

  delay(300);
  Serial.println("\n");
  Serial.println("================================================================================");
  Serial.println("       ESP32-S3 MULTI-BUS I2C SCANNER UNTUK PCB EWS (EARLY WARNING SYSTEM)      ");
  Serial.println("================================================================================");
  Serial.printf(" [1] OLED Display         : SDA=GPIO %d, SCL=GPIO %d\n", PIN_OLED_SDA, PIN_OLED_SCL);
  Serial.printf(" [2] MPU-6050 Inclinometer: SDA=GPIO %d, SCL=GPIO %d\n", PIN_MPU_SDA, PIN_MPU_SCL);
  Serial.printf(" [3] INA219/226 Power     : SDA=GPIO %d, SCL=GPIO %d\n", PIN_INA_SDA, PIN_INA_SCL);
  Serial.printf(" [4] DS3231 RTC Module    : SDA=GPIO %d, SCL=GPIO %d\n", PIN_RTC_SDA, PIN_RTC_SCL);
  Serial.println("================================================================================");
}

void loop() {
  static unsigned long scanCount = 1;
  Serial.println();
  Serial.printf("🚀 >>> MEMULAI PEMINDAIAN I2C LENGKAP #%lu <<<\n", scanCount++);

  int totalOverall = 0;
  String results[TOTAL_BUS];
  int counts[TOTAL_BUS];

  for (int i = 0; i < TOTAL_BUS; i++) {
    counts[i] = scanI2CBus(BUS_LIST[i].busName, BUS_LIST[i].sdaPin, BUS_LIST[i].sclPin, results[i]);
    if (counts[i] > 0) {
      totalOverall += counts[i];
    }
    delay(50);
  }

  // ============================================================================
  // TABEL RINGKASAN HASIL SCAN (SANGAT MUDAH DIBACA DI BAWAH)
  // ============================================================================
  Serial.println();
  Serial.println("================================================================================");
  Serial.println("📊 TABEL RINGKASAN STATUS DETEKSI MODUL HARDWARE I2C:");
  Serial.println("================================================================================");
  for (int i = 0; i < TOTAL_BUS; i++) {
    if (counts[i] > 0) {
      Serial.printf(" [%d] %-33s : [OK AKTIF] -> %s\n", i + 1, BUS_LIST[i].busName, results[i].c_str());
    } else {
      Serial.printf(" [%d] %-33s : [TIDAK ADA]\n", i + 1, BUS_LIST[i].busName);
    }
  }
  Serial.println("--------------------------------------------------------------------------------");
  Serial.printf("🎉 Total Chip I2C Merespons: %d chip\n", totalOverall);
  Serial.println("⏳ Pemindaian ulang otomatis dalam 5 detik...");
  Serial.println("================================================================================\n");

  delay(5000);
}
