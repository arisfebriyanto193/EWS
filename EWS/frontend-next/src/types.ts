export type EWSStatus = 'aman' | 'siaga' | 'bahaya' | 'offline' | 'baterai_lemah' | 'gangguan_sensor';

export interface TelegramConfig {
  ewsId: string;
  botToken: string;
  chatId: string;
  channelName: string;
  enabled: boolean;
  notifySiaga: boolean;
  notifyBahaya: boolean;
  notifyOffline: boolean;
  notifyBateraiLemah: boolean;
  notifySensorGagal: boolean;
  notifyNormalKembali: boolean;
  dailyReport: boolean;
  lastTestStatus?: 'success' | 'failed' | 'idle' | null;
  lastTestTime?: string | null;
}


export interface TelkomselQuotaItem {
  name: string;
  remaining: string;
  total: string;
  expiryDate?: string;
  warning?: string;
}

export interface TelkomselQuotaGroup {
  category: string;
  label: string;
  totalRemaining: string;
  totalQuota: string;
  remainingPercent: number;
  items: TelkomselQuotaItem[];
}

export interface TelkomselQuotaData {
  msisdn: string;
  balance: string;
  balanceUnit: string;
  expiredDate: string;
  subscriptionType: string;
  brand?: string;
  priceplan?: string;
  location?: string;
  primaryQuota: {
    remaining: string;
    total: string;
    percent: number;
  };
  quotaGroups: TelkomselQuotaGroup[];
  lastSyncedAt: string;
}

export interface TelkomselConfig {
  ewsId: string;
  phoneNumber: string;
  msisdn: string;
  balance: number;
  balanceUnit: string;
  expiredDate: string | null;
  subscriptionType: string;
  quotaData: TelkomselQuotaData | null;
  lastSyncedAt: string | null;
  isConnected: boolean;
}

export interface EWSSensorData {
  pitchAngle: number; // Inclinometer sumbu X (derajat)
  rollAngle: number;  // Inclinometer sumbu Y (derajat)
  soilMoisture: number; // Kelembapan tanah (%)
  soilTemperature: number; // Suhu tanah (°C)
  rainfallRate: number; // Intensitas curah hujan (mm/jam)
  rainfallCumulative: number; // Akumulasi curah hujan 24 jam (mm)
  vibrationLevel: number; // Akselerometer ADXL345 (g atau m/s2)
  batteryVoltage: number; // INA219 (V) - VRLA 12V 20Ah
  batteryCurrent: number; // Arus pemakaian (mA)
  solarCurrent: number; // Arus pengisian panel surya 30Wp (mA)
  gsmSignalDbm: number; // SIMCom A7670C RSSI (dBm)
  gsmStatus: 'online' | 'weak' | 'offline';
  ipAddress?: string; // Alamat IP ESP32 (misal: "192.168.1.100")
  wifiSsid?: string; // SSID Jaringan WiFi terhubung (misal: "EWS-Network")
  wifiRssi?: number; // Kekuatan sinyal WiFi (dBm)
  wifiConnected?: boolean;
  publishMode?: 'realtime' | 'low_power_5m';
  microSdStorageUsedMb: number; // MicroSD 32GB
  microSdStorageTotalMb: number;
  firmwareVersion: string;
  uptimeHours: number;
  alarmReason?: string;
  inaAvailable?: boolean;
  lastSeenAt?: string | null;
  lastUpdated: string;
}

export interface EWSNode {
  id: string; // e.g. "EWS-01"
  name: string; // e.g. "Titik 01 - Lereng Pasir Madu"
  location: string; // e.g. "Sektor Lereng Utara - Zona Rawan 1"
  coordinates: {
    lat: number;
    lng: number;
  };
  status: EWSStatus;
  alarmReason?: string;
  sirenActive: boolean;
  stroboActive: boolean;
  muted: boolean;
  sensorData: EWSSensorData;
  telegramConfig: TelegramConfig;
  telkomselConfig?: TelkomselConfig;
  thresholds: {
    // 1. Titik Acuan Aman & Toleransi Inclinometer MPU-6050
    safeTiltPitch: number; // Baseline sudut Pitch posisi aman (derajat, misal 0.0°)
    safeTiltRoll: number;  // Baseline sudut Roll posisi aman (derajat, misal 0.0°)
    tiltTolerance: number; // Toleransi aman simpangan (± derajat, misal ±2.0°)
    tiltWarning: number;   // Ambang Siaga simpangan sudut (derajat)
    tiltDanger: number;    // Ambang Bahaya simpangan sudut (derajat)

    // 2. Curah Hujan & Kalibrasi Tipping Bucket
    rainWarning: number;     // Hujan Siaga (mm/jam)
    rainDanger: number;      // Hujan Bahaya (mm/jam)
    rainCalibPerTip: number; // Kalibrasi volume curah hujan per jungkitan (mm/tip)

    // 3. Kelembapan Tanah & Kalibrasi ADC Ktanah
    safeSoilMoisture: number;      // Baseline aman kelembapan tanah (%)
    soilMoistureTolerance: number; // Toleransi simpangan aman kelembapan tanah (± %)
    soilMoistureWarning: number;   // Ambang Siaga kelembapan jenuh (%)
    soilAdcDry: number;            // Nilai ADC saat tanah kering kerontang (0%)
    soilAdcWet: number;            // Nilai ADC saat tanah basah jenuh (100%)

    // 4. Getaran & Proteksi Baterai Aki
    vibrationDanger: number;   // Ambang Getaran Bahaya (g / pulsa)
    batteryLowVoltage: number; // Batas Baterai Lemah Cut-Off (Volt)

    // 5. Konfigurasi Siklus & Timer Alarm Otomatis
    alarmDuration?: number; // Durasi alarm sirine aktif saat anomali (detik)
    alarmPause?: number;    // Jeda istirahat sirine saat anomali berlanjut sebelum menyala kembali (detik)

    // 6. Proteksi Baterai: Alarm tetap aktif walau baterai lemah?
    forceAlarmOnLowBatt?: boolean; // true = alarm tetap nyala walau baterai lemah, false = matikan relay (default: false)
  };
}

export interface ColorPresetItem {
  id: number;
  name: string;
  r: number;
  g: number;
  b: number;
}

export interface PestTrapNode {
  id: string; // e.g. "TRAP-01"
  name: string;
  location: string;
  uvLedStatus: boolean; // LED UV / Multi-color
  blowerStatus: boolean; // Centrifugal blower
  pirTriggerCount: number; // HC-SR501 trigger count
  photoelectricCount: number; // E3F-DS30C4 catch count
  containerCapacityPercent: number; // Wadah penampungan (VL53L0X)
  batteryVoltage: number; // INA226 / ADC
  solarChargingCurrent: number; // INA226 Solar / Battery current (mA)
  currentDistance?: number; // VL53L0X distance in mm
  distThresholdMm?: number; // Ambang batas maksimal deteksi hama (mm)
  distMinMm?: number; // Batas minimal deteksi hama (mm)
  mode: 'manual' | 'otomatis' | 'otomatis_led' | 'otomatis_malam' | 'hemat_energi' | 'standby';
  status: 'aktif' | 'standby' | 'wadah_penuh' | 'baterai_lemah' | 'mati';
  activePreset?: number;
  startTime?: string; // e.g. "18:00"
  endTime?: string; // e.g. "06:00"
  ledRotationInterval?: number; // menit
  manualIntervalMin?: number; // Cooldown antar trigger blower (menit) atau interval berkala blower
  manualDurationSec?: number; // Durasi blower nyala saat deteksi hama / pemicu waktu (detik)
  sensorCooldownSec?: number; // Jeda sensor setelah blower mati sebelum bisa mendeteksi lagi (detik)
  ledColor?: string; // Hex kode / warna LED aktif
  blowerMode?: 'sensor' | 'time'; // Pemicu blower: sensor VL53L0X atau interval waktu berkala
  ledRunning?: boolean; // True jika warna LED berganti berkala, false jika 1 warna statis
  presets?: ColorPresetItem[];
  lastSeenAt?: string | null;
  isOnline?: boolean; // true jika data terakhir masuk < 10 menit lalu
  isFastTelemetry?: boolean; // True jika ESP32 sedang dalam mode telemetri cepat
  telemetryIntervalSec?: number; // Interval pengiriman detik (3 atau 300)
}

export interface AlarmLog {
  id: string;
  ewsId: string;
  ewsName: string;
  timestamp: string;
  type: 'siaga' | 'bahaya' | 'baterai_lemah' | 'offline' | 'sensor_gagal';
  triggerCause: string;
  triggerValue: string;
  durationMinutes: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgeNote?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

export type UserRole = 'superadmin' | 'operator_ews1' | 'operator_ews2' | 'operator_ews3' | 'operator_ews4' | 'public';

export interface UserAccount {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  assignedEwsId?: string; // If operator, assigned to specific EWS
  avatarUrl: string;
  department: string;
}
