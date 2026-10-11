/*
 * ==============================================================================
 * PROGRAM I2C SCANNER DIAGNOSTIK - ESP32
 * Proyek: Perangkap Hama Otomatis
 * ==============================================================================
 * Pin I2C Default:
 *   SDA : GPIO 21
 *   SCL : GPIO 22
 * 
 * Daftar Alamat I2C Perangkat pada Alat Ini:
 *   0x29 : Sensor Jarak VL53L0X (Time-of-Flight)
 *   0x3C : Display OLED 0.96" SSD1306 (atau 0x3D)
 *   0x40 : Sensor Tegangan & Arus INA226
 *   0x57 : AT24C32 EEPROM (Onboard Modul RTC DS3231) 
 *   0x68 : RTC DS3231 Real Time Clock
 * ==============================================================================
 */

#include <Arduino.h>
#include <Wire.h>

// Definisi Pin I2C
#define PIN_I2C_SDA   21
#define PIN_I2C_SCL   22

// Frekuensi I2C (100 kHz untuk stabilitas kabel/modul panjang)
#define I2C_CLOCK_SPEED 100000

// Fungsi untuk mengenali modul berdasarkan alamat I2C
String getDeviceName(byte address) {
  switch (address) {
    case 0x29: return "VL53L0X (Sensor Jarak Laser ToF)";
    case 0x3C: return "OLED SSD1306 0.96\" (Display)";
    case 0x3D: return "OLED SSD1306 (Alamat Alternatif)";
    case 0x40: return "INA226 (Sensor Arus & Tegangan DC)";
    case 0x41: return "INA226 (Alamat Alternatif A0=VCC)";
    case 0x44: return "INA226 (Alamat Alternatif A0=SDA)";
    case 0x45: return "INA226 (Alamat Alternatif A0=SCL)";
    case 0x50: return "AT24C32 EEPROM (Default Base)";
    case 0x57: return "AT24C32 EEPROM (Onboard Modul DS3231)";
    case 0x68: return "DS3231 (RTC Real Time Clock) / MPU6050";
    default:   return "Perangkat I2C Tidak Dikenal";
  }
}

void scanI2CBus() {
  byte error, address;
  int nDevices = 0;

  Serial.println("\n=======================================================");
  Serial.println(">> MEMULAI PEMINDAIAN BUS I2C (SDA=21, SCL=22, 100kHz)...");
  Serial.println("=======================================================");

  for (address = 1; address < 127; address++) {
    // Membuka transmisi ke alamat I2C
    Wire.beginTransmission(address);
    error = Wire.endTransmission();

    if (error == 0) {
      Serial.print("[+] Ditemukan di 0x");
      if (address < 16) Serial.print("0");
      Serial.print(address, HEX);
      Serial.print(" (Desimal: ");
      Serial.print(address);
      Serial.print(") -> ");
      Serial.println(getDeviceName(address));
      nDevices++;
    } else if (error == 4) {
      Serial.print("[!] Error bus di alamat 0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
    }
  }

  Serial.println("-------------------------------------------------------");
  if (nDevices == 0) {
    Serial.println("[!] PERINGATAN: TIDAK ADA PERANGKAT I2C YANG DITEMUKAN!");
    Serial.println("    Periksa:");
    Serial.println("    1. Koneksi kabel SDA (GPIO 21) dan SCL (GPIO 22).");
    Serial.println("    2. Sumber tegangan VCC (3.3V / 5V) dan Ground (GND).");
    Serial.println("    3. Resistor Pull-up pada jalur I2C (jika ada).");
  } else {
    Serial.print("[v] Selesai. Total perangkat terdeteksi: ");
    Serial.println(nDevices);
    
    // Status checklist modul proyek
    Serial.println("\n--- Checklist Modul Alat Perangkap Hama ---");
    
    // Cek DS3231
    Wire.beginTransmission(0x68);
    bool hasRTC = (Wire.endTransmission() == 0);
    Serial.printf(" - RTC DS3231 (0x68)        : %s\n", hasRTC ? "OK (TERHUBUNG)" : "TIDAK DITEMUKAN");

    // Cek EEPROM RTC
    Wire.beginTransmission(0x57);
    bool hasEEPROM = (Wire.endTransmission() == 0);
    Serial.printf(" - EEPROM DS3231 (0x57)     : %s\n", hasEEPROM ? "OK (TERHUBUNG)" : "TIDAK DITEMUKAN");

    // Cek INA226
    Wire.beginTransmission(0x40);
    bool hasINA = (Wire.endTransmission() == 0);
    Serial.printf(" - Sensor INA226 (0x40)     : %s\n", hasINA ? "OK (TERHUBUNG)" : "TIDAK DITEMUKAN");

    // Cek OLED
    Wire.beginTransmission(0x3C);
    bool hasOLED = (Wire.endTransmission() == 0);
    Serial.printf(" - OLED SSD1306 (0x3C)      : %s\n", hasOLED ? "OK (TERHUBUNG)" : "TIDAK DITEMUKAN");

    // Cek VL53L0X
    Wire.beginTransmission(0x29);
    bool hasVL53 = (Wire.endTransmission() == 0);
    Serial.printf(" - Sensor Jarak VL53 (0x29) : %s\n", hasVL53 ? "OK (TERHUBUNG)" : "TIDAK DITEMUKAN");
  }
  Serial.println("=======================================================\n");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n\n#######################################################");
  Serial.println("#         DIAGNOSTIK I2C SCANNER - ESP32              #");
  Serial.println("#   Proyek Perangkap Hama Otomatis Berbasis ESP32     #");
  Serial.println("#######################################################");

  // Inisialisasi bus I2C dengan pin dan frekuensi yang ditentukan
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(I2C_CLOCK_SPEED);

  Serial.printf("Inisialisasi I2C: SDA=GPIO%d, SCL=GPIO%d, Speed=%d Hz\n", PIN_I2C_SDA, PIN_I2C_SCL, I2C_CLOCK_SPEED);

  // Scan pertama kali saat boot
  scanI2CBus();
}

void loop() {
  // Pindai ulang setiap 4 detik untuk memantau koneksi kabel yang longgar/goyang
  delay(4000);
  scanI2CBus();
}
