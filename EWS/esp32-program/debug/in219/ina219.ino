
#include <Wire.h>
#include <Adafruit_INA219.h>

// Konfigurasi pin ESP32-S3
#define I2C_SDA 14
#define I2C_SCL 13

// Alamat I2C default INA219
Adafruit_INA219 ina219(0x40);

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Inisialisasi I2C
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);

  Serial.println();
  Serial.println("================================");
  Serial.println(" MONITOR TEGANGAN DAN ARUS INA219");
  Serial.println(" ESP32-S3");
  Serial.println("================================");

  // Inisialisasi sensor
  if (!ina219.begin(&Wire)) {
    Serial.println("ERROR: INA219 tidak terdeteksi!");
    Serial.println("Periksa kabel SDA, SCL, VCC, dan GND.");

    while (true) {
      delay(100);
    }
  }

  // Pengaturan kalibrasi standar library
  ina219.setCalibration_32V_2A();

  Serial.println("INA219 berhasil terhubung.");
  Serial.println();
}

void loop() {
  // Membaca data sensor
  float busVoltage_V = ina219.getBusVoltage_V();
  float shuntVoltage_mV = ina219.getShuntVoltage_mV();
  float current_mA = ina219.getCurrent_mA();
  float power_mW = ina219.getPower_mW();

  // Perkiraan tegangan pada sisi VIN+
  float sourceVoltage_V =
      busVoltage_V + (shuntVoltage_mV / 1000.0);

  // Menampilkan hasil
  Serial.println("--------------------------------");

  Serial.print("Tegangan bus    : ");
  Serial.print(busVoltage_V, 3);
  Serial.println(" V");

  Serial.print("Tegangan sumber : ");
  Serial.print(sourceVoltage_V, 3);
  Serial.println(" V");

  Serial.print("Tegangan shunt  : ");
  Serial.print(shuntVoltage_mV, 3);
  Serial.println(" mV");

  Serial.print("Arus            : ");
  Serial.print(current_mA, 2);
  Serial.println(" mA");

  Serial.print("Arus            : ");
  Serial.print(current_mA / 1000.0, 4);
  Serial.println(" A");

  Serial.print("Daya            : ");
  Serial.print(power_mW, 2);
  Serial.println(" mW");

  Serial.print("Daya            : ");
  Serial.print(power_mW / 1000.0, 3);
  Serial.println(" W");

  Serial.println("--------------------------------");

  delay(1000);
}
