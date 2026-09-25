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
  lastTestStatus?: 'success' | 'failed' | null;
  lastTestTime?: string | null;
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
  microSdStorageUsedMb: number; // MicroSD 32GB
  microSdStorageTotalMb: number;
  firmwareVersion: string;
  uptimeHours: number;
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
  sirenActive: boolean;
  stroboActive: boolean;
  muted: boolean;
  sensorData: EWSSensorData;
  telegramConfig: TelegramConfig;
  thresholds: {
    tiltWarning: number; // degrees
    tiltDanger: number;
    rainWarning: number; // mm/jam
    rainDanger: number;
    soilMoistureWarning: number; // %
    vibrationDanger: number; // g
    batteryLowVoltage: number; // V
  };
}

export interface PestTrapNode {
  id: string; // e.g. "TRAP-01"
  name: string;
  location: string;
  uvLedStatus: boolean; // LED UV 395-405nm ~5W
  blowerStatus: boolean; // Centrifugal blower 12V 15-25W
  pirTriggerCount: number; // HC-SR501 trigger count
  photoelectricCount: number; // E3F-DS30C4 catch count
  containerCapacityPercent: number; // Wadah penampungan kasa
  batteryVoltage: number; // VRLA 12V 12Ah
  solarChargingCurrent: number; // Solar 30Wp (mA)
  mode: 'otomatis_malam' | 'manual' | 'hemat_energi';
  status: 'aktif' | 'standby' | 'wadah_penuh' | 'baterai_lemah';
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
