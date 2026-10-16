
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <math.h>

#define I2C_SDA 11
#define I2C_SCL 12

Adafruit_MPU6050 mpu;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);

  if (!mpu.begin(0x68, &Wire)) {
    Serial.println("MPU6050 tidak terdeteksi!");
    while (1) {
      delay(10);
    }
  }

  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  Serial.println("Pembacaan Kemiringan MPU6050");
}

void loop() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  // Menghitung sudut dari accelerometer
  float roll = atan2(
    a.acceleration.y,
    a.acceleration.z
  ) * 180.0 / PI;

  float pitch = atan2(
    -a.acceleration.x,
    sqrt(
      a.acceleration.y * a.acceleration.y +
      a.acceleration.z * a.acceleration.z
    )
  ) * 180.0 / PI;

  Serial.print("Roll  (kiri/kanan): ");
  Serial.print(roll, 2);
  Serial.println(" derajat");

  Serial.print("Pitch (depan/belakang): ");
  Serial.print(pitch, 2);
  Serial.println(" derajat");

  Serial.println("---------------------------");

  delay(200);
}
