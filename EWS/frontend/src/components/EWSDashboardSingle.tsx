import React, { useState } from 'react';
import { EWSNode, UserAccount, TelegramConfig } from '../types';
import {
  Activity,
  AlertTriangle,
  Battery,
  Bell,
  CheckCircle,
  Clock,
  Compass,
  Database,
  Droplets,
  HardDrive,
  MapPin,
  Maximize2,
  Minimize2,
  Radio,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  Sliders,
  Sun,
  Thermometer,
  Volume2,
  VolumeX,
  Wifi,
  Zap,
} from 'lucide-react';
import { TelegramConfigModal } from './TelegramConfigModal';

interface EWSDashboardSingleProps {
  ews: EWSNode;
  currentUser: UserAccount;
  onUpdateEws: (updated: EWSNode) => void;
  onTriggerAlarm: (ewsId: string, type: 'siaga' | 'bahaya') => void;
  onResetAlarm: (ewsId: string) => void;
}

export const EWSDashboardSingle: React.FC<EWSDashboardSingleProps> = ({
  ews,
  currentUser,
  onUpdateEws,
  onTriggerAlarm,
  onResetAlarm,
}) => {
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [historyRange, setHistoryRange] = useState<'1h' | '24h' | '7d'>('24h');
  const [activeChartMetric, setActiveChartMetric] = useState<'tilt' | 'rain' | 'moisture' | 'power'>('tilt');
  const [ackModalOpen, setAckModalOpen] = useState(false);
  const [ackNote, setAckNote] = useState('');
  const [isSirenTesting, setIsSirenTesting] = useState(false);

  const isOperator = currentUser.role.startsWith('operator_');
  const isSuperadmin = currentUser.role === 'superadmin';
  const canControl = isSuperadmin || currentUser.assignedEwsId === ews.id;

  const handleSaveTelegram = (newConfig: TelegramConfig) => {
    onUpdateEws({
      ...ews,
      telegramConfig: newConfig,
    });
  };

  const handleToggleMute = () => {
    onUpdateEws({
      ...ews,
      muted: !ews.muted,
    });
  };

  const handleTestSiren = () => {
    setIsSirenTesting(true);
    onUpdateEws({
      ...ews,
      sirenActive: true,
      stroboActive: true,
    });

    setTimeout(() => {
      setIsSirenTesting(false);
      onUpdateEws({
        ...ews,
        sirenActive: false,
        stroboActive: ews.status === 'bahaya' || ews.status === 'siaga',
      });
    }, 4000);
  };

  const handleAcknowledge = () => {
    if (!ackNote.trim()) return;
    onUpdateEws({
      ...ews,
      muted: true,
    });
    setAckModalOpen(false);
    setAckNote('');
  };

  // Status badges & styling
  const getStatusBadge = () => {
    switch (ews.status) {
      case 'bahaya':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-red-950 text-red-300 border border-red-500/80 animate-pulse">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            BAHAYA (KRITIS)
          </span>
        );
      case 'siaga':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-950 text-amber-300 border border-amber-500/80">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            STATUS SIAGA
          </span>
        );
      case 'offline':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
            <Radio className="w-4 h-4 text-slate-500" />
            TERPUTUS (OFFLINE)
          </span>
        );
      case 'baterai_lemah':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-orange-950 text-orange-300 border border-orange-500/80">
            <Battery className="w-4 h-4 text-orange-400" />
            BATERAI LEMAH
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-500/60">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            KONDISI AMAN (NORMAL)
          </span>
        );
    }
  };

  // Generate synthetic trend line points based on active range
  const chartPoints = [
    { time: '00:00', tilt: 0.12, rain: 0.0, moisture: 41, battery: 12.4 },
    { time: '04:00', tilt: 0.14, rain: 2.4, moisture: 44, battery: 12.2 },
    { time: '08:00', tilt: 0.13, rain: 8.6, moisture: 49, battery: 12.8 },
    { time: '12:00', tilt: 0.22, rain: 18.2, moisture: 58, battery: 13.1 },
    { time: '16:00', tilt: ews.sensorData.pitchAngle * 0.8, rain: ews.sensorData.rainfallRate * 0.7, moisture: ews.sensorData.soilMoisture * 0.9, battery: 12.9 },
    { time: 'Sekarang', tilt: ews.sensorData.pitchAngle, rain: ews.sensorData.rainfallRate, moisture: ews.sensorData.soilMoisture, battery: ews.sensorData.batteryVoltage },
  ];

  return (
    <div className="space-y-6">
      {/* Top Main Banner with EWS Identity & Telegram Status */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 mb-2">
              <span className="px-2.5 py-0.5 rounded-lg bg-cyan-950 text-cyan-300 text-xs font-mono font-bold border border-cyan-800/80">
                {ews.id}
              </span>
              <h2 className="text-xl font-bold text-white">{ews.name}</h2>
              {getStatusBadge()}
            </div>

            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-400">
              <span className="flex items-center gap-1 text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                {ews.location}
              </span>
              <span className="font-mono text-slate-400">
                GPS: {ews.coordinates.lat.toFixed(4)}, {ews.coordinates.lng.toFixed(4)}
              </span>
              <span className="flex items-center gap-1 text-slate-400">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Update: {ews.sensorData.lastUpdated}
              </span>
            </div>
          </div>

          {/* Action buttons including Telegram Bot per EWS */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsTelegramModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-sky-950/80 hover:bg-sky-900/90 text-sky-200 border border-sky-600/60 text-xs font-semibold flex items-center gap-2 transition-all shadow-md cursor-pointer group"
              title="Konfigurasi Bot Telegram Mandiri khusus untuk titik ini"
            >
              <Send className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
              <span>Konfigurasi Bot Telegram</span>
              {ews.telegramConfig.enabled && (
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              )}
            </button>

            {canControl && (
              <>
                <button
                  onClick={handleTestSiren}
                  disabled={isSirenTesting}
                  className="px-3 py-2 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 text-amber-200 border border-amber-600/50 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="Uji sirine lokal 12V 110-120dB & lampu strobo"
                >
                  <Volume2 className={`w-3.5 h-3.5 text-amber-400 ${isSirenTesting ? 'animate-bounce' : ''}`} />
                  <span>{isSirenTesting ? 'Sirine Aktif (Uji)...' : 'Uji Sirine 12V'}</span>
                </button>

                <button
                  onClick={handleToggleMute}
                  className={`px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    ews.muted
                      ? 'bg-red-950 text-red-300 border-red-700'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                  title="Mute sirine sementara"
                >
                  {ews.muted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                  <span>{ews.muted ? 'Alarm Dimute' : 'Mute Buzzer'}</span>
                </button>

                {ews.status !== 'aman' && (
                  <button
                    onClick={() => onResetAlarm(ews.id)}
                    className="px-3 py-2 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-600/60 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reset Operator</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Telegram active status ribbon */}
        <div className="mt-4 pt-3 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <span className="text-slate-400">Saluran Telegram Terhubung:</span>
            <span className="font-medium text-sky-400 flex items-center gap-1">
              <Send className="w-3 h-3" />
              {ews.telegramConfig.channelName}
            </span>
            <span className="text-[11px] font-mono text-slate-400">({ews.telegramConfig.chatId})</span>
          </div>

          <div className="flex items-center gap-3 text-slate-400">
            <span>
              Status Bot: <strong className="text-emerald-400 font-semibold">Aktif Auto-Alert</strong>
            </span>
            <span>&bull;</span>
            <span>Uji Terakhir: {ews.telegramConfig.lastTestTime || 'Hari ini'}</span>
          </div>
        </div>
      </div>

      {/* Main Sensor Grid (Page 3 of Document) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Sensor 1: Inclinometer Dua Sumbu RS485 Modbus */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Inclinometer Dua Sumbu</h4>
                <p className="text-[10px] text-slate-400 font-mono">RS485 Modbus IP67 (±30°)</p>
              </div>
            </div>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
              Math.abs(ews.sensorData.pitchAngle) > ews.thresholds.tiltWarning ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-300'
            }`}>
              Ambang: &gt;{ews.thresholds.tiltWarning}°
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Sumbu Pitch (X)</span>
              <div className="text-2xl font-bold font-mono text-white mt-0.5">
                {ews.sensorData.pitchAngle > 0 ? `+${ews.sensorData.pitchAngle}°` : `${ews.sensorData.pitchAngle}°`}
              </div>
              <span className="text-[10px] text-cyan-400 font-mono">Kemiringan Depan/Belakang</span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Sumbu Roll (Y)</span>
              <div className="text-2xl font-bold font-mono text-white mt-0.5">
                {ews.sensorData.rollAngle > 0 ? `+${ews.sensorData.rollAngle}°` : `${ews.sensorData.rollAngle}°`}
              </div>
              <span className="text-[10px] text-cyan-400 font-mono">Kemiringan Samping</span>
            </div>
          </div>

          {/* Visual tilt bubble preview */}
          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Resolusi Sensor: <strong className="text-slate-300">0.01°</strong></span>
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Probe Terkalibrasi
            </span>
          </div>
        </div>

        {/* Sensor 2: Kelembapan & Suhu Tanah RS485 IP68 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-950 text-blue-400 border border-blue-800 flex items-center justify-center">
                <Droplets className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Sensor Tanah (Moisture & Suhu)</h4>
                <p className="text-[10px] text-slate-400 font-mono">RS485 Modbus IP68 Stainless Probe</p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              Kedalaman 60cm
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Kelembapan</span>
              <div className="text-2xl font-bold font-mono text-blue-400 mt-0.5">
                {ews.sensorData.soilMoisture}%
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                <div
                  className={`h-full ${ews.sensorData.soilMoisture > 75 ? 'bg-amber-400' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(100, ews.sensorData.soilMoisture)}%` }}
                />
              </div>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Suhu Tanah</span>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-0.5 flex items-center justify-center gap-0.5">
                <Thermometer className="w-5 h-5 text-emerald-400" />
                <span>{ews.sensorData.soilTemperature}°C</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono mt-1 block">Termistor Stabil</span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Saturasi Air Pori: <strong className="text-slate-300">{ews.sensorData.soilMoisture > 75 ? 'Tinggi (Bahaya)' : 'Normal'}</strong></span>
            <span className="text-slate-400">Ambang: 75%</span>
          </div>
        </div>

        {/* Sensor 3: Tipping Bucket Rain Gauge */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-950 text-teal-400 border border-teal-800 flex items-center justify-center">
                <Droplets className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Tipping Bucket Rain Gauge</h4>
                <p className="text-[10px] text-slate-400 font-mono">Resolusi 0.2 mm / Tip Pulse</p>
              </div>
            </div>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
              ews.sensorData.rainfallRate > 20 ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-300'
            }`}>
              {ews.sensorData.rainfallRate > 20 ? 'Hujan Lebat' : 'Hujan Ringan/Nol'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Intensitas Saat Ini</span>
              <div className="text-2xl font-bold font-mono text-teal-300 mt-0.5">
                {ews.sensorData.rainfallRate}
              </div>
              <span className="text-[10px] text-slate-400 font-mono">mm / jam</span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Akumulasi 24 Jam</span>
              <div className="text-2xl font-bold font-mono text-white mt-0.5">
                {ews.sensorData.rainfallCumulative}
              </div>
              <span className="text-[10px] text-slate-400 font-mono">mm kumulatif</span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Ambang Siaga: <strong className="text-slate-300">20.0 mm/jam</strong></span>
            <span>Ambang Bahaya: <strong className="text-red-400">50.0 mm/jam</strong></span>
          </div>
        </div>

        {/* Sensor 4: Akselerometer ADXL345 Getaran */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-950 text-purple-400 border border-purple-800 flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Sensor Getaran ADXL345</h4>
                <p className="text-[10px] text-slate-400 font-mono">3-Axis Digital Accelerometer</p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              Rentang ±2g
            </span>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 my-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-400">Amplitudo Getaran Struktur:</span>
              <div className="text-2xl font-bold font-mono text-purple-300">
                {ews.sensorData.vibrationLevel} <span className="text-sm font-normal text-slate-400">g</span>
              </div>
            </div>

            {/* Micro seismic wave simulation */}
            <div className="h-6 flex items-center gap-1 mt-2 px-1 bg-slate-900 rounded border border-slate-800">
              <div className="h-2 w-1.5 bg-purple-500/40 rounded-full" />
              <div className="h-3 w-1.5 bg-purple-500/60 rounded-full" />
              <div className="h-4 w-1.5 bg-purple-500 rounded-full animate-pulse" />
              <div className="h-2 w-1.5 bg-purple-500/50 rounded-full" />
              <div className="h-3 w-1.5 bg-purple-500/70 rounded-full" />
              <div className="h-5 w-1.5 bg-purple-400 rounded-full animate-pulse" />
              <div className="h-2 w-1.5 bg-purple-500/30 rounded-full" />
              <div className="h-3 w-1.5 bg-purple-500/60 rounded-full" />
              <div className="h-2 w-1.5 bg-purple-500/40 rounded-full" />
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Batas Gempa/Retakan: <strong className="text-slate-300">0.25 g</strong></span>
            <span className="text-emerald-400">Kondisi Stabil</span>
          </div>
        </div>

        {/* Sensor 5: Sistem Daya Surya & Baterai (INA219 / INA226) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-950 text-amber-400 border border-amber-800 flex items-center justify-center">
                <Sun className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Panel Surya 30 Wp & Aki 12V</h4>
                <p className="text-[10px] text-slate-400 font-mono">INA219 I2C & PWM SCC 10A</p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
              Charging
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Tegangan Baterai</span>
              <div className="text-2xl font-bold font-mono text-amber-300 mt-0.5">
                {ews.sensorData.batteryVoltage} <span className="text-xs font-normal">V</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">VRLA 12V 20Ah</span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Arus Surya (30Wp)</span>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-0.5">
                {ews.sensorData.solarCurrent} <span className="text-xs font-normal">mA</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Konsumsi: {ews.sensorData.batteryCurrent}mA</span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Low Voltage Disconnect: <strong className="text-slate-300">11.8 V</strong></span>
            <span className="text-slate-300">Buck: 12V &rarr; 5V 5A</span>
          </div>
        </div>

        {/* Hardware Status & Communication (ESP32, SIMCom A7670C, MicroSD 32GB) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center">
                <Wifi className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Kontrol & Seluler 4G LTE</h4>
                <p className="text-[10px] text-slate-400 font-mono">ESP32 DevKit + SIMCom A7670C</p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
              4G Cat-1
            </span>
          </div>

          <div className="space-y-2.5 my-3 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-slate-400">Sinyal Seluler (RSSI):</span>
              <span className="font-mono text-emerald-400 font-bold">{ews.sensorData.gsmSignalDbm} dBm (Kuat)</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-slate-400">Buffer MicroSD 32GB:</span>
              <span className="font-mono text-slate-300">
                {(ews.sensorData.microSdStorageUsedMb / 1024).toFixed(1)} GB / 32 GB
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="text-slate-400">Waktu Aktif (Uptime):</span>
              <span className="font-mono text-slate-300">{ews.sensorData.uptimeHours} Jam</span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>RTC: DS3231 Baterai OK</span>
            <span className="text-cyan-400 font-mono">LCD 20x4 Aktif</span>
          </div>
        </div>

      </div>

      {/* Historical Telemetry Chart View */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              <span>Grafik Riwayat Telemetri - {ews.id}</span>
            </h3>
            <p className="text-xs text-slate-400">
              Pilihan rentang waktu per jam, harian, mingguan, dan parameter sensor
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setActiveChartMetric('tilt')}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium cursor-pointer ${
                  activeChartMetric === 'tilt' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Kemiringan (X/Y)
              </button>
              <button
                onClick={() => setActiveChartMetric('rain')}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium cursor-pointer ${
                  activeChartMetric === 'rain' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Curah Hujan
              </button>
              <button
                onClick={() => setActiveChartMetric('moisture')}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium cursor-pointer ${
                  activeChartMetric === 'moisture' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Tanah
              </button>
              <button
                onClick={() => setActiveChartMetric('power')}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium cursor-pointer ${
                  activeChartMetric === 'power' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Tegangan Baterai
              </button>
            </div>

            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
              {(['1h', '24h', '7d'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setHistoryRange(r)}
                  className={`px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    historyRange === r ? 'bg-slate-800 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart representation */}
        <div className="mt-6">
          <div className="h-64 w-full bg-slate-950/60 rounded-xl border border-slate-800 p-4 flex flex-col justify-between relative overflow-hidden">
            {/* Horizontal guide lines */}
            <div className="absolute inset-x-0 top-1/4 border-b border-slate-800/60 pointer-events-none" />
            <div className="absolute inset-x-0 top-2/4 border-b border-slate-800/60 pointer-events-none" />
            <div className="absolute inset-x-0 top-3/4 border-b border-slate-800/60 pointer-events-none" />

            <div className="flex justify-between text-[11px] font-mono text-slate-500">
              <span>
                {activeChartMetric === 'tilt' && 'Batas Siaga: 1.50°'}
                {activeChartMetric === 'rain' && 'Batas Siaga: 20.0 mm/jam'}
                {activeChartMetric === 'moisture' && 'Batas Saturasi: 75%'}
                {activeChartMetric === 'power' && 'Batas Aman: 12.0 V'}
              </span>
              <span className="text-cyan-400 font-bold">Data Real-time ESP32 & SIMCom</span>
            </div>

            {/* Visual SVG chart */}
            <div className="relative h-44 w-full flex items-end">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d="M 0 130 Q 100 120 200 110 T 350 70 T 500 50 L 500 150 L 0 150 Z"
                  fill="url(#chartGradient)"
                />
                <path
                  d="M 0 130 Q 100 120 200 110 T 350 70 T 500 50"
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="3"
                />
                {/* Data points */}
                <circle cx="0" cy="130" r="4" fill="#06b6d4" />
                <circle cx="100" cy="120" r="4" fill="#06b6d4" />
                <circle cx="200" cy="110" r="4" fill="#06b6d4" />
                <circle cx="350" cy="70" r="4" fill="#06b6d4" />
                <circle cx="500" cy="50" r="5" fill="#38bdf8" stroke="#ffffff" strokeWidth="2" />
              </svg>
            </div>

            {/* X-axis labels */}
            <div className="flex justify-between text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-800">
              {chartPoints.map((pt, i) => (
                <div key={i} className="text-center">
                  <span>{pt.time}</span>
                  <div className="text-[10px] text-cyan-400 font-bold">
                    {activeChartMetric === 'tilt' && `${pt.tilt}°`}
                    {activeChartMetric === 'rain' && `${pt.rain}mm`}
                    {activeChartMetric === 'moisture' && `${pt.moisture}%`}
                    {activeChartMetric === 'power' && `${pt.battery}V`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Telegram Configuration Modal */}
      <TelegramConfigModal
        ews={ews}
        isOpen={isTelegramModalOpen}
        onClose={() => setIsTelegramModalOpen(false)}
        onSave={handleSaveTelegram}
      />
    </div>
  );
};
