
#include <Wire.h>
#include <RTClib.h>

#define I2C_SDA 15
#define I2C_SCL 16

RTC_DS3231 rtc;

const char* daysOfTheWeek[] = {
  "Minggu", "Senin", "Selasa", "Rabu",
  "Kamis", "Jumat", "Sabtu"
};

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Inisialisasi I2C ESP32-S3
  Wire.begin(I2C_SDA, I2C_SCL);

  Serial.println("\n=== RTC DS3231 ESP32-S3 ===");

  // Periksa RTC
  if (!rtc.begin()) {
    Serial.println("RTC DS3231 tidak ditemukan!");
    Serial.println("Periksa kabel SDA, SCL, VCC, dan GND.");

    while (1) {
      delay(100);
    }
  }

  Serial.println("RTC DS3231 terdeteksi.");

  // Atur waktu jika RTC kehilangan daya
  if (rtc.lostPower()) {
    Serial.println("Waktu RTC belum diatur.");
    Serial.println("Mengatur berdasarkan waktu kompilasi.");

    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }

  // Untuk mengatur waktu secara manual, aktifkan
  // baris berikut, sesuaikan tanggal dan waktunya,
  // lalu upload sekali. Setelah itu, beri komentar lagi.
  // rtc.adjust(DateTime(2026, 10, 16, 14, 30, 0));

  Serial.println("RTC siap digunakan.");
  Serial.println("------------------------------");
}

void loop() {
  DateTime now = rtc.now();

  Serial.print("Hari     : ");
  Serial.println(daysOfTheWeek[now.dayOfTheWeek()]);

  Serial.print("Tanggal  : ");
  if (now.day() < 10) Serial.print('0');
  Serial.print(now.day());
  Serial.print('-');

  if (now.month() < 10) Serial.print('0');
  Serial.print(now.month());
  Serial.print('-');
  Serial.println(now.year());

  Serial.print("Jam      : ");
  if (now.hour() < 10) Serial.print('0');
  Serial.print(now.hour());
  Serial.print(':');

  if (now.minute() < 10) Serial.print('0');
  Serial.print(now.minute());
  Serial.print(':');

  if (now.second() < 10) Serial.print('0');
  Serial.println(now.second());

  Serial.println("------------------------------");

  delay(1000);
}
