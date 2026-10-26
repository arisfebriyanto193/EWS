'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { EWSNode, UserAccount, TelegramConfig, TelkomselConfig } from '../types';
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
  Download,
  RefreshCw,
  Send,
  ShieldAlert,
  Sliders,
  Smartphone,
  Sun,
  Volume2,
  VolumeX,
  Wifi,
  RotateCcw,
  SlidersHorizontal,
  Pencil,
} from 'lucide-react';
import { useEWS } from '../context/EWSContext';
import { TelegramConfigModal } from './TelegramConfigModal';
import { TelkomselConfigModal } from './TelkomselConfigModal';
import { ThresholdConfigModal } from './ThresholdConfigModal';
import { TriggerCauseModal } from './TriggerCauseModal';
import { DownloadStorageModal } from './DownloadStorageModal';
import { DeviceOptionsModal } from './DeviceOptionsModal';
import { formatWIB, formatWIBTimeOnly } from '../utils/date';
import { wsClient } from '../services/websocket';

interface TelemetryPoint {
  time: string;
  tilt: number;
  rain: number;
  moisture: number;
  battery: number;
}

interface EWSDashboardSingleProps {
  ews: EWSNode;
  currentUser: UserAccount | null;
  onUpdateEws: (updated: EWSNode) => void;
  onTriggerAlarm: (ewsId: string, type: 'siaga' | 'bahaya') => void;
  onResetAlarm: (ewsId: string) => void;
  onRequireLogin?: (notice?: string) => void;
}

export const EWSDashboardSingle: React.FC<EWSDashboardSingleProps> = ({
  ews,
  currentUser,
  onUpdateEws,
  onResetAlarm,
  onRequireLogin,
}) => {
  const { setEditingConfigEws, openLoginModal } = useEWS();
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [isTelkomselModalOpen, setIsTelkomselModalOpen] = useState(false);
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);
  const [isTriggerCauseModalOpen, setIsTriggerCauseModalOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false);
  const [historyRange, setHistoryRange] = useState<'1h' | '24h' | '7d'>('24h');
  const [activeChartMetric, setActiveChartMetric] = useState<'tilt' | 'rain' | 'moisture' | 'power'>('tilt');
  const [isSirenTesting, setIsSirenTesting] = useState(false);
  const [chartHistory, setChartHistory] = useState<TelemetryPoint[]>([]);
  const [isRequestingData, setIsRequestingData] = useState(false);
  const [requestSuccessToast, setRequestSuccessToast] = useState<string | null>(null);

  const handleRequestDataNow = () => {
    setIsRequestingData(true);
    wsClient.publish(`ews/${ews.id}/command`, {
      command: 'REQUEST_DATA',
      ewsId: ews.id,
      timestamp: Date.now(),
    });
    setRequestSuccessToast('Permintaan sensor realtime dikirim ke ESP32!');
    setTimeout(() => {
      setIsRequestingData(false);
      setRequestSuccessToast(null);
    }, 2500);
  };

  useEffect(() => {
    let isMounted = true;
    const fetchLogs = () => {
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
                  ? formatWIBTimeOnly(item.created_at)
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
    };

    fetchLogs();
    // Sinkronisasi data log 5-menitan dari database setiap 30 detik
    const pollInterval = setInterval(fetchLogs, 30000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [ews.id, historyRange]);

  useEffect(() => {
    if (!ews.sensorData.lastUpdated || ews.sensorData.lastUpdated.includes('Menunggu')) return;
    const nowTimeStr = formatWIBTimeOnly(new Date());

    setChartHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      // Jika masih dalam slot 5-menit yang sama, update nilai sensor titik terkini tanpa menambah baris baru
      if (last.time === nowTimeStr) {
        const copy = [...prev];
        copy[copy.length - 1] = {
          ...last,
          tilt: ews.sensorData.pitchAngle,
          rain: ews.sensorData.rainfallRate,
          moisture: ews.sensorData.soilMoisture,
          battery: ews.sensorData.batteryVoltage,
        };
        return copy;
      }
      // Jika sudah berpindah interval (misal dari 01.00 ke 01.05), tambahkan titik rekaman baru
      const newPoint: TelemetryPoint = {
        time: nowTimeStr,
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

  const isSuperadmin = currentUser?.role === 'superadmin';
  const canControl = isSuperadmin || (currentUser && currentUser.assignedEwsId === ews.id);

  const handleOpenTelegram = () => {
    if (!currentUser) {
      onRequireLogin?.('Silakan login terlebih dahulu untuk mengonfigurasi Bot Telegram.');
      return;
    }
    setIsTelegramModalOpen(true);
  };

  const handleOpenTelkomsel = () => {
    if (!currentUser) {
      onRequireLogin?.('Silakan login terlebih dahulu untuk mengonfigurasi Paket & Kuota Telkomsel.');
      return;
    }
    setIsTelkomselModalOpen(true);
  };

  const handleOpenThreshold = () => {
    if (!currentUser) {
      onRequireLogin?.('Silakan login terlebih dahulu untuk mengubah ambang batas sensor geoteknik.');
      return;
    }
    setIsThresholdModalOpen(true);
  };

  const handleOpenEditConfig = () => {
    if (!currentUser) {
      if (onRequireLogin) {
        onRequireLogin('Silakan login sebagai Superadmin untuk mengubah konfigurasi titik EWS.');
      } else {
        openLoginModal('Silakan login sebagai Superadmin untuk mengubah konfigurasi titik EWS.');
      }
      return;
    }
    setEditingConfigEws(ews);
  };

  const handleResetClick = () => {
    if (!currentUser) {
      onRequireLogin?.('Silakan login terlebih dahulu untuk mereset status alarm.');
      return;
    }
    onResetAlarm(ews.id);
  };

  const handleSaveTelegram = (newConfig: TelegramConfig) => {
    onUpdateEws({
      ...ews,
      telegramConfig: newConfig,
    });
  };

  const handleSaveTelkomsel = (newConfig: TelkomselConfig) => {
    onUpdateEws({
      ...ews,
      telkomselConfig: newConfig,
    });
  };

  const handleToggleMute = () => {
    if (!currentUser) {
      onRequireLogin?.('Silakan login terlebih dahulu untuk menyenyapkan sirine.');
      return;
    }
    onUpdateEws({
      ...ews,
      muted: !ews.muted,
    });
  };

  const handleTestSiren = () => {
    if (!currentUser) {
      onRequireLogin?.('Silakan login terlebih dahulu untuk menguji sirine.');
      return;
    }
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

  const [isRestarting, setIsRestarting] = useState(false);

  const handleRestartEsp = async () => {
    if (!currentUser) {
      onRequireLogin?.('Silakan login terlebih dahulu untuk me-restart mikrokontroler ESP32.');
      return;
    }
    const confirmRestart = window.confirm(
      `Apakah Anda yakin ingin me-restart mikrokontroler ESP32 (${ews.name} [${ews.id}])?\n\nSistem akan menyimpan data curah hujan harian ke EEPROM dan memulai ulang perangkat secara otomatis.`
    );
    if (!confirmRestart) return;

    setIsRestarting(true);
    try {
      await api.controlEws(ews.id, { command: 'RESTART_DEVICE' });
      alert(`Instruksi restart telah dikirim ke ${ews.id}. Perangkat ESP32 sedang melakukan reboot.`);
    } catch (err: any) {
      alert(`Gagal mengirim instruksi restart: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setTimeout(() => setIsRestarting(false), 5000);
    }
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
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 mb-2">
              <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-slate-900/60 text-blue-700 dark:text-blue-300 text-xs font-mono font-bold border border-blue-200 dark:border-slate-700">
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
                Update: {formatWIB(ews.sensorData?.lastSeenAt || ews.sensorData?.lastUpdated, false)}
              </span>
            </div>
          </div>

          {/* Action buttons: Disederhanakan menjadi 1 tombol "Opsi Lainnya" */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Tombol Akses Cepat Darurat saat Status Tidak Aman */}
            {ews.status !== 'aman' && (
              <>
                <button
                  onClick={() => setIsTriggerCauseModalOpen(true)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                    ews.status === 'bahaya'
                      ? 'bg-red-600 hover:bg-red-700 text-white border-red-500 animate-pulse'
                      : ews.status === 'siaga'
                      ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-400'
                      : 'bg-orange-500 hover:bg-orange-600 text-white border-orange-400'
                  }`}
                  title="Lihat rincian sensor yang memicu kondisi ini & nilai ambang batas"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Sensor Pemicu</span>
                </button>

                {canControl && (
                  <button
                    onClick={handleResetClick}
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Reset alarm ke status normal"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reset Alarm</span>
                  </button>
                )}
              </>
            )}

            {/* Tombol Edit Titik EWS */}
            <button
              onClick={handleOpenEditConfig}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 border border-slate-300 dark:border-slate-700"
              title="Edit konfigurasi titik EWS: ID, nama titik, koordinat GPS, ambang batas & Telegram"
            >
              <Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Edit Titik</span>
            </button>

            {/* Tombol Tunggal Utama: Opsi Lainnya */}
            <button
              onClick={() => setIsOptionsModalOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95 border border-blue-600"
              title="Buka menu konfigurasi bot Telegram, SIM Telkomsel, ambang batas, ekspor data, kontrol aktuator & restart ESP32"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Opsi Lainnya</span>
              {ews.telegramConfig?.enabled && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" title="Bot Telegram Aktif" />
              )}
              {ews.telkomselConfig?.isConnected && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-red-600 text-white font-bold">
                  {ews.telkomselConfig.quotaData?.primaryQuota?.remaining || '4G'}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Telegram active status ribbon */}
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
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

      {/* Offline Alert Banner */}
      {ews.status === 'offline' && (
        <div className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3.5 text-slate-700 dark:text-slate-300 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Perangkat Tidak Terhubung (Offline)</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono font-bold">
                TIMED OUT
              </span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tidak ada data telemetri yang masuk dalam 25 detik terakhir. Menampilkan data cache terakhir ({ews.sensorData.lastUpdated}). Status akan otomatis online kembali saat ESP32 mengirim data.
            </p>
          </div>
        </div>
      )}

      {/* Bahaya Imminent Alert Banner with Cause */}
      {ews.status === 'bahaya' && (
        <div className="bg-red-50 dark:bg-red-950/80 border border-red-300 dark:border-red-800 rounded-xl p-4 flex items-start justify-between gap-3.5 text-red-900 dark:text-red-200 shadow-xs animate-pulse">
          <div className="flex items-start gap-3.5 flex-1">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/80 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0 mt-0.5">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-red-800 dark:text-red-200">
                  BAHAYA ANOMALI EKSTREM - SIRINE &amp; STROBO AKTIF!
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded bg-red-600 text-white font-mono font-bold uppercase">
                  EMERGENCY ALARM
                </span>
              </div>
              <p className="text-xs font-semibold text-red-700 dark:text-red-300 mt-1">
                <strong>Penyebab Pemicu:</strong>{' '}
                {ews.alarmReason || ews.sensorData?.alarmReason || 'Kemiringan Tanah Ekstrem / Curah Hujan Bahaya / Getaran Gempa'}
              </p>
              <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                Sirine lapangan dan lampu strobo diaktifkan sesuai siklus timer otomatis ({ews.thresholds.alarmDuration ?? 60}s aktif, {ews.thresholds.alarmPause ?? 30}s jeda).
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsTriggerCauseModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer shadow-xs"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Sensor Pemicu</span>
          </button>
        </div>
      )}

      {/* Siaga Alert Banner with Cause */}
      {ews.status === 'siaga' && (
        <div className="bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-800 rounded-xl p-4 flex items-start justify-between gap-3.5 text-amber-900 dark:text-amber-200 shadow-xs">
          <div className="flex items-start gap-3.5 flex-1">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/80 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-amber-800 dark:text-amber-200">
                  STATUS SIAGA - RELAY LAPANGAN MATI (OFF)
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500 text-white font-mono font-bold uppercase">
                  RELAY OFF
                </span>
              </div>
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mt-1">
                <strong>Penyebab Pemicu:</strong>{' '}
                {ews.alarmReason || ews.sensorData?.alarmReason || 'Kemiringan Tanah / Curah Hujan / Kelembapan Melebihi Ambang Siaga [Relay OFF]'}
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                Telah terjadi anomali awal pada lereng. Relay di lapangan tetap <strong>MATI (OFF)</strong>, sirine &amp; strobo tidak menyala. Peringatan dini difokuskan pada Web Dashboard &amp; Notifikasi Telegram.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsTriggerCauseModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer shadow-xs"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Sensor Pemicu</span>
          </button>
        </div>
      )}

      {/* Baterai Lemah / INA Disconnected Banner (HANYA WARNING WEB - RELAY OFF) */}
      {ews.status === 'baterai_lemah' && (
        <div className="bg-orange-50 dark:bg-orange-950/60 border border-orange-300 dark:border-orange-800/80 rounded-xl p-4 flex items-start justify-between gap-3.5 text-orange-900 dark:text-orange-200 shadow-xs">
          <div className="flex items-start gap-3.5 flex-1">
            <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/60 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0 mt-0.5">
              <Battery className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-orange-800 dark:text-orange-200">
                  PERINGATAN DAYA / TEGANGAN AKI (HANYA NOTIFIKASI WEB)
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded bg-orange-600 text-white font-mono font-bold uppercase">
                  RELAY DIJAMIN MATI (OFF)
                </span>
              </div>
              <p className="text-xs font-semibold text-orange-800 dark:text-orange-300 mt-1">
                <strong>Keterangan:</strong>{' '}
                {ews.alarmReason ||
                  ews.sensorData?.alarmReason ||
                  (ews.sensorData.batteryVoltage <= 0.5
                    ? 'Tegangan Aki / Sensor Daya Tidak Terdeteksi (0.00V) [Bukan Tanda Bahaya, Relay OFF]'
                    : `Tegangan Baterai Lemah (${ews.sensorData.batteryVoltage}V < ${ews.thresholds.batteryLowVoltage}V) [Warning Web Saja, Relay OFF]`)}
              </p>
              <p className="text-[11px] text-orange-700 dark:text-orange-400 mt-0.5">
                Kondisi ini merupakan indikator pemeliharaan perangkat, <strong>bukan tanda bahaya bencana</strong>. Relay sirine dan strobo di lapangan tetap dinonaktifkan (OFF) agar aki terlindungi dan tidak membunyikan alarm palsu.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsTriggerCauseModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer shadow-xs"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Sensor Pemicu</span>
          </button>
        </div>
      )}

      {/* Main Sensor Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Sensor 1: Inclinometer Dua Sumbu RS485 Modbus */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-slate-700 flex items-center justify-center">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">Inclinometer Dua Sumbu</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">RS485 Modbus IP67 (±30°)</p>
              </div>
            </div>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
              Math.abs(ews.sensorData.pitchAngle - (ews.thresholds.safeTiltPitch ?? 0)) > ews.thresholds.tiltWarning ||
              Math.abs(ews.sensorData.rollAngle - (ews.thresholds.safeTiltRoll ?? 0)) > ews.thresholds.tiltWarning
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-blue-400'
            }`}>
              Simpangan: &gt;{ews.thresholds.tiltWarning}°
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Sumbu Pitch (X)</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-blue-700 dark:text-blue-300 mt-0.5">
                {ews.sensorData.pitchAngle > 0 ? `+${ews.sensorData.pitchAngle.toFixed(2)}°` : `${ews.sensorData.pitchAngle.toFixed(2)}°`}
              </div>
              <div className="text-[10px] text-blue-600 dark:text-blue-400 font-mono mt-0.5">
                Simpangan: {Math.abs(ews.sensorData.pitchAngle - (ews.thresholds.safeTiltPitch ?? 0)).toFixed(2)}°
              </div>
              <span className="text-[9px] text-slate-400 dark:text-slate-400 font-mono block">
                Titik Aman: {(ews.thresholds.safeTiltPitch ?? 0).toFixed(2)}°
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Sumbu Roll (Y)</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-blue-700 dark:text-blue-300 mt-0.5">
                {ews.sensorData.rollAngle > 0 ? `+${ews.sensorData.rollAngle.toFixed(2)}°` : `${ews.sensorData.rollAngle.toFixed(2)}°`}
              </div>
              <div className="text-[10px] text-blue-600 dark:text-blue-400 font-mono mt-0.5">
                Simpangan: {Math.abs(ews.sensorData.rollAngle - (ews.thresholds.safeTiltRoll ?? 0)).toFixed(2)}°
              </div>
              <span className="text-[9px] text-slate-400 dark:text-slate-400 font-mono block">
                Titik Aman: {(ews.thresholds.safeTiltRoll ?? 0).toFixed(2)}°
              </span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Resolusi: <strong className="text-slate-700 dark:text-slate-300 font-mono">0.01°</strong></span>
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
              <CheckCircle className="w-3.5 h-3.5" /> Probe Terkalibrasi
            </span>
          </div>
        </div>

        {/* Sensor 2: Kelembapan Tanah (Ktanah GPIO 17) */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center">
                <Droplets className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">Sensor Kelembapan Tanah</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Probe Kapasitif IP68 (GPIO 17)</p>
              </div>
            </div>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
              ews.sensorData.soilMoisture > (ews.thresholds.soilMoistureWarning ?? 75)
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-blue-400'
            }`}>
              {ews.sensorData.soilMoisture > (ews.thresholds.soilMoistureWarning ?? 75) ? 'Siaga Jenuh' : 'Kondisi Aman'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Kelembapan</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-indigo-700 dark:text-indigo-300 mt-0.5">
                {ews.sensorData.soilMoisture}%
              </div>
              <div className="w-full bg-slate-200 dark:bg-blue-950/60 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full ${ews.sensorData.soilMoisture > (ews.thresholds.soilMoistureWarning ?? 75) ? 'bg-amber-500' : 'bg-indigo-600'}`}
                  style={{ width: `${Math.min(100, ews.sensorData.soilMoisture)}%` }}
                />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Simpangan Deviasi</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-indigo-700 dark:text-indigo-300 mt-0.5">
                ±{Math.abs(ews.sensorData.soilMoisture - (ews.thresholds.safeSoilMoisture ?? 50)).toFixed(1)}%
              </div>
              <span className="text-[9px] text-slate-400 dark:text-slate-400 font-mono block mt-1">
                Titik Aman: {(ews.thresholds.safeSoilMoisture ?? 50).toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Saturasi Pori: <strong className="text-slate-700 dark:text-slate-300">{ews.sensorData.soilMoisture > (ews.thresholds.soilMoistureWarning ?? 75) ? 'Tinggi (Jenuh)' : 'Normal'}</strong></span>
            <span className="font-mono">Ambang: {ews.thresholds.soilMoistureWarning ?? 75}%</span>
          </div>
        </div>

        {/* Sensor 3: Tipping Bucket Rain Gauge */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
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
                : 'bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-blue-400'
            }`}>
              {ews.sensorData.rainfallRate > 20 ? 'Hujan Lebat' : 'Hujan Normal'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center">
              <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Intensitas</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-teal-600 dark:text-teal-400 mt-0.5">
                {ews.sensorData.rainfallRate}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">mm / jam</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center">
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
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-slate-700 flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">Sensor Getaran ADXL345</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">3-Axis Digital Accelerometer</p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-blue-400">
              Rentang ±2g
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 my-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Amplitudo Getaran:</span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                {ews.sensorData.vibrationLevel} <span className="text-sm font-normal text-slate-500">g</span>
              </div>
            </div>

            <div className="h-4 flex items-center gap-1 mt-2 px-1 bg-white dark:bg-[#0b0f19] rounded border border-slate-200 dark:border-slate-800">
              <div className="h-1.5 w-1.5 bg-blue-400 rounded-full" />
              <div className="h-2.5 w-1.5 bg-blue-500 rounded-full" />
              <div className="h-3 w-1.5 bg-blue-600 rounded-full" />
              <div className="h-1.5 w-1.5 bg-blue-400 rounded-full" />
              <div className="h-2 w-1.5 bg-blue-500 rounded-full" />
              <div className="h-3.5 w-1.5 bg-blue-600 rounded-full" />
              <div className="h-1.5 w-1.5 bg-blue-400 rounded-full" />
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Batas Retakan: <strong className="text-slate-700 dark:text-slate-300 font-mono">0.25 g</strong></span>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Struktur Stabil</span>
          </div>
        </div>

        {/* Sensor 5: Monitoring Catu Daya & Tegangan Aki */}
        <div className={`bg-white dark:bg-[#111827] border rounded-xl p-5 shadow-xs transition-colors ${
          ews.sensorData.batteryVoltage <= 0.5
            ? 'border-orange-300 dark:border-orange-900/50'
            : ews.sensorData.batteryVoltage < ews.thresholds.batteryLowVoltage
            ? 'border-amber-300 dark:border-amber-900/50'
            : 'border-slate-200 dark:border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                ews.sensorData.batteryVoltage <= 0.5
                  ? 'bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800'
                  : ews.sensorData.batteryVoltage < ews.thresholds.batteryLowVoltage
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
              }`}>
                <Battery className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">Catu Daya &amp; Tegangan Aki</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  {ews.sensorData.inaAvailable ? 'Sensor INA219 (VRLA 12V 20Ah)' : 'Resistor Pembagi Tegangan 11:4'}
                </p>
              </div>
            </div>
            {ews.sensorData.batteryVoltage <= 0.5 ? (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border border-orange-200 dark:border-orange-800 font-semibold">
                0.00V / Terputus
              </span>
            ) : ews.sensorData.batteryVoltage < ews.thresholds.batteryLowVoltage ? (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold">
                Baterai Lemah
              </span>
            ) : (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold">
                Normal (Aman)
              </span>
            )}
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center my-3">
            <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block">
              Tegangan Aki Real-time
            </span>
            <div className={`text-2xl sm:text-3xl font-bold font-mono mt-0.5 ${
              ews.sensorData.batteryVoltage <= 0.5
                ? 'text-orange-600 dark:text-orange-400'
                : ews.sensorData.batteryVoltage < ews.thresholds.batteryLowVoltage
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}>
              {ews.sensorData.batteryVoltage.toFixed(2)} <span className="text-sm font-normal">V</span>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1 block">
              {ews.sensorData.batteryVoltage <= 0.5
                ? 'Tegangan 0.00V: Relay diproteksi OFF (Hanya Peringatan Web)'
                : `Ambang Batas Siaga: ${ews.thresholds.batteryLowVoltage} V`}
            </span>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Cut-off Proteksi: <strong className="text-slate-700 dark:text-slate-300 font-mono">{ews.thresholds.batteryLowVoltage} V</strong></span>
            <span className={`font-mono font-medium ${
              ews.sensorData.batteryVoltage <= ews.thresholds.batteryLowVoltage
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}>
              {ews.sensorData.batteryVoltage <= ews.thresholds.batteryLowVoltage
                ? 'Relay Lapangan: MATI (OFF)'
                : 'Relay Lapangan: SIAGA NORMAL'}
            </span>
          </div>
        </div>

        {/* Hardware Status & Communication */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center">
                <Wifi className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">Koneksi WiFi &amp; Kontrol ESP32</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">ESP32-S3 + SIMCom A7670C</p>
              </div>
            </div>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded border font-semibold ${
              ews.sensorData.publishMode === 'low_power_5m'
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
            }`}>
              {ews.sensorData.publishMode === 'low_power_5m' ? 'Hemat Daya (5 Menit)' : 'Realtime (Web Dibuka)'}
            </span>
          </div>

          {requestSuccessToast && (
            <div className="mb-2 p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] flex items-center justify-between">
              <span>{requestSuccessToast}</span>
            </div>
          )}

          <div className="space-y-2 my-3 text-xs">
            {/* IP Address */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Alamat IP ESP32:</span>
              <span className="font-mono text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-slate-700">
                {ews.sensorData.ipAddress || '192.168.1.1'}
              </span>
            </div>

            {/* SSID WiFi */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">SSID WiFi:</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold truncate max-w-[180px]">
                {ews.sensorData.wifiSsid || 'WiFi EWS'}
              </span>
            </div>

            {/* Sinyal WiFi RSSI */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Sinyal WiFi (RSSI):</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                {ews.sensorData.wifiRssi ?? ews.sensorData.gsmSignalDbm ?? -65} dBm
              </span>
            </div>

            {/* Siklus Timer Alarm Otomatis */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/30">
              <span className="text-red-700 dark:text-red-300 font-medium">Siklus Alarm Otomatis:</span>
              <span className="font-mono text-red-600 dark:text-red-400 font-bold">
                Aktif {ews.thresholds.alarmDuration ?? 60}s | Jeda {ews.thresholds.alarmPause ?? 30}s
              </span>
            </div>

            {/* MicroSD & Internal Storage Backup */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Penyimpanan Alat:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-700 dark:text-slate-300 text-xs">
                  {(ews.sensorData.microSdStorageUsedMb / 1024).toFixed(1)} GB (SD) / 6.18MB
                </span>
                <button
                  onClick={() => setIsDownloadModalOpen(true)}
                  className="px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 text-[11px] font-bold hover:bg-sky-200 dark:hover:bg-sky-900 transition-colors cursor-pointer flex items-center gap-1"
                  title="Unduh rekaman CSV"
                >
                  <Download className="w-3 h-3" />
                  Unduh
                </button>
              </div>
            </div>

            {/* Uptime Kontrol */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Uptime Kontrol:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{ews.sensorData.uptimeHours} Jam</span>
            </div>

            {/* Telkomsel SIM & Quota Card Row */}
            <div
              onClick={handleOpenTelkomsel}
              className="p-2.5 rounded-lg bg-red-50/70 dark:bg-red-950/30 border border-red-200/80 dark:border-red-900/40 hover:border-red-400 dark:hover:border-red-700 transition-all cursor-pointer group"
              title="Klik untuk melihat kuota lengkap atau login Telkomsel"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-600" />
                  SIM Telkomsel:
                </span>
                {ews.telkomselConfig?.isConnected ? (
                  <span className="font-mono text-xs font-bold text-red-600 dark:text-red-400">
                    {ews.telkomselConfig.quotaData?.primaryQuota?.remaining || "Aktif"}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 underline decoration-dotted group-hover:text-red-500">
                    + Hubungkan No HP
                  </span>
                )}
              </div>
              {ews.telkomselConfig?.isConnected && (
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  <span>Pulsa: Rp {Number(ews.telkomselConfig.balance || 0).toLocaleString("id-ID")}</span>
                  <span className="text-[10px] text-red-600 dark:text-red-400 font-semibold group-hover:underline">
                    Rincian &rarr;
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>RTC: DS3231 Normal</span>
            <span className="text-blue-600 dark:text-blue-400 font-mono">LCD 20x4 Aktif</span>
          </div>
        </div>

      </div>

      {/* Historical Telemetry Chart View */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Grafik Riwayat Telemetri ({ews.id})</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pilihan rentang waktu harian, mingguan, dan parameter sensor kestabilan lereng
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 dark:bg-slate-900/60 p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
              <button
                onClick={() => setActiveChartMetric('tilt')}
                className={`px-3 py-1 rounded-md transition-colors font-medium cursor-pointer ${
                  activeChartMetric === 'tilt'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white'
                }`}
              >
                Inclinometer
              </button>
              <button
                onClick={() => setActiveChartMetric('rain')}
                className={`px-3 py-1 rounded-md transition-colors font-medium cursor-pointer ${
                  activeChartMetric === 'rain'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white'
                }`}
              >
                Curah Hujan
              </button>
              <button
                onClick={() => setActiveChartMetric('moisture')}
                className={`px-3 py-1 rounded-md transition-colors font-medium cursor-pointer ${
                  activeChartMetric === 'moisture'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white'
                }`}
              >
                Kelembapan
              </button>
              <button
                onClick={() => setActiveChartMetric('power')}
                className={`px-3 py-1 rounded-md transition-colors font-medium cursor-pointer ${
                  activeChartMetric === 'power'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white'
                }`}
              >
                Tegangan Aki
              </button>
            </div>

            <div className="flex items-center bg-slate-100 dark:bg-slate-900/60 p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono">
              {(['1h', '24h', '7d'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setHistoryRange(r)}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    historyRange === r
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white'
                  }`}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsDownloadModalOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Unduh rekaman CSV sensor"
            >
              <Download className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>Ekspor CSV</span>
            </button>
          </div>
        </div>

        {/* Chart representation */}
        <div className="mt-5">
          <div className="h-60 w-full bg-slate-50 dark:bg-[#0b0f19] rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between relative overflow-hidden">
            {/* Academic Guide lines */}
            <div className="absolute inset-x-0 top-1/4 border-b border-slate-200/70 dark:border-slate-800 pointer-events-none" />
            <div className="absolute inset-x-0 top-2/4 border-b border-slate-200/70 dark:border-slate-800 pointer-events-none" />
            <div className="absolute inset-x-0 top-3/4 border-b border-slate-200/70 dark:border-slate-800 pointer-events-none" />

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

      {/* Telkomsel SIM & Quota Configuration Modal */}
      <TelkomselConfigModal
        ews={ews}
        isOpen={isTelkomselModalOpen}
        onClose={() => setIsTelkomselModalOpen(false)}
        onSave={handleSaveTelkomsel}
      />

      {/* Sensor Threshold Configuration Modal */}
      <ThresholdConfigModal
        ews={ews}
        isOpen={isThresholdModalOpen}
        onClose={() => setIsThresholdModalOpen(false)}
        onSave={(newThresh) => onUpdateEws({ ...ews, thresholds: newThresh })}
      />

      {/* Sensor Trigger Cause Detail Modal */}
      <TriggerCauseModal
        ews={ews}
        isOpen={isTriggerCauseModalOpen}
        onClose={() => setIsTriggerCauseModalOpen(false)}
        onToggleMute={handleToggleMute}
        onResetAlarm={handleResetClick}
        onOpenThresholdConfig={handleOpenThreshold}
      />

      {/* Download Sensor Storage & Telemetry CSV Modal */}
      <DownloadStorageModal
        ews={ews}
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
      />

      {/* Device Options Modal (Menu Tunggal Opsi Lainnya) */}
      <DeviceOptionsModal
        ews={ews}
        isOpen={isOptionsModalOpen}
        onClose={() => setIsOptionsModalOpen(false)}
        onOpenEditConfig={handleOpenEditConfig}
        onOpenTelegram={handleOpenTelegram}
        onOpenTelkomsel={handleOpenTelkomsel}
        onOpenThreshold={handleOpenThreshold}
        onOpenDownload={() => setIsDownloadModalOpen(true)}
        onRequestDataNow={handleRequestDataNow}
        isRequestingData={isRequestingData}
        canControl={Boolean(canControl)}
        onTestSiren={handleTestSiren}
        isSirenTesting={isSirenTesting}
        onToggleMute={handleToggleMute}
        onOpenTriggerCause={() => setIsTriggerCauseModalOpen(true)}
        onResetAlarm={handleResetClick}
        onRestartEsp={handleRestartEsp}
        isRestarting={isRestarting}
      />
    </div>
  );
};
