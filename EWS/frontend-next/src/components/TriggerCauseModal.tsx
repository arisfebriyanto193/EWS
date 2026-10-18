'use client';
import React from 'react';
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

export const TriggerCauseModal: React.FC<TriggerCauseModalProps> = ({
  ews,
  isOpen,
  onClose,
  onToggleMute,
  onResetAlarm,
  onOpenThresholdConfig,
}) => {
  if (!isOpen) return null;

  const { sensorData, thresholds, status } = ews;

  // 1. Analisis Inclinometer Pitch & Roll
  const safePitch = thresholds.safeTiltPitch ?? 0;
  const safeRoll = thresholds.safeTiltRoll ?? 0;
  const pitchDev = Math.abs(sensorData.pitchAngle - safePitch);
  const rollDev = Math.abs(sensorData.rollAngle - safeRoll);

  const isTiltDanger =
    pitchDev >= thresholds.tiltDanger || rollDev >= thresholds.tiltDanger;
  const isTiltWarning =
    !isTiltDanger &&
    (pitchDev >= thresholds.tiltWarning ||
      rollDev >= thresholds.tiltWarning ||
      pitchDev >= (thresholds.tiltTolerance ?? 2) ||
      rollDev >= (thresholds.tiltTolerance ?? 2));

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

  // Ambil Alasan Utama
  const displayReason =
    ews.alarmReason ||
    sensorData.alarmReason ||
    (status === 'bahaya'
      ? 'Terdeteksi anomali kritis kemiringan tanah / curah hujan ekstrem / getaran gempa yang mengancam kestabilan lereng'
      : status === 'siaga'
      ? 'Parameter kemiringan tanah / curah hujan / kelembapan tanah telah melampaui batas toleransi siaga'
      : status === 'baterai_lemah'
      ? isBattZeroOrDisconnected
        ? 'Tegangan Baterai / Sensor Daya 0.00V [Bukan Tanda Bahaya, Relay OFF]'
        : `Tegangan Aki Berada di Bawah Batas Aman (${sensorData.batteryVoltage}V < ${thresholds.batteryLowVoltage}V)`
      : 'Semua parameter sensor berada dalam batas normal dan aman');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#120f24] border border-slate-200 dark:border-purple-900/40 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header Modal */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-purple-900/30 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-[#17142b]/80">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                status === 'bahaya'
                  ? 'bg-red-100 text-red-600 dark:bg-red-950/80 dark:text-red-400'
                  : status === 'siaga'
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/80 dark:text-amber-400'
                  : status === 'baterai_lemah'
                  ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/80 dark:text-orange-400'
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
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Identifikasi Sensor Pemicu Status
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    status === 'bahaya'
                      ? 'bg-red-600 text-white'
                      : status === 'siaga'
                      ? 'bg-amber-500 text-white'
                      : status === 'baterai_lemah'
                      ? 'bg-orange-500 text-white'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  {status === 'baterai_lemah' ? 'BATERAI LEMAH' : status.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-purple-300/70 font-mono">
                {ews.id} &bull; {ews.name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-purple-950/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">

          {/* 1. Highlight Banner Penyebab Utama */}
          <div
            className={`p-4 rounded-xl border ${
              status === 'bahaya'
                ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
                : status === 'siaga'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                : status === 'baterai_lemah'
                ? 'bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800 text-orange-900 dark:text-orange-200'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5 font-bold text-xs uppercase tracking-wider">
              <Info className="w-4 h-4 shrink-0" />
              <span>Deskripsi Penyebab / Alasan Alarm:</span>
            </div>
            <p className="text-sm font-semibold leading-relaxed">
              {displayReason}
            </p>
            {status === 'baterai_lemah' && (
              <div className="mt-2.5 pt-2 border-t border-orange-200 dark:border-orange-800/60 text-[11px] text-orange-800 dark:text-orange-300">
                🛡️ <strong>Catatan Keamanan:</strong> Kondisi tegangan baterai/INA 0V <strong>BUKAN tanda bahaya bencana alam</strong>. Relay sirine dan lampu strobo di lapangan sengaja dinonaktifkan (OFF) agar aki terlindungi dari kerusakan dan tidak menimbulkan alarm palsu di pemukiman warga.
              </div>
            )}
          </div>

          {/* 2. Matriks Evaluasi Parameter Sensor vs Ambang Batas */}
          <div>
            <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
              <span>Analisis Pembacaan Sensor vs Ambang Batas (Thresholds)</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              
              {/* Parameter 1: Inclinometer Kemiringan Pitch */}
              <div
                className={`p-3 rounded-xl border flex flex-col justify-between ${
                  pitchDev >= thresholds.tiltDanger
                    ? 'bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-800'
                    : pitchDev >= thresholds.tiltWarning
                    ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
                    : 'bg-slate-50 dark:bg-[#1a162b] border-slate-200 dark:border-purple-900/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    Kemiringan Pitch (X)
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      pitchDev >= thresholds.tiltDanger
                        ? 'bg-red-600 text-white'
                        : pitchDev >= thresholds.tiltWarning
                        ? 'bg-amber-500 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {pitchDev >= thresholds.tiltDanger
                      ? 'BAHAYA'
                      : pitchDev >= thresholds.tiltWarning
                      ? 'SIAGA'
                      : 'NORMAL'}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between font-mono">
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {sensorData.pitchAngle > 0 ? `+${sensorData.pitchAngle}°` : `${sensorData.pitchAngle}°`}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-purple-300/70">
                    Simpangan: {pitchDev.toFixed(2)}°
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-purple-300/60 mt-1">
                  Baseline: {safePitch}° &bull; Siaga: {thresholds.tiltWarning}° &bull; Bahaya: {thresholds.tiltDanger}°
                </div>
              </div>

              {/* Parameter 2: Inclinometer Kemiringan Roll */}
              <div
                className={`p-3 rounded-xl border flex flex-col justify-between ${
                  rollDev >= thresholds.tiltDanger
                    ? 'bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-800'
                    : rollDev >= thresholds.tiltWarning
                    ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
                    : 'bg-slate-50 dark:bg-[#1a162b] border-slate-200 dark:border-purple-900/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    Kemiringan Roll (Y)
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      rollDev >= thresholds.tiltDanger
                        ? 'bg-red-600 text-white'
                        : rollDev >= thresholds.tiltWarning
                        ? 'bg-amber-500 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {rollDev >= thresholds.tiltDanger
                      ? 'BAHAYA'
                      : rollDev >= thresholds.tiltWarning
                      ? 'SIAGA'
                      : 'NORMAL'}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between font-mono">
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {sensorData.rollAngle > 0 ? `+${sensorData.rollAngle}°` : `${sensorData.rollAngle}°`}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-purple-300/70">
                    Simpangan: {rollDev.toFixed(2)}°
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-purple-300/60 mt-1">
                  Baseline: {safeRoll}° &bull; Siaga: {thresholds.tiltWarning}° &bull; Bahaya: {thresholds.tiltDanger}°
                </div>
              </div>

              {/* Parameter 3: Intensitas Curah Hujan */}
              <div
                className={`p-3 rounded-xl border flex flex-col justify-between ${
                  isRainDanger
                    ? 'bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-800'
                    : isRainWarning
                    ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
                    : 'bg-slate-50 dark:bg-[#1a162b] border-slate-200 dark:border-purple-900/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Droplets className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    Curah Hujan (Tipping Bucket)
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
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {sensorData.rainfallRate} <span className="text-xs font-normal">mm/jam</span>
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-purple-300/70">
                    Total: {sensorData.rainfallCumulative} mm
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-purple-300/60 mt-1">
                  Siaga: {thresholds.rainWarning} mm &bull; Bahaya: {thresholds.rainDanger} mm
                </div>
              </div>

              {/* Parameter 4: Kelembapan Tanah */}
              <div
                className={`p-3 rounded-xl border flex flex-col justify-between ${
                  isSoilWarning
                    ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
                    : 'bg-slate-50 dark:bg-[#1a162b] border-slate-200 dark:border-purple-900/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
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
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {sensorData.soilMoisture.toFixed(1)}%
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-purple-300/70">
                    Suhu: {sensorData.soilTemperature ?? 25.2}°C
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-purple-300/60 mt-1">
                  Baseline: {safeSoil}% &bull; Batas Jenuh: {thresholds.soilMoistureWarning}%
                </div>
              </div>

              {/* Parameter 5: Sensor Getaran Gempa */}
              <div
                className={`p-3 rounded-xl border flex flex-col justify-between ${
                  isVibDanger
                    ? 'bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-800'
                    : 'bg-slate-50 dark:bg-[#1a162b] border-slate-200 dark:border-purple-900/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Radio className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Getaran / Akselerometer
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
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {sensorData.vibrationLevel} <span className="text-xs font-normal">g</span>
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-purple-300/70">
                    Ambang: {thresholds.vibrationDanger}g
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-purple-300/60 mt-1">
                  Sensor Getaran Digital & Akselerometer 801S
                </div>
              </div>

              {/* Parameter 6: Tegangan Baterai Aki & Sensor INA */}
              <div
                className={`p-3 rounded-xl border flex flex-col justify-between ${
                  isBattZeroOrDisconnected || isBattLow
                    ? 'bg-orange-50/70 dark:bg-orange-950/30 border-orange-300 dark:border-orange-800'
                    : 'bg-slate-50 dark:bg-[#1a162b] border-slate-200 dark:border-purple-900/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Battery className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    Catu Daya Aki {sensorData.inaAvailable ? '(INA219/226)' : '(Divider 11:4)'}
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
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {sensorData.batteryVoltage.toFixed(2)} V
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-purple-300/70">
                    Arus: {sensorData.batteryCurrent ?? 0} mA
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-purple-300/60 mt-1">
                  Batas Aman: {thresholds.batteryLowVoltage}V &bull; Relay: MATI (OFF)
                </div>
              </div>

            </div>
          </div>

          {/* 3. Status Aktuator Fisik di Lapangan (Relay GPIO 46) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#17142b] border border-slate-200 dark:border-purple-900/30">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-yellow-500" />
                Status Aktuator Relay Lapangan (GPIO 46)
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Active-High &bull; Sirine & Strobo Terpadu
              </span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center font-mono">
              <div className="p-2 rounded-lg bg-white dark:bg-[#120f24] border border-slate-200 dark:border-purple-900/30">
                <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-purple-300/70 block">
                  Sirine 12V 110dB
                </span>
                <span
                  className={`text-xs font-bold ${
                    ews.muted
                      ? 'text-red-500'
                      : ews.sirenActive
                      ? 'text-red-600 dark:text-red-400 animate-pulse'
                      : 'text-slate-500'
                  }`}
                >
                  {ews.muted ? 'DISENYAPKAN (MUTED)' : ews.sirenActive ? 'AKTIF (ON)' : 'MATI (OFF)'}
                </span>
              </div>

              <div className="p-2 rounded-lg bg-white dark:bg-[#120f24] border border-slate-200 dark:border-purple-900/30">
                <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-purple-300/70 block">
                  Lampu Strobo 12V
                </span>
                <span
                  className={`text-xs font-bold ${
                    ews.stroboActive
                      ? 'text-amber-500 dark:text-amber-400 animate-pulse'
                      : 'text-slate-500'
                  }`}
                >
                  {ews.stroboActive ? 'AKTIF (ON)' : 'MATI (OFF)'}
                </span>
              </div>

              <div className="col-span-2 sm:col-span-1 p-2 rounded-lg bg-white dark:bg-[#120f24] border border-slate-200 dark:border-purple-900/30">
                <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-purple-300/70 block">
                  Siklus Timer Sirine
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {thresholds.alarmDuration ?? 60}s Bunyi / {thresholds.alarmPause ?? 30}s Jeda
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-purple-900/30 flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 dark:bg-[#17142b]/80">
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
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1e1933] hover:bg-purple-50 dark:hover:bg-purple-950/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-purple-900/50 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>Atur Ambang Batas</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
