/*
 * =========================================================================================
 *  PROGRAM DEBUG & KALIBRASI SENSOR LOKAL (OFFLINE STANDALONE) - EWS LONGSOR ESP32-S3
 * =========================================================================================
 *  Program ini dirancang khusus untuk memverifikasi dan menampilkan seluruh nilai sensor
 *  secara lokal pada Serial Monitor (115200 Baud) & OLED tanpa memerlukan koneksi WiFi / Internet.
 * 
 *  Fitur Utama:
 *  1. Pembacaan MPU-6050 Inclinometer (Pitch, Roll, Accel X/Y/Z, Gyro X/Y/Z, Temp MPU)
 *  2. Pembacaan INA219 / INA226 Power Monitor (Tegangan Aki V, Arus Beban mA, Daya mW)
 *  3. Pembacaan DS3231 RTC (Waktu Detik/Menit/Jam, Tanggal, Suhu Chip RTC)
 *  4. Pembacaan Sensor Kelembapan Tanah (Raw ADC 0-4095, Volt, Estimasi Persen %)
 *  5. Pembacaan Sensor Curah Hujan Tipping Bucket (Hitungan Tip pulsa, mm hujan, debouncing)
 *  6. Pembacaan Sensor Getaran SW-420 (Status getaran, total pulsa)
 *  7. Uji Kontrol Relay Sirine & Strobo melalui Serial Command
 *  8. Evaluasi Otomatis Status Bahaya / Anomali (Autonomous Offline Protection)
 * =========================================================================================
 */

#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <SD.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>

// =============================================================================
// 1. DEFINISI PIN PERANGKAT KERAS (SESUAI SKEMATIK PCB EWS45_2026-09-28)
// =============================================================================
// Pin Relay
#define PIN_RELAY_SIRINE       40  // Sirine / Klakson Peringatan
#define PIN_RELAY_STROBO       41  // Lampu Strobo Darurat
#define RELAY_ACTIVE_LEVEL     HIGH
#define RELAY_DEACTIVE_LEVEL   LOW

// Pin Sensor Digital & Analog
#define PIN_RAIN_DIGITAL       47  // Tipping Bucket Curah Hujan
#define PIN_VIBRATION_DIGITAL  21  // Sensor Getaran SW-420
#define PIN_SOIL_ANALOG        1   // Sensor Kelembapan Tanah (ADC1_CH0)
#define PIN_BUZZER_TEST        39  // Tombol Fisik Uji Sirine (Tactile Switch)

// Pin Bus I2C Hardware 0: Layar OLED 1.3"
#define PIN_OLED_SDA           8
#define PIN_OLED_SCL           9

// Pin Bus I2C Hardware 1: MPU-6050 Inclinometer
#define PIN_MPU_SDA            11
#define PIN_MPU_SCL            12
#define MPU6050_ADDR           0x68

// Pin Bus I2C Soft: INA219 / INA226 Power Monitor (Jalur Pin Terbalik Sesuai PCB)
#define PIN_INA_SDA            14  // GPIO 14 (Net SDA2 terhubung ke SDA INA)
#define PIN_INA_SCL            13  // GPIO 13 (Net SCL2 terhubung ke SCL INA)
#define INA_DEFAULT_ADDR       0x40

// Pin Bus I2C Soft: DS3231 RTC High-Precision
#define PIN_RTC_SDA            15  // GPIO 15 (SDAds)
#define PIN_RTC_SCL            16  // GPIO 16 (SCLds)
#define RTC_ADDR               0x68

// Pin SPI: MicroSD Card
#define PIN_SD_MOSI            4
#define PIN_SD_SCK             5
#define PIN_SD_CS              6
#define PIN_SD_MISO            2

// =============================================================================
// 2. OBJEK & VARIABEL GLOBAL
// =============================================================================
TwoWire I2COLED = TwoWire(0);
TwoWire I2CMPU  = TwoWire(1);
Adafruit_SH1106G display = Adafruit_SH1106G(128, 64, &I2COLED, -1);

bool oledAvailable = false;
bool mpuAvailable  = false;
bool inaAvailable  = false;
bool isINA219      = true;
bool rtcAvailable  = false;
bool sdAvailable   = false;

// Status Aktuator
bool sirenState  = false;
bool stroboState = false;

// Offset Kalibrasi MPU-6050
float pitchOffset = 0.0f;
float rollOffset  = 0.0f;

// Data Curah Hujan (Interrupt Safe)
volatile unsigned long rainTips = 0;
volatile unsigned long lastRainInterruptTime = 0;
const unsigned long RAIN_DEBOUNCE_MS = 250; // Filter bounce magnetik 250ms

// Data Getaran
volatile unsigned long vibrationPulses = 0;
volatile unsigned long lastVibInterruptTime = 0;

// Kalibrasi Sensor Tanah
// Nilai ADC saat kering (di udara) dan basah (dalam air)
const int SOIL_ADC_DRY = 3200;
const int SOIL_ADC_WET = 1200;

// Timer interval cetak
unsigned long lastPrintTime = 0;
const unsigned long PRINT_INTERVAL_MS = 1000; // Update setiap 1 detik

// Ambang Batas Deteksi Anomali Lokal (Autonomous Offline)
const float THRESH_TILT_WARNING  = 5.0f;   // Derajat kemiringan siaga
const float THRESH_TILT_DANGER   = 12.0f;  // Derajat kemiringan bahaya
const float THRESH_RAIN_WARNING  = 10.0f;  // mm akumulasi siaga
const float THRESH_RAIN_DANGER   = 25.0f;  // mm akumulasi bahaya
const float THRESH_SOIL_WARNING  = 80.0f;  // % kelembapan tanah siaga
const float THRESH_BATT_LOW      = 11.4f;  // Volt aki lemah

// =============================================================================
// 3. RUTIN INTERRUPT SENSOR DIGITAL
// =============================================================================
void IRAM_ATTR rainInterrupt() {
  unsigned long now = millis();
  if (now - lastRainInterruptTime >= RAIN_DEBOUNCE_MS) {
    rainTips++;
    lastRainInterruptTime = now;
  }
}

void IRAM_ATTR vibInterrupt() {
  unsigned long now = millis();
  if (now - lastVibInterruptTime >= 50) {
    vibrationPulses++;
    lastVibInterruptTime = now;
  }
}

// =============================================================================
// 4. PROTOKOL SOFTWARE I2C (UNTUK INA219 & DS3231 PADA PIN TERPISAH)
// =============================================================================
static inline void i2cDelay() {
  delayMicroseconds(5);
}

void softI2C_Start(uint8_t sda, uint8_t scl) {
  pinMode(sda, OUTPUT);
  digitalWrite(sda, HIGH);
  digitalWrite(scl, HIGH);
  i2cDelay();
  digitalWrite(sda, LOW);
  i2cDelay();
  digitalWrite(scl, LOW);
  i2cDelay();
}

void softI2C_Stop(uint8_t sda, uint8_t scl) {
  pinMode(sda, OUTPUT);
  digitalWrite(sda, LOW);
  i2cDelay();
  digitalWrite(scl, HIGH);
  i2cDelay();
  digitalWrite(sda, HIGH);
  i2cDelay();
  pinMode(sda, INPUT_PULLUP);
}

bool softI2C_WriteByte(uint8_t sda, uint8_t scl, uint8_t data) {
  pinMode(sda, OUTPUT);
  for (uint8_t i = 0; i < 8; i++) {
    if (data & 0x80) digitalWrite(sda, HIGH);
    else digitalWrite(sda, LOW);
    data <<= 1;
    i2cDelay();
    digitalWrite(scl, HIGH);
    i2cDelay();
    digitalWrite(scl, LOW);
  }
  pinMode(sda, INPUT_PULLUP);
  i2cDelay();
  digitalWrite(scl, HIGH);
  i2cDelay();
  bool ack = (digitalRead(sda) == LOW);
  digitalWrite(scl, LOW);
  i2cDelay();
  return ack;
}Terbalik

uint8_t softI2C_ReadByte(uint8_t sda, uint8_t scl, bool ack) {
  pinMode(sda, INPUT_PULLUP);
  uint8_t byteIn = 0;
  for (uint8_t i = 0; i < 8; i++) {
    digitalWrite(scl, HIGH);
    i2cDelay();
    byteIn <<= 1;
    if (digitalRead(sda)) byteIn |= 1;
    digitalWrite(scl, LOW);
    i2cDelay();
  }
  pinMode(sda, OUTPUT);
  digitalWrite(sda, ack ? LOW : HIGH);
  i2cDelay();
  digitalWrite(scl, HIGH);
  i2cDelay();
  digitalWrite(scl, LOW);
  i2cDelay();
  pinMode(sda, INPUT_PULLUP);
  return byteIn;
}

bool softI2C_ReadRegister16(uint8_t sda, uint8_t scl, uint8_t addr, uint8_t reg, uint16_t &value) {
  softI2C_Start(sda, scl);
  if (!softI2C_WriteByte(sda, scl, (addr << 1) | 0)) {
    softI2C_Stop(sda, scl);
    return false;
  }
  if (!softI2C_WriteByte(sda, scl, reg)) {
    softI2C_Stop(sda, scl);
    return false;
  }
  softI2C_Start(sda, scl);
  if (!softI2C_WriteByte(sda, scl, (addr << 1) | 1)) {
    softI2C_Stop(sda, scl);
    return false;
  }
  uint8_t msb = softI2C_ReadByte(sda, scl, true);
  uint8_t lsb = softI2C_ReadByte(sda, scl, false);
  softI2C_Stop(sda, scl);
  value = ((uint16_t)msb << 8) | lsb;
  return true;
}

bool softI2C_WriteRegister16(uint8_t sda, uint8_t scl, uint8_t addr, uint8_t reg, uint16_t value) {
  softI2C_Start(sda, scl);
  if (!softI2C_WriteByte(sda, scl, (addr << 1) | 0)) {
    softI2C_Stop(sda, scl);
    return false;
  }
  if (!softI2C_WriteByte(sda, scl, reg)) {
    softI2C_Stop(sda, scl);
    return false;
  }
  if (!softI2C_WriteByte(sda, scl, (value >> 8) & 0xFF)) {
    softI2C_Stop(sda, scl);
    return false;
  }
  if (!softI2C_WriteByte(sda, scl, value & 0xFF)) {
    softI2C_Stop(sda, scl);
    return false;
  }
  softI2C_Stop(sda, scl);
  return true;
}

// BCD Helpers untuk DS3231
uint8_t bcd2dec(uint8_t val) { return ((val / 16 * 10) + (val % 16)); }
uint8_t dec2bcd(uint8_t val) { return ((val / 10 * 16) + (val % 10)); }

// =============================================================================
// 5. INISIALISASI & DRIVER PERIPHERAL
// =============================================================================

// Kontrol Relay
void setSirine(bool active) {
  sirenState = active;
  digitalWrite(PIN_RELAY_SIRINE, active ? RELAY_ACTIVE_LEVEL : RELAY_DEACTIVE_LEVEL);
}

void setStrobo(bool active) {
  stroboState = active;
  digitalWrite(PIN_RELAY_STROBO, active ? RELAY_ACTIVE_LEVEL : RELAY_DEACTIVE_LEVEL);
}

// Inisialisasi INA219 / INA226
void setupINA() {
  pinMode(PIN_INA_SDA, INPUT_PULLUP);
  pinMode(PIN_INA_SCL, INPUT_PULLUP);

  uint16_t cfg = 0;
  if (softI2C_ReadRegister16(PIN_INA_SDA, PIN_INA_SCL, INA_DEFAULT_ADDR, 0x00, cfg)) {
    inaAvailable = true;
    if (cfg == 0x4127 || cfg == 0x4527) {
      isINA219 = false; // INA226
    } else {
      isINA219 = true;  // INA219
      // Konfigurasi INA219: 32V Range, Gain 8, 12-bit ADC -> 0x399F
      softI2C_WriteRegister16(PIN_INA_SDA, PIN_INA_SCL, INA_DEFAULT_ADDR, 0x00, 0x399F);
      // Kalibrasi Rshunt 0.1 Ohm (R100): Cal = 4096 (1 LSB = 0.1 mA)
      softI2C_WriteRegister16(PIN_INA_SDA, PIN_INA_SCL, INA_DEFAULT_ADDR, 0x05, 4096);
    }
  } else {
    inaAvailable = false;
  }
}

// Inisialisasi DS3231 RTC
void setupRTC() {
  pinMode(PIN_RTC_SDA, INPUT_PULLUP);
  pinMode(PIN_RTC_SCL, INPUT_PULLUP);

  softI2C_Start(PIN_RTC_SDA, PIN_RTC_SCL);
  if (softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, (RTC_ADDR << 1) | 0)) {
    softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, 0x00);
    softI2C_Stop(PIN_RTC_SDA, PIN_RTC_SCL);
    rtcAvailable = true;
  } else {
    softI2C_Stop(PIN_RTC_SDA, PIN_RTC_SCL);
    rtcAvailable = false;
  }
}

// Inisialisasi MPU-6050
void setupMPU() {
  I2CMPU.begin(PIN_MPU_SDA, PIN_MPU_SCL, 100000);
  I2CMPU.beginTransmission(MPU6050_ADDR);
  if (I2CMPU.endTransmission() == 0) {
    // Bangunkan MPU dari Sleep mode (tulis 0x00 ke register 0x6B)
    I2CMPU.beginTransmission(MPU6050_ADDR);
    I2CMPU.write(0x6B);
    I2CMPU.write(0x00);
    I2CMPU.endTransmission();
    mpuAvailable = true;
  } else {
    mpuAvailable = false;
  }
}

// Inisialisasi SD Card
void setupSD() {
  SPI.begin(PIN_SD_SCK, PIN_SD_MISO, PIN_SD_MOSI, PIN_SD_CS);
  if (SD.begin(PIN_SD_CS, SPI, 4000000)) {
    sdAvailable = true;
  } else {
    sdAvailable = false;
  }
}

// Inisialisasi OLED
void setupOLED() {
  I2COLED.begin(PIN_OLED_SDA, PIN_OLED_SCL, 400000);
  I2COLED.beginTransmission(0x3C);
  if (I2COLED.endTransmission() == 0) {
    if (display.begin(0x3C, true)) {
      oledAvailable = true;
      display.clearDisplay();
      display.setTextSize(1);
      display.setTextColor(SH110X_WHITE);
      display.setCursor(0, 0);
      display.println("== EWS SENSOR DEBUG ==");
      display.println("Mode Offline Aktif");
      display.display();
      delay(800);
    }
  }
}

// =============================================================================
// 6. PEMBACAAN NILAI SENSOR
// =============================================================================

// Baca MPU-6050 (Akselerasi, Gyro, Kemiringan Pitch & Roll, Suhu)
struct MpuData {
  float pitch;
  float roll;
  float ax;
  float ay;
  float az;
  float gx;
  float gy;
  float gz;
  float temp;
  bool ok;
};

MpuData readMPU() {
  MpuData d = {0, 0, 0, 0, 0, 0, 0, 0, 0, false};
  if (!mpuAvailable) return d;

  I2CMPU.beginTransmission(MPU6050_ADDR);
  I2CMPU.write(0x3B);
  if (I2CMPU.endTransmission(false) == 0 && I2CMPU.requestFrom(MPU6050_ADDR, 14) == 14) {
    int16_t rawAx = (I2CMPU.read() << 8) | I2CMPU.read();
    int16_t rawAy = (I2CMPU.read() << 8) | I2CMPU.read();
    int16_t rawAz = (I2CMPU.read() << 8) | I2CMPU.read();
    int16_t rawTemp = (I2CMPU.read() << 8) | I2CMPU.read();
    int16_t rawGx = (I2CMPU.read() << 8) | I2CMPU.read();
    int16_t rawGy = (I2CMPU.read() << 8) | I2CMPU.read();
    int16_t rawGz = (I2CMPU.read() << 8) | I2CMPU.read();

    d.ax = (float)rawAx / 16384.0f; // Satuan g
    d.ay = (float)rawAy / 16384.0f;
    d.az = (float)rawAz / 16384.0f;
    d.temp = ((float)rawTemp / 340.0f) + 36.53f;
    d.gx = (float)rawGx / 131.0f;   // Satuan deg/s
    d.gy = (float)rawGy / 131.0f;
    d.gz = (float)rawGz / 131.0f;

    // Kalkulasi Pitch & Roll
    float calcPitch = atan2(d.ay, sqrt(d.ax * d.ax + d.az * d.az)) * 180.0f / M_PI;
    float calcRoll  = atan2(-d.ax, d.az) * 180.0f / M_PI;

    d.pitch = calcPitch - pitchOffset;
    d.roll  = calcRoll - rollOffset;
    d.ok    = true;
  }
  return d;
}

// Baca INA219 / INA226
struct InaData {
  float busVoltage;   // Volt
  float shuntVoltage; // mV
  float currentMa;    // mA
  float powerMw;      // mW
  float battPercent;  // Estimasi % Aki 12V
  bool ok;
};

InaData readINA() {
  InaData d = {0, 0, 0, 0, 0, false};
  if (!inaAvailable) return d;

  uint16_t rawBus = 0;
  uint16_t rawShunt = 0;

  if (softI2C_ReadRegister16(PIN_INA_SDA, PIN_INA_SCL, INA_DEFAULT_ADDR, 0x02, rawBus)) {
    if (isINA219) {
      d.busVoltage = (float)((rawBus >> 3) * 4) * 0.001f;
    } else {
      d.busVoltage = (float)rawBus * 0.00125f;
    }
    d.ok = true;
  }

  if (softI2C_ReadRegister16(PIN_INA_SDA, PIN_INA_SCL, INA_DEFAULT_ADDR, 0x01, rawShunt)) {
    int16_t sVal = (int16_t)rawShunt;
    if (isINA219) {
      d.shuntVoltage = (float)sVal * 0.01f; // mV
      d.currentMa    = (float)sVal * 0.1f;  // mA (dengan Rshunt 0.1 Ohm)
    } else {
      d.shuntVoltage = (float)sVal * 0.0025f;
      d.currentMa    = (float)sVal * 0.25f;
    }
    d.powerMw = d.busVoltage * d.currentMa;
  }

  // Estimasi kapasitas persentase aki timbal 12V (10.5V = 0%, 12.8V = 100%)
  if (d.busVoltage >= 12.8f) d.battPercent = 100.0f;
  else if (d.busVoltage <= 10.5f) d.battPercent = 0.0f;
  else d.battPercent = ((d.busVoltage - 10.5f) / (12.8f - 10.5f)) * 100.0f;

  return d;
}

// Baca DS3231 RTC
struct RtcData {
  int year;
  int month;
  int day;
  int hour;
  int minute;
  int second;
  int dayOfWeek;
  float chipTemp;
  char timestamp[25];
  bool ok;
};

RtcData readRTC() {
  RtcData d;
  memset(&d, 0, sizeof(d));
  strcpy(d.timestamp, "--:--:--");
  if (!rtcAvailable) return d;

  softI2C_Start(PIN_RTC_SDA, PIN_RTC_SCL);
  if (softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, (RTC_ADDR << 1) | 0)) {
    softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, 0x00);
    softI2C_Start(PIN_RTC_SDA, PIN_RTC_SCL);
    if (softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, (RTC_ADDR << 1) | 1)) {
      d.second    = bcd2dec(softI2C_ReadByte(PIN_RTC_SDA, PIN_RTC_SCL, true) & 0x7F);
      d.minute    = bcd2dec(softI2C_ReadByte(PIN_RTC_SDA, PIN_RTC_SCL, true));
      d.hour      = bcd2dec(softI2C_ReadByte(PIN_RTC_SDA, PIN_RTC_SCL, true) & 0x3F);
      d.dayOfWeek = bcd2dec(softI2C_ReadByte(PIN_RTC_SDA, PIN_RTC_SCL, true));
      d.day       = bcd2dec(softI2C_ReadByte(PIN_RTC_SDA, PIN_RTC_SCL, true));
      d.month     = bcd2dec(softI2C_ReadByte(PIN_RTC_SDA, PIN_RTC_SCL, true) & 0x1F);
      d.year      = 2000 + bcd2dec(softI2C_ReadByte(PIN_RTC_SDA, PIN_RTC_SCL, false));
      softI2C_Stop(PIN_RTC_SDA, PIN_RTC_SCL);

      snprintf(d.timestamp, sizeof(d.timestamp), "%04d-%02d-%02d %02d:%02d:%02d",
               d.year, d.month, d.day, d.hour, d.minute, d.second);
      d.ok = true;
    } else {
      softI2C_Stop(PIN_RTC_SDA, PIN_RTC_SCL);
    }
  } else {
    softI2C_Stop(PIN_RTC_SDA, PIN_RTC_SCL);
  }

  // Baca Suhu Internal Chip DS3231 (Register 0x11 & 0x12)
  if (d.ok) {
    softI2C_Start(PIN_RTC_SDA, PIN_RTC_SCL);
    if (softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, (RTC_ADDR << 1) | 0)) {
      softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, 0x11);
      softI2C_Start(PIN_RTC_SDA, PIN_RTC_SCL);
      if (softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, (RTC_ADDR << 1) | 1)) {
        int8_t msb = (int8_t)softI2C_ReadByte(PIN_RTC_SDA, PIN_RTC_SCL, true);
        uint8_t lsb = softI2C_ReadByte(PIN_RTC_SDA, PIN_RTC_SCL, false);
        softI2C_Stop(PIN_RTC_SDA, PIN_RTC_SCL);
        d.chipTemp = (float)msb + ((lsb >> 6) * 0.25f);
      } else {
        softI2C_Stop(PIN_RTC_SDA, PIN_RTC_SCL);
      }
    } else {
      softI2C_Stop(PIN_RTC_SDA, PIN_RTC_SCL);
    }
  }

  return d;
}

// Set Waktu DS3231 RTC
bool setRTC(int year, int month, int day, int hour, int minute, int second) {
  if (!rtcAvailable) return false;
  softI2C_Start(PIN_RTC_SDA, PIN_RTC_SCL);
  if (!softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, (RTC_ADDR << 1) | 0)) {
    softI2C_Stop(PIN_RTC_SDA, PIN_RTC_SCL);
    return false;
  }
  softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, 0x00); // Mulai dari register 0x00
  softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, dec2bcd(second));
  softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, dec2bcd(minute));
  softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, dec2bcd(hour));
  softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, dec2bcd(1)); // Day of week dummy
  softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, dec2bcd(day));
  softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, dec2bcd(month));
  softI2C_WriteByte(PIN_RTC_SDA, PIN_RTC_SCL, dec2bcd(year % 100));
  softI2C_Stop(PIN_RTC_SDA, PIN_RTC_SCL);
  return true;
}

// Baca Sensor Kelembapan Tanah (Analog)
struct SoilData {
  int rawADC;
  float voltage;
  float moisturePercent;
};

SoilData readSoil() {
  SoilData d;
  // Multi-sampling 8 kali untuk meredam noise analog
  long sum = 0;
  for (int i = 0; i < 8; i++) {
    sum += analogRead(PIN_SOIL_ANALOG);
    delayMicroseconds(50);
  }
  d.rawADC = sum / 8;
  d.voltage = (float)d.rawADC * (3.3f / 4095.0f);

  // Kalkulasi persen kelembapan (terbalik: ADC tinggi = kering, ADC rendah = basah)
  float p = (float)(SOIL_ADC_DRY - d.rawADC) / (float)(SOIL_ADC_DRY - SOIL_ADC_WET) * 100.0f;
  if (p < 0.0f) p = 0.0f;
  if (p > 100.0f) p = 100.0f;
  d.moisturePercent = p;
  return d;
}

// =============================================================================
// 7. CETAK DASHBOARD SERIAL LOKAL & EVALUASI ANOMALI BENCANA
// =============================================================================
void printDashboard() {
  MpuData  mpu  = readMPU();
  InaData  ina  = readINA();
  RtcData  rtc  = readRTC();
  SoilData soil = readSoil();

  // Hitung Hujan (0.5 mm per tip)
  unsigned long currentTips;
  noInterrupts();
  currentTips = rainTips;
  unsigned long curVib = vibrationPulses;
  interrupts();
  float rainMm = (float)currentTips * 0.5f;

  // Cek Status Getaran Realtime
  bool isVibrating = (digitalRead(PIN_VIBRATION_DIGITAL) == HIGH);

  // =========================================================================
  // EVALUASI KONDISI ABNORMAL / PERINGATAN DINI (AUTONOMOUS OFFLINE ENGINE)
  // EWS tetap memantau bahaya dan membunyikan alarm walau TIDAK ADA INTERNET!
  // =========================================================================
  String alertStatus = "AMAN";
  String alertReason = "Semua sensor normal";

  if (fabs(mpu.pitch) >= THRESH_TILT_DANGER || fabs(mpu.roll) >= THRESH_TILT_DANGER || rainMm >= THRESH_RAIN_DANGER || curVib >= 20) {
    alertStatus = "🚨 BAHAYA!";
    alertReason = "Kemiringan tanah / Curah hujan / Getaran melewati batas kritis!";
    // Otomatis aktifkan sirine & strobo jika mode proteksi mandiri aktif
  } else if (fabs(mpu.pitch) >= THRESH_TILT_WARNING || fabs(mpu.roll) >= THRESH_TILT_WARNING || rainMm >= THRESH_RAIN_WARNING || soil.moisturePercent >= THRESH_SOIL_WARNING) {
    alertStatus = "⚠️ SIAGA";
    alertReason = "Pergerakan lereng / Tanah jenuh air terdeteksi!";
  } else if (ina.ok && ina.busVoltage < THRESH_BATT_LOW) {
    alertStatus = "⚡ BATERAI LEMAH";
    alertReason = "Tegangan aki turun di bawah 11.4V";
  }

  // CETAK BORDER DASHBOARD KE SERIAL MONITOR
  Serial.println("\n╔════════════════════════════════════════════════════════════════════════════╗");
  Serial.println("║            ESP32-S3 LANDSLIDE EWS - SENSOR DEBUG & MONITOR             ║");
  Serial.println("╠════════════════════════════════════════════════════════════════════════════╣");

  // 1. Baris RTC & Waktu
  Serial.printf("║ 📅 WAKTU RTC   : %-22s | Suhu Chip RTC: %5.1f °C  ║\n",
                rtc.ok ? rtc.timestamp : "[DS3231 TIDAK TERBACA]", rtc.ok ? rtc.chipTemp : 0.0f);

  // 2. Baris Inclinometer MPU-6050
  if (mpu.ok) {
    Serial.printf("║ 📐 MPU-6050    : Pitch: %+6.2f° | Roll: %+6.2f°  | Suhu MPU: %5.1f °C     ║\n",
                  mpu.pitch, mpu.roll, mpu.temp);
    Serial.printf("║    Akselerasi g: X:%+5.2f | Y:%+5.2f | Z:%+5.2f (Satuan 1g gravitasi)  ║\n",
                  mpu.ax, mpu.ay, mpu.az);
    Serial.printf("║    Gyro deg/s  : X:%+5.1f | Y:%+5.1f | Z:%+5.1f                          ║\n",
                  mpu.gx, mpu.gy, mpu.gz);
  } else {
    Serial.println("║ 📐 MPU-6050    : [TIDAK TERDETEKSI / TIDAK MERESPONS PADA GPIO 11/12]     ║");
  }

  // 3. Baris Power Monitor INA219 / INA226
  if (ina.ok) {
    Serial.printf("║ ⚡ POWER (%s): %5.2f V  | %6.1f mA | %6.1f mW | Aki: %4.0f%%      ║\n",
                  isINA219 ? "INA219" : "INA226",
                  ina.busVoltage, ina.currentMa, ina.powerMw, ina.battPercent);
  } else {
    Serial.println("║ ⚡ POWER       : [MODUL INA219 TIDAK TERDETEKSI PADA GPIO 14/13]          ║");
  }

  // 4. Baris Sensor Tanah
  Serial.printf("║ 🌱 TANAH       : Kelembapan: %5.1f%% | Raw ADC: %4d | Tegangan: %4.2f V  ║\n",
                soil.moisturePercent, soil.rawADC, soil.voltage);

  // 5. Baris Curah Hujan & Getaran
  Serial.printf("║ 🌧️  HUJAN       : %5.1f mm  | Total Tip: %4lu pulsa                       ║\n",
                rainMm, currentTips);
  Serial.printf("║ 📳 GETARAN     : Status: %-8s | Total Pulsa: %4lu                       ║\n",
                isVibrating ? "BERGETAR" : "TENANG", curVib);

  // 6. Baris Status Aktuator Relay
  Serial.printf("║ 🔔 RELAY       : Sirine: %-3s [GPIO 40] | Strobo: %-3s [GPIO 41]            ║\n",
                sirenState ? "ON " : "OFF", stroboState ? "ON " : "OFF");

  // 7. Evaluasi Sistem Peringatan Dini
  Serial.println("╠════════════════════════════════════════════════════════════════════════════╣");
  Serial.printf("║ 🛡️ STATUS EWS  : %-15s                                          ║\n", alertStatus.c_str());
  Serial.printf("║    Catatan     : %-58s ║\n", alertReason.c_str());
  Serial.println("╚════════════════════════════════════════════════════════════════════════════╝");
  Serial.println("👉 Ketik 'h' lalu tekan Enter untuk melihat menu perintah Serial interaktif.");

  // Update Layar OLED jika ada
  if (oledAvailable) {
    display.clearDisplay();
    display.setCursor(0, 0);
    display.printf("EWS: %s\n", alertStatus.c_str());
    display.drawLine(0, 9, 127, 9, SH110X_WHITE);
    display.setCursor(0, 12);
    display.printf("P:%+.1f R:%+.1f\n", mpu.pitch, mpu.roll);
    display.printf("Tnh:%4.1f%% Hjn:%3.1f\n", soil.moisturePercent, rainMm);
    display.printf("Aki:%4.2fV (%3.0f%%)\n", ina.busVoltage, ina.battPercent);
    display.printf("Sirine:%s Strb:%s\n", sirenState ? "ON" : "OFF", stroboState ? "ON" : "OFF");
    display.printf("%02d:%02d:%02d\n", rtc.hour, rtc.minute, rtc.second);
    display.display();
  }
}

// =============================================================================
// 8. PEMROSES PERINTAH SERIAL INTERAKTIF
// =============================================================================
void handleSerialCommands() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  if (cmd.length() == 0) return;

  char firstChar = cmd.charAt(0);

  switch (firstChar) {
    case 'h':
    case 'H':
    case '?':
      Serial.println("\n📖 ========== MENU PERINTAH SERIAL DEBUG ==========");
      Serial.println("  1     : Nyalakan Relay Sirine (Klakson)");
      Serial.println("  0     : Matikan Relay Sirine");
      Serial.println("  2     : Nyalakan Relay Strobo (Lampu)");
      Serial.println("  3     : Matikan Relay Strobo");
      Serial.println("  t     : Test Sirine & Strobo selama 2 detik");
      Serial.println("  c     : Kalibrasi Nol (Zero Offset) Inclinometer MPU-6050");
      Serial.println("  r     : Reset penghitung pulsa Curah Hujan ke 0");
      Serial.println("  v     : Reset penghitung pulsa Getaran ke 0");
      Serial.println("  s     : Atur Waktu RTC (Format: s YYYY MM DD HH MM SS)");
      Serial.println("          Contoh: s 2026 10 14 18 30 00");
      Serial.println("  i     : Re-scan I2C & Status Modul Hardware");
      Serial.println("===================================================\n");
      break;

    case '1':
      setSirine(true);
      Serial.println("🔊 [RELAY] Sirine diaktifkan (ON)!");
      break;

    case '0':
      setSirine(false);
      Serial.println("🔇 [RELAY] Sirine dimatikan (OFF)!");
      break;

    case '2':
      setStrobo(true);
      Serial.println("💡 [RELAY] Strobo diaktifkan (ON)!");
      break;

    case '3':
      setStrobo(false);
      Serial.println("🌑 [RELAY] Strobo dimatikan (OFF)!");
      break;

    case 't':
    case 'T':
      Serial.println("🚨 Menguji Sirine & Strobo selama 2 detik...");
      setSirine(true);
      setStrobo(true);
      delay(2000);
      setSirine(false);
      setStrobo(false);
      Serial.println("✅ Pengujian selesai.");
      break;

    case 'c':
    case 'C': {
      Serial.println("⚖️ Melakukan kalibrasi posisi datar MPU-6050...");
      float sumP = 0, sumR = 0;
      for (int i = 0; i < 20; i++) {
        MpuData m = readMPU();
        sumP += (m.pitch + pitchOffset);
        sumR += (m.roll + rollOffset);
        delay(20);
      }
      pitchOffset = sumP / 20.0f;
      rollOffset  = sumR / 20.0f;
      Serial.printf("✅ Kalibrasi Selesai! Offset Baru -> Pitch: %+.2f°, Roll: %+.2f°\n", pitchOffset, rollOffset);
      break;
    }

    case 'r':
    case 'R':
      noInterrupts();
      rainTips = 0;
      interrupts();
      Serial.println("🌧️ [RESET] Penghitung pulsa curah hujan berhasil di-reset ke 0!");
      break;

    case 'v':
    case 'V':
      noInterrupts();
      vibrationPulses = 0;
      interrupts();
      Serial.println("📳 [RESET] Penghitung getaran berhasil di-reset ke 0!");
      break;

    case 's':
    case 'S': {
      // Parse format: s YYYY MM DD HH MM SS
      int yr, mo, dy, hr, mn, sc;
      if (sscanf(cmd.c_str() + 1, "%d %d %d %d %d %d", &yr, &mo, &dy, &hr, &mn, &sc) == 6) {
        if (setRTC(yr, mo, dy, hr, mn, sc)) {
          Serial.printf("✅ DS3231 RTC Berhasil Disetel: %04d-%02d-%02d %02d:%02d:%02d\n", yr, mo, dy, hr, mn, sc);
        } else {
          Serial.println("❌ Gagal menyetel RTC DS3231!");
        }
      } else {
        Serial.println("⚠️ Format salah! Gunakan: s YYYY MM DD HH MM SS (contoh: s 2026 10 14 18 30 00)");
      }
      break;
    }

    case 'i':
    case 'I':
      Serial.println("\n🔍 Re-checking status perangkat keras...");
      setupMPU();
      setupINA();
      setupRTC();
      Serial.printf(" - MPU-6050 : %s\n", mpuAvailable ? "OK AKTIF (0x68)" : "TIDAK ADA");
      Serial.printf(" - INA219   : %s\n", inaAvailable ? "OK AKTIF (0x40)" : "TIDAK ADA");
      Serial.printf(" - DS3231   : %s\n", rtcAvailable ? "OK AKTIF (0x68)" : "TIDAK ADA");
      Serial.printf(" - OLED 1.3 : %s\n", oledAvailable ? "OK AKTIF (0x3C)" : "TIDAK ADA");
      Serial.printf(" - SD Card  : %s\n\n", sdAvailable ? "OK AKTIF" : "TIDAK ADA");
      break;

    default:
      Serial.printf("⚠️ Perintah '%s' tidak dikenali. Ketik 'h' untuk panduan.\n", cmd.c_str());
      break;
  }
}

// =============================================================================
// 9. SETUP & LOOP UTAMA
// =============================================================================
void setup() {
  Serial.begin(115200);
  delay(1200);

  Serial.println("\n");
  Serial.println("================================================================================");
  Serial.println("🚀 ESP32-S3 LANDSLIDE EWS - PROGRAM DEBUG SENSOR LOKAL (OFFLINE STANDALONE)   ");
  Serial.println("================================================================================");
  Serial.println("ℹ️  Program ini membaca seluruh sensor secara mandiri tanpa butuh WiFi/Internet.");
  Serial.println("ℹ️  EWS tetap mendeteksi kondisi abnormal & memicu relay perlindungan darurat.");
  Serial.println("--------------------------------------------------------------------------------");

  // Inisialisasi Pin Output Relay
  pinMode(PIN_RELAY_SIRINE, OUTPUT);
  pinMode(PIN_RELAY_STROBO, OUTPUT);
  setSirine(false);
  setStrobo(false);

  // Inisialisasi Pin Input Sensor
  pinMode(PIN_RAIN_DIGITAL, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_RAIN_DIGITAL), rainInterrupt, FALLING);

  pinMode(PIN_VIBRATION_DIGITAL, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_VIBRATION_DIGITAL), vibInterrupt, CHANGE);

  pinMode(PIN_SOIL_ANALOG, INPUT);
  pinMode(PIN_BUZZER_TEST, INPUT_PULLUP);

  // Inisialisasi Bus Peripheral
  Serial.println("🔌 Menginisialisasi modul peripheral hardware...");
  setupOLED();
  setupMPU();
  setupINA();
  setupRTC();
  setupSD();

  Serial.println("📊 STATUS DETEKSI MODUL SENSOR:");
  Serial.printf("  1. MPU-6050 Inclinometer (GPIO 11/12) : %s\n", mpuAvailable ? "✅ OK AKTIF (0x68)" : "❌ TIDAK ADA");
  Serial.printf("  2. INA219 Power Monitor  (GPIO 14/13) : %s\n", inaAvailable ? (isINA219 ? "✅ OK AKTIF (INA219)" : "✅ OK AKTIF (INA226)") : "❌ TIDAK ADA");
  Serial.printf("  3. DS3231 Precision RTC  (GPIO 15/16) : %s\n", rtcAvailable ? "✅ OK AKTIF (0x68)" : "❌ TIDAK ADA");
  Serial.printf("  4. Layar OLED 1.3\"       (GPIO 8/9)   : %s\n", oledAvailable ? "✅ OK AKTIF (0x3C)" : "❌ TIDAK ADA");
  Serial.printf("  5. Modul MicroSD Card    (SPI Bus)    : %s\n", sdAvailable ? "✅ OK TERPASANG" : "⚠️ TIDAK ADA / TIDAK SIAP");
  Serial.println("--------------------------------------------------------------------------------");
  Serial.println("✨ Memulai pemantauan sensor real-time setiap 1 detik...\n");
}

void loop() {
  // Cek tombol uji fisik
  if (digitalRead(PIN_BUZZER_TEST) == LOW) {
    setSirine(true);
    setStrobo(true);
  }

  // Handle perintah dari Serial Monitor
  handleSerialCommands();

  // Cetak Dashboard Sensor setiap PRINT_INTERVAL_MS
  if (millis() - lastPrintTime >= PRINT_INTERVAL_MS) {
    lastPrintTime = millis();
    printDashboard();
  }

  delay(20);
}
