'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { EWSNode, UserAccount, TelegramConfig } from '../types';
import { api } from '../services/api';
import {
  Activity,
  AlertTriangle,
  Battery,
  CheckCircle,
  Clock,
  Compass,
  Droplets,
  MapPin,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  Sun,
  Thermometer,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { TelegramConfigModal } from './TelegramConfigModal';

interface TelemetryPoint {
  time: string;
  tilt: number;
  rain: number;
  moisture: number;
  battery: number;
}

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
  onResetAlarm,
}) => {
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [historyRange, setHistoryRange] = useState<'1h' | '24h' | '7d'>('24h');
  const [activeChartMetric, setActiveChartMetric] = useState<'tilt' | 'rain' | 'moisture' | 'power'>('tilt');
  const [isSirenTesting, setIsSirenTesting] = useState(false);
  const [chartHistory, setChartHistory] = useState<TelemetryPoint[]>([]);

  useEffect(() => {
    let isMounted = true;
    const limit = historyRange === '1h' ? 12 : historyRange === '24h' ? 24 : 50;
    api.getSensorLogs(ews.id, limit)
      .then((logs) => {
        if (!isMounted) return;
        if (logs && Array.isArray(logs) && logs.length > 0) {
          const points: TelemetryPoint[] = logs
            .slice()
            .reverse()
            .map((item: any) => ({
              time: item.created_at
                ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '-',
              tilt: Number(item.pitch_angle ?? 0),
              rain: Number(item.rainfall_rate ?? 0),
              moisture: Number(item.soil_moisture ?? 0),
              battery: Number(item.battery_voltage ?? 0),
            }));
          setChartHistory(points);
        } else {
          setChartHistory([]);
        }
      })
      .catch(() => {
        if (isMounted) setChartHistory([]);
      });

    return () => {
      isMounted = false;
    };
  }, [ews.id, historyRange]);

  useEffect(() => {
    if (!ews.sensorData.lastUpdated || ews.sensorData.lastUpdated.includes('Menunggu')) return;
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChartHistory((prev) => {
      const newPoint: TelemetryPoint = {
        time: nowTime,
        tilt: ews.sensorData.pitchAngle,
        rain: ews.sensorData.rainfallRate,
        moisture: ews.sensorData.soilMoisture,
        battery: ews.sensorData.batteryVoltage,
      };
      return [...prev, newPoint].slice(-24);
    });
  }, [
    ews.sensorData.lastUpdated,
    ews.sensorData.pitchAngle,
    ews.sensorData.rainfallRate,
    ews.sensorData.soilMoisture,
    ews.sensorData.batteryVoltage,
  ]);

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

  // Status badges & styling
  const getStatusBadge = () => {
    switch (ews.status) {
      case 'bahaya':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-red-50 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
            BAHAYA (KRITIS)
          </span>
        );
      case 'siaga':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            STATUS SIAGA
          </span>
        );
      case 'offline':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
            <Radio className="w-3.5 h-3.5 text-slate-500" />
            TERPUTUS (OFFLINE)
          </span>
        );
      case 'baterai_lemah':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-orange-50 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-800">
            <Battery className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            BATERAI LEMAH
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            KONDISI NORMAL
          </span>
        );
    }
  };

  const chartColor =
    activeChartMetric === 'tilt'
      ? '#2563eb'
      : activeChartMetric === 'rain'
      ? '#0d9488'
      : activeChartMetric === 'moisture'
      ? '#0284c7'
      : '#d97706';

  const svgPoints = useMemo(() => {
    if (chartHistory.length === 0) return [];

    const values = chartHistory.map((p) => {
      if (activeChartMetric === 'tilt') return p.tilt;
      if (activeChartMetric === 'rain') return p.rain;
      if (activeChartMetric === 'moisture') return p.moisture;
      return p.battery;
    });

    const maxVal = Math.max(...values, activeChartMetric === 'tilt' ? 2.0 : activeChartMetric === 'rain' ? 25 : activeChartMetric === 'moisture' ? 100 : 14);
    const minVal = Math.min(...values, 0);
    const range = maxVal - minVal || 1;

    return chartHistory.map((p, idx) => {
      const val = activeChartMetric === 'tilt' ? p.tilt : activeChartMetric === 'rain' ? p.rain : activeChartMetric === 'moisture' ? p.moisture : p.battery;
      const x = chartHistory.length === 1 ? 250 : (idx / (chartHistory.length - 1)) * 480 + 10;
      const y = Math.max(15, Math.min(115, 115 - ((val - minVal) / range) * 90));
      return {
        x,
        y,
        val,
        time: p.time,
      };
    });
  }, [chartHistory, activeChartMetric]);

  const svgPaths = useMemo(() => {
    if (svgPoints.length === 0) return { line: '', area: '' };
    if (svgPoints.length === 1) {
      return {
        line: `M ${svgPoints[0].x} ${svgPoints[0].y}`,
        area: '',
      };
    }
    const line = svgPoints.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '');
    const area = `${line} L ${svgPoints[svgPoints.length - 1].x} 125 L ${svgPoints[0].x} 125 Z`;
    return { line, area };
  }, [svgPoints]);

  return (
    <div className="space-y-6">
      {/* Top Banner with Identity & Telegram Status */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 mb-2">
              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-mono font-bold border border-slate-200 dark:border-slate-700">
                {ews.id}
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{ews.name}</h2>
              {getStatusBadge()}
            </div>

            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                {ews.location}
              </span>
              <span className="font-mono text-slate-600 dark:text-slate-400">
                GPS: {ews.coordinates.lat.toFixed(4)}, {ews.coordinates.lng.toFixed(4)}
              </span>
              <span className="flex items-center gap-1 text-slate-500">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Update: {ews.sensorData.lastUpdated}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsTelegramModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              title="Konfigurasi Bot Telegram Mandiri khusus untuk titik ini"
            >
              <Send className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Konfigurasi Bot Telegram</span>
              {ews.telegramConfig.enabled && (
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              )}
            </button>

            {canControl && (
              <>
                <button
                  onClick={handleTestSiren}
                  disabled={isSirenTesting}
                  className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="Uji sirine lokal 12V 110-120dB & lampu strobo"
                >
                  <Volume2 className={`w-3.5 h-3.5 text-amber-600 dark:text-amber-400 ${isSirenTesting ? 'animate-bounce' : ''}`} />
                  <span>{isSirenTesting ? 'Menguji Sirine...' : 'Uji Sirine 12V'}</span>
                </button>

                <button
                  onClick={handleToggleMute}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    ews.muted
                      ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                  title="Mute sirine sementara"
                >
                  {ews.muted ? <VolumeX className="w-3.5 h-3.5 text-red-600 dark:text-red-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                  <span>{ews.muted ? 'Sirine Dimute' : 'Mute Buzzer'}</span>
                </button>

                {ews.status !== 'aman' && (
                  <button
                    onClick={() => onResetAlarm(ews.id)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reset Alarm</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Telegram active status ribbon */}
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <span className="text-slate-500 dark:text-slate-400">Saluran Telegram:</span>
            <span className="font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1 font-mono">
              <Send className="w-3 h-3" />
              {ews.telegramConfig.channelName}
            </span>
            <span className="text-[11px] font-mono text-slate-400">({ews.telegramConfig.chatId})</span>
          </div>

          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-[11px]">
            <span>
              Status Bot:{' '}
              <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">Aktif Auto-Alert</strong>
            </span>
            <span>&bull;</span>
            <span>Uji Terakhir: {ews.telegramConfig.lastTestTime || 'Hari ini'}</span>
          </div>
        </div>
      </div>

      {/* Main Sensor Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Sensor 1: Inclinometer Dua Sumbu RS485 Modbus */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center justify-center">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">Inclinometer Dua Sumbu</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">RS485 Modbus IP67 (±30°)</p>
              </div>
            </div>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
              Math.abs(ews.sensorData.pitchAngle) > ews.thresholds.tiltWarning
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}>
              Ambang: &gt;{ews.thresholds.tiltWarning}°
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="bg-slate-50 dark:bg-slate-950/70 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Sumbu Pitch (X)</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                {ews.sensorData.pitchAngle > 0 ? `+${ews.sensorData.pitchAngle}°` : `${ews.sensorData.pitchAngle}°`}
              </div>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">Kemiringan Lereng</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/70 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Sumbu Roll (Y)</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                {ews.sensorData.rollAngle > 0 ? `+${ews.sensorData.rollAngle}°` : `${ews.sensorData.rollAngle}°`}
              </div>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">Kemiringan Lateral</span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Resolusi: <strong className="text-slate-700 dark:text-slate-300 font-mono">0.01°</strong></span>
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
              <CheckCircle className="w-3.5 h-3.5" /> Probe Terkalibrasi
            </span>
          </div>
        </div>

        {/* Sensor 2: Kelembapan & Suhu Tanah RS485 IP68 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 flex items-center justify-center">
                <Droplets className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">Sensor Tanah (Moisture)</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">RS485 Modbus IP68 Probe</p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Kedalaman 60cm
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="bg-slate-50 dark:bg-slate-950/70 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Kelembapan</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                {ews.sensorData.soilMoisture}%
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full ${ews.sensorData.soilMoisture > 75 ? 'bg-amber-500' : 'bg-blue-600'}`}
                  style={{ width: `${Math.min(100, ews.sensorData.soilMoisture)}%` }}
                />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/70 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Suhu Tanah</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center justify-center gap-0.5">
                <Thermometer className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{ews.sensorData.soilTemperature}°C</span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1 block">Termistor Stabil</span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Saturasi Pori: <strong className="text-slate-700 dark:text-slate-300">{ews.sensorData.soilMoisture > 75 ? 'Tinggi' : 'Normal'}</strong></span>
            <span className="font-mono">Ambang: 75%</span>
          </div>
        </div>

        {/* Sensor 3: Tipping Bucket Rain Gauge */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800 flex items-center justify-center">
                <Droplets className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">Tipping Bucket Rain Gauge</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Resolusi 0.2 mm / Tip Pulse</p>
              </div>
            </div>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
              ews.sensorData.rainfallRate > 20
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}>
              {ews.sensorData.rainfallRate > 20 ? 'Hujan Lebat' : 'Hujan Normal'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="bg-slate-50 dark:bg-slate-950/70 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Intensitas</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-teal-600 dark:text-teal-400 mt-0.5">
                {ews.sensorData.rainfallRate}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">mm / jam</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/70 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Akumulasi 24 Jam</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                {ews.sensorData.rainfallCumulative}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">mm kumulatif</span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Ambang Siaga: <strong className="text-slate-700 dark:text-slate-300 font-mono">20 mm/jam</strong></span>
            <span>Bahaya: <strong className="text-red-600 dark:text-red-400 font-mono">50 mm/jam</strong></span>
          </div>
        </div>

        {/* Sensor 4: Akselerometer ADXL345 Getaran */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">Sensor Getaran ADXL345</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">3-Axis Digital Accelerometer</p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Rentang ±2g
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950/70 p-3 rounded-lg border border-slate-200 dark:border-slate-800 my-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Amplitudo Getaran:</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">
                {ews.sensorData.vibrationLevel} <span className="text-sm font-normal text-slate-500">g</span>
              </div>
            </div>

            <div className="h-4 flex items-center gap-1 mt-2 px-1 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
              <div className="h-1.5 w-1.5 bg-purple-400 rounded-full" />
              <div className="h-2.5 w-1.5 bg-purple-500 rounded-full" />
              <div className="h-3 w-1.5 bg-purple-600 rounded-full" />
              <div className="h-1.5 w-1.5 bg-purple-400 rounded-full" />
              <div className="h-2 w-1.5 bg-purple-500 rounded-full" />
              <div className="h-3.5 w-1.5 bg-purple-600 rounded-full" />
              <div className="h-1.5 w-1.5 bg-purple-400 rounded-full" />
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Batas Retakan: <strong className="text-slate-700 dark:text-slate-300 font-mono">0.25 g</strong></span>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Struktur Stabil</span>
          </div>
        </div>

        {/* Sensor 5: Sistem Daya Surya & Baterai */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 flex items-center justify-center">
                <Sun className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">Panel Surya 30Wp &amp; Aki</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">INA219 &amp; PWM SCC 10A</p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Charging
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="bg-slate-50 dark:bg-slate-950/70 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Tegangan Aki</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
                {ews.sensorData.batteryVoltage} <span className="text-xs font-normal">V</span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">VRLA 12V 20Ah</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/70 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Arus Solar 30Wp</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                {ews.sensorData.solarCurrent} <span className="text-xs font-normal">mA</span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Beban: {ews.sensorData.batteryCurrent}mA</span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Cut-off Proteksi: <strong className="text-slate-700 dark:text-slate-300 font-mono">11.8 V</strong></span>
            <span className="font-mono">Stepdown 12V&rarr;5V 5A</span>
          </div>
        </div>

        {/* Hardware Status & Communication */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center">
                <Wifi className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">Kontrol &amp; Seluler 4G</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">ESP32 + SIMCom A7670C</p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              4G Cat-1
            </span>
          </div>

          <div className="space-y-2 my-3 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Sinyal Seluler (RSSI):</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{ews.sensorData.gsmSignalDbm} dBm</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">MicroSD Backup:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {(ews.sensorData.microSdStorageUsedMb / 1024).toFixed(1)} GB / 32 GB
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Uptime Kontrol:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{ews.sensorData.uptimeHours} Jam</span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>RTC: DS3231 Normal</span>
            <span className="text-blue-600 dark:text-blue-400 font-mono">LCD 20x4 Aktif</span>
          </div>
        </div>

      </div>

      {/* Historical Telemetry Chart View */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Grafik Riwayat Telemetri ({ews.id})</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pilihan rentang waktu harian, mingguan, dan parameter sensor lapangan
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
              <button
                onClick={() => setActiveChartMetric('tilt')}
                className={`px-3 py-1 rounded-md transition-colors font-medium cursor-pointer ${
                  activeChartMetric === 'tilt'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Inclinometer
              </button>
              <button
                onClick={() => setActiveChartMetric('rain')}
                className={`px-3 py-1 rounded-md transition-colors font-medium cursor-pointer ${
                  activeChartMetric === 'rain'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Curah Hujan
              </button>
              <button
                onClick={() => setActiveChartMetric('moisture')}
                className={`px-3 py-1 rounded-md transition-colors font-medium cursor-pointer ${
                  activeChartMetric === 'moisture'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Kelembapan
              </button>
              <button
                onClick={() => setActiveChartMetric('power')}
                className={`px-3 py-1 rounded-md transition-colors font-medium cursor-pointer ${
                  activeChartMetric === 'power'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Tegangan Aki
              </button>
            </div>

            <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono">
              {(['1h', '24h', '7d'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setHistoryRange(r)}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    historyRange === r
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart representation */}
        <div className="mt-5">
          <div className="h-60 w-full bg-slate-50 dark:bg-slate-950/70 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between relative overflow-hidden">
            {/* Guide lines */}
            <div className="absolute inset-x-0 top-1/4 border-b border-slate-200 dark:border-slate-800/80 pointer-events-none" />
            <div className="absolute inset-x-0 top-2/4 border-b border-slate-200 dark:border-slate-800/80 pointer-events-none" />
            <div className="absolute inset-x-0 top-3/4 border-b border-slate-200 dark:border-slate-800/80 pointer-events-none" />

            <div className="flex justify-between text-[11px] font-mono text-slate-500 z-10">
              <span>
                {activeChartMetric === 'tilt' && 'Batas Siaga Inclinometer: 1.50°'}
                {activeChartMetric === 'rain' && 'Batas Siaga Curah Hujan: 20.0 mm/jam'}
                {activeChartMetric === 'moisture' && 'Batas Kejenuhan Air: 75%'}
                {activeChartMetric === 'power' && 'Batas Aman Tegangan: 12.0 V'}
              </span>
              <span className="font-semibold" style={{ color: chartColor }}>
                {chartHistory.length > 0 ? 'Telemetri Live Terkalibrasi' : 'Menunggu Transmisi Sensor'}
              </span>
            </div>

            {chartHistory.length === 0 ? (
              <div className="relative z-10 my-auto flex flex-col items-center justify-center text-center py-4">
                <div className="w-10 h-10 rounded-full bg-slate-200/60 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-2">
                  <Activity className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Data Riwayat Telemetri Belum Tersedia (0 Data)
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-sm mt-1">
                  Semua titik grafik telah dikosongkan. Visualisasi grafik akan terbentuk secara real-time saat sensor stasiun {ews.id} aktif mentransmisikan data.
                </p>
              </div>
            ) : (
              <>
                {/* SVG line chart */}
                <div className="relative h-36 w-full flex items-end">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 500 130" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartColor} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={chartColor} stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    {svgPaths.area && <path d={svgPaths.area} fill="url(#chartGradient)" />}
                    {svgPaths.line && (
                      <path
                        d={svgPaths.line}
                        fill="none"
                        stroke={chartColor}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {svgPoints.map((pt, i) => (
                      <circle
                        key={i}
                        cx={pt.x}
                        cy={pt.y}
                        r={i === svgPoints.length - 1 ? 4.5 : 3}
                        fill={chartColor}
                        stroke={i === svgPoints.length - 1 ? '#ffffff' : 'none'}
                        strokeWidth={i === svgPoints.length - 1 ? 2 : 0}
                      />
                    ))}
                  </svg>
                </div>

                {/* X-axis labels */}
                <div className="flex justify-between text-[11px] font-mono text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800 z-10">
                  {svgPoints.map((pt, i) => (
                    <div key={i} className="text-center">
                      <span>{pt.time}</span>
                      <div className="text-[10px] font-bold" style={{ color: chartColor }}>
                        {activeChartMetric === 'tilt' && `${pt.val}°`}
                        {activeChartMetric === 'rain' && `${pt.val}mm`}
                        {activeChartMetric === 'moisture' && `${pt.val}%`}
                        {activeChartMetric === 'power' && `${pt.val}V`}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
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
