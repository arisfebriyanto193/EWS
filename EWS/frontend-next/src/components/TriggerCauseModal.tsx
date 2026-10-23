'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { EWSNode } from '../types';
import {
  AlertTriangle,
  Battery,
  CheckCircle2,
  Compass,
  Droplets,
  HardDrive,
  Info,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';

interface TriggerCauseModalProps {
  ews: EWSNode;
  isOpen: boolean;
  onClose: () => void;
  onToggleMute?: () => void;
  onResetAlarm?: (ewsId: string) => void;
  onOpenThresholdConfig?: () => void;
}

const f2 = (val: number | string | undefined | null, fallback = 0): string => {
  if (val === undefined || val === null || val === '') return fallback.toFixed(2);
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return fallback.toFixed(2);
  return num.toFixed(2);
};

export const TriggerCauseModal: React.FC<TriggerCauseModalProps> = ({
  ews,
  isOpen,
  onClose,
  onToggleMute,
  onResetAlarm,
  onOpenThresholdConfig,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle ESC key & lock body scroll while modal is active
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const { sensorData, thresholds, status } = ews;

  // 1. Analisis Inclinometer Pitch & Roll
  const safePitch = thresholds.safeTiltPitch ?? 0;
  const safeRoll = thresholds.safeTiltRoll ?? 0;
  const pitchDev = Math.abs(sensorData.pitchAngle - safePitch);
  const rollDev = Math.abs(sensorData.rollAngle - safeRoll);

  const isPitchDanger = pitchDev >= thresholds.tiltDanger;
  const isRollDanger = rollDev >= thresholds.tiltDanger;
  const isTiltDanger = isPitchDanger || isRollDanger;

  const isPitchWarning = !isPitchDanger && pitchDev >= thresholds.tiltWarning;
  const isRollWarning = !isRollDanger && rollDev >= thresholds.tiltWarning;
  const isTiltWarning = !isTiltDanger && (isPitchWarning || isRollWarning);

  // 2. Analisis Hujan
  const isRainDanger = sensorData.rainfallRate >= thresholds.rainDanger;
  const isRainWarning =
    !isRainDanger && sensorData.rainfallRate >= thresholds.rainWarning;

  // 3. Analisis Getaran
  const isVibDanger =
    thresholds.vibrationDanger > 0 &&
    sensorData.vibrationLevel >= thresholds.vibrationDanger;

  // 4. Analisis Kelembapan Tanah
  const safeSoil = thresholds.safeSoilMoisture ?? 50;
  const soilTol = thresholds.soilMoistureTolerance ?? 15;
  const isSoilWarning =
    sensorData.soilMoisture >= thresholds.soilMoistureWarning ||
    (soilTol > 0 && sensorData.soilMoisture > safeSoil + soilTol);

  // 5. Analisis Baterai / INA / Pembagi Resistor
  const isBattZeroOrDisconnected = sensorData.batteryVoltage <= 0.5;
  const isBattLow =
    !isBattZeroOrDisconnected &&
    sensorData.batteryVoltage < thresholds.batteryLowVoltage;

  // Format teks alasan agar rapi dan tidak kaku
  let displayReason =
    ews.alarmReason ||
    sensorData.alarmReason ||
    (status === 'bahaya'
      ? 'Terdeteksi anomali kritis kemiringan tanah / curah hujan ekstrem / getaran gempa yang mengancam kestabilan lereng'
      : status === 'siaga'
      ? 'Parameter kemiringan tanah / curah hujan / kelembapan tanah telah melampaui batas toleransi siaga'
      : status === 'baterai_lemah'
      ? isBattZeroOrDisconnected
        ? 'Tegangan Baterai / Sensor Daya 0.00V [Peringatan Pemeliharaan Web Saja, Relay Lapangan OFF]'
        : `Tegangan Baterai Lemah (${f2(sensorData.batteryVoltage)}V < ${f2(thresholds.batteryLowVoltage)}V) [Relay Lapangan OFF]`
      : 'Semua parameter sensor berada dalam batas normal dan aman');

  // Bersihkan teks dari format kurung siku untuk ringkasan utama
  const cleanSummary = displayReason
    .replace(/\[.*?\]/g, '')
    .trim();

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-[#0b0f19]">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                status === 'bahaya'
                  ? 'bg-red-100 text-red-600 dark:bg-red-950/80 dark:text-red-400 ring-2 ring-red-500/30'
                  : status === 'siaga'
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/80 dark:text-amber-400 ring-2 ring-amber-500/30'
                  : status === 'baterai_lemah'
                  ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/80 dark:text-orange-400 ring-2 ring-orange-500/30'
                  : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400'
              }`}
            >
              {status === 'bahaya' ? (
                <ShieldAlert className="w-6 h-6 animate-pulse" />
              ) : status === 'siaga' ? (
                <AlertTriangle className="w-6 h-6" />
              ) : status === 'baterai_lemah' ? (
                <Battery className="w-6 h-6" />
              ) : (
                <CheckCircle2 className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Identifikasi & Analisis Sensor Pemicu
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    status === 'bahaya'
                      ? 'bg-red-600 text-white'
                      : status === 'siaga'
                      ? 'bg-amber-500 text-white'
                      : status === 'baterai_lemah'
                      ? 'bg-orange-500 text-white'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  {status === 'baterai_lemah' ? 'PERINGATAN PEMELIHARAAN' : status.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                Perangkat: <strong>{ews.id}</strong> &bull; {ews.name} {ews.location ? `(${ews.location})` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Tutup (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          
          {/* 1. Highlight Banner Penyebab Utama */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              status === 'bahaya'
                ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
                : status === 'siaga'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                : status === 'baterai_lemah'
                ? 'bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800 text-orange-900 dark:text-orange-200'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <span className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider">
                <Info className="w-4 h-4 shrink-0" />
                <span>Penyebab Pemicu Status Saat Ini:</span>
              </span>

              {/* Status Relay Protection Pill */}
              {status === 'baterai_lemah' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-200 dark:bg-orange-900/60 text-orange-900 dark:text-orange-200 border border-orange-300 dark:border-orange-700">
                  Relay Lapangan: MATI (OFF) Diproteksi
                </span>
              ) : status === 'bahaya' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-200 dark:bg-red-900/60 text-red-900 dark:text-red-200 border border-red-300 dark:border-red-700">
                  Relay Lapangan: AKTIF (ON) Sesuai Siklus
                </span>
              ) : status === 'siaga' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                  Relay Lapangan: MATI (OFF) - Peringatan Dini Saja
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                  Relay Lapangan: SIAGA NORMAL (OFF)
                </span>
              )}
            </div>

            <p className="text-sm font-semibold leading-relaxed">
              {cleanSummary}
            </p>

            {status === 'baterai_lemah' && (
              <div className="mt-3 pt-2.5 border-t border-orange-200 dark:border-orange-800/60 text-[11px] text-orange-800 dark:text-orange-300 space-y-1">
                <p>
                  🛡️ <strong>Catatan Keamanan & Proteksi Sistem:</strong>
                </p>
                <p className="leading-relaxed">
                  Tegangan aki / sensor INA terdeteksi <strong>{f2(sensorData.batteryVoltage)}V</strong>. Kondisi ini <strong>BUKAN tanda bahaya bencana alam</strong>. Relay sirine dan lampu strobo di lapangan sengaja dinonaktifkan (OFF) agar aki terlindungi dari kerusakan deep discharge dan tidak membunyikan alarm palsu di pemukiman warga.
                </p>
              </div>
            )}
          </div>

          {/* 2. Matriks Evaluasi Parameter Sensor vs Ambang Batas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span>Analisis Pembacaan Seluruh Sensor vs Ambang Batas</span>
              </h4>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Kartu bergaris tebal menandakan sensor pemicu aktif
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              
              {/* Parameter 1: Inclinometer Kemiringan Pitch */}
              <div
                className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                  isPitchDanger
                    ? 'bg-red-50/80 dark:bg-red-950/40 border-red-500 ring-2 ring-red-500/40 shadow-xs'
                    : isPitchWarning
                    ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/40 shadow-xs'
                    : 'bg-slate-50/90 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      Kemiringan Pitch (X)
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isPitchDanger
                          ? 'bg-red-600 text-white'
                          : isPitchWarning
                          ? 'bg-amber-500 text-white'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {isPitchDanger ? 'BAHAYA' : isPitchWarning ? 'SIAGA' : 'NORMAL'}
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline justify-between font-mono">
                    <span className="text-xl font-bold text-slate-900 dark:text-white">
                      {sensorData.pitchAngle > 0 ? `+${f2(sensorData.pitchAngle)}°` : `${f2(sensorData.pitchAngle)}°`}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Simpangan: {f2(pitchDev)}°
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                  Aman: {safePitch > 0 ? `+${f2(safePitch)}` : f2(safePitch)}° (±{f2(thresholds.tiltTolerance ?? 2)}°) &bull; Siaga: {f2(thresholds.tiltWarning)}° &bull; Bahaya: {f2(thresholds.tiltDanger)}°
                </div>
              </div>

              {/* Parameter 2: Inclinometer Kemiringan Roll */}
              <div
                className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                  isRollDanger
                    ? 'bg-red-50/80 dark:bg-red-950/40 border-red-500 ring-2 ring-red-500/40 shadow-xs'
                    : isRollWarning
                    ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/40 shadow-xs'
                    : 'bg-slate-50/90 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      Kemiringan Roll (Y)
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isRollDanger
                          ? 'bg-red-600 text-white'
                          : isRollWarning
                          ? 'bg-amber-500 text-white'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {isRollDanger ? 'BAHAYA' : isRollWarning ? 'SIAGA' : 'NORMAL'}
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline justify-between font-mono">
                    <span className="text-xl font-bold text-slate-900 dark:text-white">
                      {sensorData.rollAngle > 0 ? `+${f2(sensorData.rollAngle)}°` : `${f2(sensorData.rollAngle)}°`}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Simpangan: {f2(rollDev)}°
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                  Aman: {safeRoll > 0 ? `+${f2(safeRoll)}` : f2(safeRoll)}° (±{f2(thresholds.tiltTolerance ?? 2)}°) &bull; Siaga: {f2(thresholds.tiltWarning)}° &bull; Bahaya: {f2(thresholds.tiltDanger)}°
                </div>
              </div>

              {/* Parameter 3: Intensitas Curah Hujan */}
              <div
                className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                  isRainDanger
                    ? 'bg-red-50/80 dark:bg-red-950/40 border-red-500 ring-2 ring-red-500/40 shadow-xs'
                    : isRainWarning
                    ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/40 shadow-xs'
                    : 'bg-slate-50/90 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Droplets className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      Curah Hujan (Tipping)
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isRainDanger
                          ? 'bg-red-600 text-white'
                          : isRainWarning
                          ? 'bg-amber-500 text-white'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {isRainDanger ? 'BAHAYA' : isRainWarning ? 'SIAGA' : 'NORMAL'}
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline justify-between font-mono">
                    <span className="text-xl font-bold text-slate-900 dark:text-white">
                      {f2(sensorData.rainfallRate)}{' '}
                      <span className="text-xs font-normal text-slate-500">mm/jam</span>
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Total: {f2(sensorData.rainfallCumulative)} mm
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                  Siaga: {f2(thresholds.rainWarning)} mm/jam &bull; Bahaya: {f2(thresholds.rainDanger)} mm/jam
                </div>
              </div>

              {/* Parameter 4: Kelembapan Tanah */}
              <div
                className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                  isSoilWarning
                    ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/40 shadow-xs'
                    : 'bg-slate-50/90 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Droplets className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      Kelembapan Tanah
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isSoilWarning ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {isSoilWarning ? 'SIAGA (JENUH)' : 'NORMAL'}
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline justify-between font-mono">
                    <span className="text-xl font-bold text-slate-900 dark:text-white">
                      {f2(sensorData.soilMoisture)}%
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Suhu: {f2(sensorData.soilTemperature ?? 25.2)}°C
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                  Aman: {f2(safeSoil)}% (±{f2(soilTol)}%) &bull; Batas Jenuh: {f2(thresholds.soilMoistureWarning)}%
                </div>
              </div>

              {/* Parameter 5: Sensor Getaran Gempa */}
              <div
                className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                  isVibDanger
                    ? 'bg-red-50/80 dark:bg-red-950/40 border-red-500 ring-2 ring-red-500/40 shadow-xs'
                    : 'bg-slate-50/90 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      Getaran Gempa / Lereng
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isVibDanger ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {isVibDanger ? 'BAHAYA' : 'NORMAL'}
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline justify-between font-mono">
                    <span className="text-xl font-bold text-slate-900 dark:text-white">
                      {f2(sensorData.vibrationLevel)}{' '}
                      <span className="text-xs font-normal text-slate-500">g</span>
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Ambang: {f2(thresholds.vibrationDanger)}g
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                  Sensor Getaran Digital & Akselerometer 801S
                </div>
              </div>

              {/* Parameter 6: Tegangan Baterai Aki & Sensor INA */}
              <div
                className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                  isBattZeroOrDisconnected || isBattLow
                    ? 'bg-orange-50/80 dark:bg-orange-950/40 border-orange-500 ring-2 ring-orange-500/50 shadow-xs'
                    : 'bg-slate-50/90 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Battery className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      Catu Daya Aki {sensorData.inaAvailable ? '(INA219)' : '(Divider 11:4)'}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isBattZeroOrDisconnected
                          ? 'bg-orange-600 text-white'
                          : isBattLow
                          ? 'bg-orange-500 text-white'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {isBattZeroOrDisconnected
                        ? '0.00V / TERPUTUS'
                        : isBattLow
                        ? 'BATERAI LEMAH'
                        : 'NORMAL'}
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline justify-between font-mono">
                    <span className="text-xl font-bold text-slate-900 dark:text-white">
                      {f2(sensorData.batteryVoltage)} V
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                      {sensorData.batteryVoltage <= 0.5 ? 'Terputus / 0V' : 'Catu Daya Siaga'}
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                  Ambang Bawah: {f2(thresholds.batteryLowVoltage)}V &bull; Relay: MATI (OFF)
                </div>
              </div>

            </div>
          </div>

          {/* 3. Status Aktuator Fisik di Lapangan (Relay GPIO 46) */}
          <div className="p-3.5 rounded-xl bg-slate-50/90 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                <Zap className="w-3.5 h-3.5 text-yellow-500" />
                Status Aktuator Relay Lapangan (GPIO 46 - Active-High)
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Sirine & Strobo Terpadu
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center font-mono">
              <div className="p-2.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block mb-0.5">
                  Sirine 12V 110dB
                </span>
                <span
                  className={`text-xs font-bold ${
                    ews.muted
                      ? 'text-red-500'
                      : ews.sirenActive
                      ? 'text-red-600 dark:text-red-400 animate-pulse'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {ews.muted ? 'DISENYAPKAN (MUTED)' : ews.sirenActive ? 'AKTIF (ON)' : 'MATI (OFF)'}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block mb-0.5">
                  Lampu Strobo 12V
                </span>
                <span
                  className={`text-xs font-bold ${
                    ews.stroboActive
                      ? 'text-amber-500 dark:text-amber-400 animate-pulse'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {ews.stroboActive ? 'AKTIF (ON)' : 'MATI (OFF)'}
                </span>
              </div>

              <div className="col-span-2 sm:col-span-1 p-2.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 block mb-0.5">
                  Siklus Timer Sirine
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {thresholds.alarmDuration ?? 60}s ON / {thresholds.alarmPause ?? 30}s Jeda
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-[#0b0f19]">
          <div className="flex items-center gap-2">
            {onToggleMute && (
              <button
                onClick={onToggleMute}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  ews.muted
                    ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {ews.muted ? <VolumeX className="w-3.5 h-3.5 text-red-600" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{ews.muted ? 'Buka Suara Sirine' : 'Senyapkan Sirine'}</span>
              </button>
            )}

            {status !== 'aman' && onResetAlarm && (
              <button
                onClick={() => {
                  onResetAlarm(ews.id);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Alarm</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onOpenThresholdConfig && (
              <button
                onClick={() => {
                  onClose();
                  onOpenThresholdConfig();
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Atur Ambang Batas</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              Tutup
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
