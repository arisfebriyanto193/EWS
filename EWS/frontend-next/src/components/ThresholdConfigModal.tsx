'use client';
import React, { useState, useEffect, useRef } from 'react';
import { EWSNode } from '../types';
import { api } from '../services/api';
import { wsClient } from '../services/websocket';
import {
  Activity,
  AlertTriangle,
  Battery,
  CheckCircle2,
  Compass,
  Cpu,
  Droplets,
  HardDrive,
  Info,
  Loader2,
  Radio,
  RotateCcw,
  Sliders,
  Target,
  Zap,
  X,
} from 'lucide-react';

interface ThresholdConfigModalProps {
  ews: EWSNode;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedThresholds: EWSNode['thresholds']) => void;
}

const DEFAULT_THRESHOLDS: EWSNode['thresholds'] = {
  safeTiltPitch: 0.0,
  safeTiltRoll: 0.0,
  tiltTolerance: 2.0,
  tiltWarning: 5.0,
  tiltDanger: 10.0,
  rainWarning: 20.0,
  rainDanger: 50.0,
  rainCalibPerTip: 0.70,
  safeSoilMoisture: 50.0,
  soilMoistureTolerance: 15.0,
  soilMoistureWarning: 75.0,
  soilAdcDry: 3300,
  soilAdcWet: 1200,
  vibrationDanger: 0.25,
  batteryLowVoltage: 11.8,
  alarmDuration: 60,
  alarmPause: 30,
};

type FormThresholds = Partial<Record<keyof EWSNode['thresholds'], string | number>>;

const toFixed2 = (val: any, fallback = 0): number => {
  if (val === undefined || val === null || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return fallback;
  return parseFloat(num.toFixed(2));
};

const formatInitialThresholds = (src?: Partial<EWSNode['thresholds']>): FormThresholds => {
  const merged = { ...DEFAULT_THRESHOLDS, ...(src || {}) };
  return {
    safeTiltPitch: toFixed2(merged.safeTiltPitch, 0),
    safeTiltRoll: toFixed2(merged.safeTiltRoll, 0),
    tiltTolerance: toFixed2(merged.tiltTolerance, 2),
    tiltWarning: toFixed2(merged.tiltWarning, 5),
    tiltDanger: toFixed2(merged.tiltDanger, 10),
    rainWarning: toFixed2(merged.rainWarning, 20),
    rainDanger: toFixed2(merged.rainDanger, 50),
    rainCalibPerTip: toFixed2(merged.rainCalibPerTip, 0.70),
    safeSoilMoisture: toFixed2(merged.safeSoilMoisture, 50),
    soilMoistureTolerance: toFixed2(merged.soilMoistureTolerance, 15),
    soilMoistureWarning: toFixed2(merged.soilMoistureWarning, 75),
    soilAdcDry: Math.round(Number(merged.soilAdcDry ?? 3300)),
    soilAdcWet: Math.round(Number(merged.soilAdcWet ?? 1200)),
    vibrationDanger: toFixed2(merged.vibrationDanger, 0.25),
    batteryLowVoltage: toFixed2(merged.batteryLowVoltage, 11.8),
    alarmDuration: Math.round(Number(merged.alarmDuration ?? 60)),
    alarmPause: Math.round(Number(merged.alarmPause ?? 30)),
  };
};

export const ThresholdConfigModal: React.FC<ThresholdConfigModalProps> = ({
  ews,
  isOpen,
  onClose,
  onSave,
}) => {
  const [thresholds, setThresholds] = useState<FormThresholds>(
    formatInitialThresholds(ews.thresholds)
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [quickCalibToast, setQuickCalibToast] = useState<string | null>(null);

  // Ref untuk mendeteksi pembukaan modal atau pergantian node ID
  const prevOpenRef = useRef(false);
  const prevIdRef = useRef(ews.id);

  useEffect(() => {
    // Hanya re-populate data formulir saat modal BARU DIBUKA (isOpen transisi false -> true)
    // atau ketika pengguna berpindah ke node ID EWS yang berbeda.
    // JANGAN re-populate saat modal sedang aktif dibuka agar input ketikan pengguna tidak tertimpa telemetri WebSocket!
    const isNewOpen = isOpen && !prevOpenRef.current;
    const isDifferentNode = isOpen && prevIdRef.current !== ews.id;

    if (isNewOpen || isDifferentNode) {
      setThresholds(formatInitialThresholds(ews?.thresholds));
      setSaveError(null);
      setSaveSuccess(false);
      setIsSaving(false);
      setQuickCalibToast(null);
    }

    prevOpenRef.current = isOpen;
    prevIdRef.current = ews.id;
  }, [isOpen, ews.id]);

  if (!isOpen) return null;

  const handleChange = (key: keyof EWSNode['thresholds'], val: string) => {
    // Simpan string mentah agar pengguna bebas mengetik tanda minus (-), desimal (.), atau backspace tanpa tertimpa atau reset
    setThresholds((prev) => ({
      ...prev,
      [key]: val,
    }));
  };

  // Konversi seluruh nilai form menjadi angka bersih dan terverifikasi
  const getCleanThresholds = (raw: FormThresholds): EWSNode['thresholds'] => {
    return {
      safeTiltPitch: parseFloat(String(raw.safeTiltPitch ?? 0)) || 0,
      safeTiltRoll: parseFloat(String(raw.safeTiltRoll ?? 0)) || 0,
      tiltTolerance: Math.max(0.1, parseFloat(String(raw.tiltTolerance ?? 2)) || 2),
      tiltWarning: Math.max(0.1, parseFloat(String(raw.tiltWarning ?? 5)) || 5),
      tiltDanger: Math.max(0.1, parseFloat(String(raw.tiltDanger ?? 10)) || 10),
      rainWarning: Math.max(0, parseFloat(String(raw.rainWarning ?? 20)) || 20),
      rainDanger: Math.max(0, parseFloat(String(raw.rainDanger ?? 50)) || 50),
      rainCalibPerTip: Math.max(0.01, parseFloat(String(raw.rainCalibPerTip ?? 0.70)) || 0.70),
      safeSoilMoisture: Math.max(0, parseFloat(String(raw.safeSoilMoisture ?? 50)) || 50),
      soilMoistureTolerance: Math.max(0, parseFloat(String(raw.soilMoistureTolerance ?? 15)) || 15),
      soilMoistureWarning: Math.max(0, parseFloat(String(raw.soilMoistureWarning ?? 75)) || 75),
      soilAdcDry: parseInt(String(raw.soilAdcDry ?? 3300), 10) || 3300,
      soilAdcWet: parseInt(String(raw.soilAdcWet ?? 1200), 10) || 1200,
      vibrationDanger: Math.max(0, parseFloat(String(raw.vibrationDanger ?? 0.25)) || 0.25),
      batteryLowVoltage: Math.max(0, parseFloat(String(raw.batteryLowVoltage ?? 11.8)) || 11.8),
      alarmDuration: Math.max(1, parseInt(String(raw.alarmDuration ?? 60), 10) || 60),
      alarmPause: Math.max(0, parseInt(String(raw.alarmPause ?? 30), 10) || 30),
    };
  };

  // 1-KLIK AMBIL NILAI SENSOR SAAT INI SEBAGAI TITIK AMAN
  const captureCurrentAsSafeBaseline = () => {
    const curPitch = parseFloat((ews.sensorData?.pitchAngle ?? 0).toFixed(2));
    const curRoll  = parseFloat((ews.sensorData?.rollAngle ?? 0).toFixed(2));
    const curSoil  = parseFloat((ews.sensorData?.soilMoisture ?? 0).toFixed(1));

    setThresholds((prev) => ({
      ...prev,
      safeTiltPitch: curPitch,
      safeTiltRoll: curRoll,
      safeSoilMoisture: curSoil,
    }));

    setQuickCalibToast(
      `Nilai acuan posisi aman diserap dari sensor: Pitch=${curPitch > 0 ? `+${curPitch}` : curPitch}°, Roll=${curRoll > 0 ? `+${curRoll}` : curRoll}°, Tanah=${curSoil}%`
    );
    setTimeout(() => setQuickCalibToast(null), 4000);
  };

  // EKSEKUSI PENYIMPANAN KE WEBSOCKET & REST API
  const executeSave = async (targetThresholds?: FormThresholds) => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const cleanThresholds = getCleanThresholds(targetThresholds || thresholds);
      setThresholds(cleanThresholds);

      // Buat payload ganda (camelCase & shortKey) agar 100% kompatibel dengan Web Server & EEPROM ESP32
      const fullPayload = {
        // CamelCase
        safeTiltPitch: cleanThresholds.safeTiltPitch,
        safeTiltRoll: cleanThresholds.safeTiltRoll,
        tiltTolerance: cleanThresholds.tiltTolerance,
        tiltWarning: cleanThresholds.tiltWarning,
        tiltDanger: cleanThresholds.tiltDanger,
        rainWarning: cleanThresholds.rainWarning,
        rainDanger: cleanThresholds.rainDanger,
        rainCalibPerTip: cleanThresholds.rainCalibPerTip,
        safeSoilMoisture: cleanThresholds.safeSoilMoisture,
        soilMoistureTolerance: cleanThresholds.soilMoistureTolerance,
        soilMoistureWarning: cleanThresholds.soilMoistureWarning,
        soilAdcDry: cleanThresholds.soilAdcDry,
        soilAdcWet: cleanThresholds.soilAdcWet,
        vibrationDanger: cleanThresholds.vibrationDanger,
        batteryLowVoltage: cleanThresholds.batteryLowVoltage,
        alarmDuration: cleanThresholds.alarmDuration ?? 60,
        alarmPause: cleanThresholds.alarmPause ?? 30,

        // Format Web Server ESP32 (/api/save_calibration)
        safePitch: cleanThresholds.safeTiltPitch,
        safeRoll: cleanThresholds.safeTiltRoll,
        tiltTol: cleanThresholds.tiltTolerance,
        tiltWarn: cleanThresholds.tiltWarning,
        tiltDang: cleanThresholds.tiltDanger,
        rainWarn: cleanThresholds.rainWarning,
        rainDang: cleanThresholds.rainDanger,
        rainCalib: cleanThresholds.rainCalibPerTip,
        safeSoil: cleanThresholds.safeSoilMoisture,
        soilTol: cleanThresholds.soilMoistureTolerance,
        soilWarn: cleanThresholds.soilMoistureWarning,
        soilDry: cleanThresholds.soilAdcDry,
        soilWet: cleanThresholds.soilAdcWet,
        vibDang: cleanThresholds.vibrationDanger,
        battLow: cleanThresholds.batteryLowVoltage,
        alarmDur: cleanThresholds.alarmDuration ?? 60,
        alarmPau: cleanThresholds.alarmPause ?? 30,
      };

      // 1. Siarkan perintah SET_THRESHOLDS via WebSocket langsung ke ESP32
      wsClient.publish(`ews/${ews.id}/command`, {
        command: 'SET_THRESHOLDS',
        ewsId: ews.id,
        thresholds: fullPayload,
        timestamp: new Date().toISOString(),
      });

      // 2. Simpan ke Backend Database (REST API)
      await api.updateEwsThresholds(ews.id, cleanThresholds);

      // 3. Update state di parent dashboard
      onSave(cleanThresholds);

      setSaveSuccess(true);
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Gagal menyimpan kalibrasi threshold:', err);
      setSaveError(err.message || 'Gagal mengirim konfigurasi kalibrasi ke server/ESP32');
      setIsSaving(false);
    }
  };

  // 1-KLIK KALIBRASI POSISI AMAN & LANGSUNG SIMPAN KE EEPROM
  const handleInstantCalibrateAndSave = () => {
    const curPitch = parseFloat((ews.sensorData?.pitchAngle ?? 0).toFixed(2));
    const curRoll  = parseFloat((ews.sensorData?.rollAngle ?? 0).toFixed(2));
    const curSoil  = parseFloat((ews.sensorData?.soilMoisture ?? 0).toFixed(1));

    const updated: FormThresholds = {
      ...thresholds,
      safeTiltPitch: curPitch,
      safeTiltRoll: curRoll,
      safeSoilMoisture: curSoil,
    };

    setThresholds(updated);

    // Kirim juga sinyal CALIBRATE_BASELINE langsung ke ESP32
    wsClient.publish(`ews/${ews.id}/command`, {
      command: 'CALIBRATE_BASELINE',
      ewsId: ews.id,
      timestamp: new Date().toISOString(),
    });

    executeSave(updated);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    executeSave();
  };

  const handleResetDefaults = () => {
    if (confirm('Kembalikan semua nilai kalibrasi dan ambang batas ke setelan pabrik default?')) {
      setThresholds(formatInitialThresholds(DEFAULT_THRESHOLDS));
      setQuickCalibToast('Nilai formulir telah direset ke setelan standar pabrik.');
      setTimeout(() => setQuickCalibToast(null), 3000);
    }
  };

  // Hitung simpangan real-time saat ini terhadap titik acuan aman
  const livePitch = ews.sensorData?.pitchAngle ?? 0;
  const liveRoll  = ews.sensorData?.rollAngle ?? 0;
  const liveSoil  = ews.sensorData?.soilMoisture ?? 0;
  const safePitchNum = parseFloat(String(thresholds.safeTiltPitch ?? 0)) || 0;
  const safeRollNum  = parseFloat(String(thresholds.safeTiltRoll ?? 0)) || 0;
  const safeSoilNum  = parseFloat(String(thresholds.safeSoilMoisture ?? 50)) || 50;
  const pitchDev  = Math.abs(livePitch - safePitchNum);
  const rollDev   = Math.abs(liveRoll - safeRollNum);
  const soilDev   = Math.abs(liveSoil - safeSoilNum);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white dark:bg-[#141122] border border-slate-200 dark:border-purple-900/40 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-purple-900/30 flex items-center justify-between bg-slate-50 dark:bg-[#0c0a15]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center justify-center shadow-xs">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Atur Ambang Batas &amp; Kalibrasi Sensor</span>
                <span className="text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-mono font-bold">
                  {ews.id}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-purple-300/70">
                Nilai kalibrasi disinkronkan langsung ke <strong>Web Server ESP32</strong> &amp; disimpan permanen di <strong>EEPROM Flash (NVS)</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-purple-50 dark:hover:bg-purple-950/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSaveForm} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Status Alert Banner */}
          {saveSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <strong>Berhasil Tersimpan!</strong> Nilai kalibrasi &amp; ambang batas berhasil disiarkan ke topik{' '}
                <code className="font-mono bg-emerald-100 dark:bg-emerald-900/60 px-1 py-0.5 rounded">
                  ews/{ews.id}/command
                </code>{' '}
                dan disimpan permanen ke EEPROM ESP32.
              </div>
            </div>
          )}

          {saveError && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 text-xs flex items-center gap-2.5 animate-in fade-in">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
              <div>
                <strong>Gagal!</strong> {saveError}
              </div>
            </div>
          )}

          {quickCalibToast && (
            <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-200 text-xs flex items-center gap-2 animate-in fade-in">
              <Info className="w-4 h-4 text-purple-600 shrink-0" />
              <span>{quickCalibToast}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PANEL UTAMA: KALIBRASI POSISI AMAN 1-KLIK (INSTANT AUTO-CAPTURE)           */}
          {/* ========================================================================= */}
          <div className="p-4 rounded-2xl border-2 border-purple-500/30 dark:border-purple-500/40 bg-gradient-to-br from-purple-50/80 via-white to-indigo-50/50 dark:from-[#1b1531] dark:via-[#141122] dark:to-[#171329] shadow-sm space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs sm:text-sm">
                <Target className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>🎯 Kalibrasi Posisi Aman (1-Klik Auto-Capture)</span>
              </div>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full font-mono bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 font-semibold border border-purple-200 dark:border-purple-800">
                Status Sensor: Real-Time Aktif
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-purple-200/80 leading-relaxed">
              Posisikan tiang / modul EWS pada posisi tegak lereng yang stabil dan aman. Klik tombol di bawah untuk menyerap langsung sudut pitch, roll, dan kelembapan tanah saat ini sebagai <strong>titik acuan 0° aman</strong> ke EEPROM.
            </p>

            {/* Live Values Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="bg-white/80 dark:bg-[#1f1a36] p-2.5 rounded-xl border border-purple-100 dark:border-purple-900/40 text-center">
                <span className="text-[10px] text-slate-500 dark:text-purple-300 font-medium block">Pitch Sensor</span>
                <span className="text-sm font-mono font-bold text-purple-700 dark:text-purple-300">
                  {livePitch > 0 ? `+${livePitch.toFixed(2)}` : livePitch.toFixed(2)}°
                </span>
                <span className="text-[9px] text-slate-400 dark:text-purple-400/70 block mt-0.5">
                  Dev: {pitchDev.toFixed(2)}°
                </span>
              </div>

              <div className="bg-white/80 dark:bg-[#1f1a36] p-2.5 rounded-xl border border-purple-100 dark:border-purple-900/40 text-center">
                <span className="text-[10px] text-slate-500 dark:text-purple-300 font-medium block">Roll Sensor</span>
                <span className="text-sm font-mono font-bold text-purple-700 dark:text-purple-300">
                  {liveRoll > 0 ? `+${liveRoll.toFixed(2)}` : liveRoll.toFixed(2)}°
                </span>
                <span className="text-[9px] text-slate-400 dark:text-purple-400/70 block mt-0.5">
                  Dev: {rollDev.toFixed(2)}°
                </span>
              </div>

              <div className="bg-white/80 dark:bg-[#1f1a36] p-2.5 rounded-xl border border-purple-100 dark:border-purple-900/40 text-center">
                <span className="text-[10px] text-slate-500 dark:text-purple-300 font-medium block">Tanah Saat Ini</span>
                <span className="text-sm font-mono font-bold text-teal-600 dark:text-teal-400">
                  {liveSoil.toFixed(1)}%
                </span>
                <span className="text-[9px] text-slate-400 dark:text-teal-400/70 block mt-0.5">
                  Dev: {soilDev.toFixed(1)}%
                </span>
              </div>

              <div className="bg-white/80 dark:bg-[#1f1a36] p-2.5 rounded-xl border border-purple-100 dark:border-purple-900/40 text-center">
                <span className="text-[10px] text-slate-500 dark:text-purple-300 font-medium block">Tegangan Aki</span>
                <span className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400">
                  {(ews.sensorData?.batteryVoltage ?? 12.8).toFixed(2)} V
                </span>
                <span className="text-[9px] text-slate-400 dark:text-amber-400/70 block mt-0.5">
                  Getaran: {(ews.sensorData?.vibrationLevel ?? 0).toFixed(2)} g
                </span>
              </div>
            </div>

            {/* Quick Calibration Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={captureCurrentAsSafeBaseline}
                className="flex-1 px-4 py-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/50 dark:hover:bg-purple-900/80 text-purple-900 dark:text-purple-200 text-xs font-bold flex items-center justify-center gap-2 border border-purple-300 dark:border-purple-700 transition-all cursor-pointer shadow-xs active:scale-[0.99]"
              >
                <Target className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>🎯 Ambil Nilai Sensor Sebagai Titik Aman</span>
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={handleInstantCalibrateAndSave}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 active:scale-[0.99]"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan ke EEPROM...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>⚡ Kalibrasi Aman &amp; Simpan ke EEPROM</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 1: INCLINOMETER MPU-6050 (TITIK AMAN, TOLERANSI & AMBANG SUDUT)     */}
          {/* ========================================================================= */}
          <div className="p-4 rounded-xl border border-slate-200/80 dark:border-purple-900/30 bg-slate-50 dark:bg-[#1a162b] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide">
                <Compass className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>1. Inclinometer Dua Sumbu MPU-6050 (Pitch &amp; Roll)</span>
              </div>
              <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono">
                Formula: |θ - Titik Aman| &ge; Ambang
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Titik Aman Pitch (°)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={thresholds.safeTiltPitch}
                    onChange={(e) => handleChange('safeTiltPitch', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-purple-700 dark:text-purple-300 focus:ring-1 focus:ring-purple-600 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">°</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Posisi 0° saat tiang tegak</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Titik Aman Roll (°)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={thresholds.safeTiltRoll}
                    onChange={(e) => handleChange('safeTiltRoll', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-purple-700 dark:text-purple-300 focus:ring-1 focus:ring-purple-600 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">°</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Posisi 0° lateral</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Toleransi Sudut (±°)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="10"
                    value={thresholds.tiltTolerance}
                    onChange={(e) => handleChange('tiltTolerance', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-purple-700 dark:text-purple-300 focus:ring-1 focus:ring-purple-600 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">±°</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Batas wajar (cth: ±2.0°)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200/60 dark:border-purple-900/20">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Simpangan Sudut Siaga (°)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="45"
                    value={thresholds.tiltWarning}
                    onChange={(e) => handleChange('tiltWarning', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-amber-600 dark:text-amber-400 focus:ring-1 focus:ring-purple-600 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">°</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 1.50° simpangan</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Batas Bahaya Kemiringan (°)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="45"
                    value={thresholds.tiltDanger}
                    onChange={(e) => handleChange('tiltDanger', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-red-600 dark:text-red-400 focus:ring-1 focus:ring-red-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">°</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 3.00° (Memicu Sirine GPIO 46)</span>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 2: SENSOR CURAH HUJAN (RAIN RATE & KALIBRASI TIPPING BUCKET)       */}
          {/* ========================================================================= */}
          <div className="p-4 rounded-xl border border-slate-200/80 dark:border-purple-900/30 bg-slate-50 dark:bg-[#1a162b] space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide">
              <Droplets className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>2. Sensor Curah Hujan &amp; Kalibrasi Jungkitan (Tipping Bucket)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Hujan Siaga (mm / jam)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="200"
                    value={thresholds.rainWarning}
                    onChange={(e) => handleChange('rainWarning', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-teal-600 dark:text-teal-400 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">mm/h</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 20.0 mm/jam</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Hujan Bahaya (mm / jam)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="300"
                    value={thresholds.rainDanger}
                    onChange={(e) => handleChange('rainDanger', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-red-600 dark:text-red-400 focus:ring-1 focus:ring-red-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">mm/h</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 50.0 mm/jam (Ekstrem)</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Kalibrasi Tip (mm / tip)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="2.0"
                    value={thresholds.rainCalibPerTip}
                    onChange={(e) => handleChange('rainCalibPerTip', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-teal-700 dark:text-teal-300 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">mm</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default corong: 0.70 mm/tip</span>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 3: SENSOR KELEMBAPAN TANAH & KALIBRASI ADC (KTANAH)                */}
          {/* ========================================================================= */}
          <div className="p-4 rounded-xl border border-slate-200/80 dark:border-purple-900/30 bg-slate-50 dark:bg-[#1a162b] space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide">
              <Droplets className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>3. Kelembapan Tanah &amp; Kalibrasi Rentang ADC (Ktanah GPIO 17)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Baseline Aman Tanah (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={thresholds.safeSoilMoisture}
                    onChange={(e) => handleChange('safeSoilMoisture', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-indigo-700 dark:text-indigo-300 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">%</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Titik aman normal (50%)</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Toleransi Tanah (±%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="50"
                    value={thresholds.soilMoistureTolerance}
                    onChange={(e) => handleChange('soilMoistureTolerance', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-indigo-700 dark:text-indigo-300 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">±%</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Toleransi (±15%)</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ambang Jenuh Siaga (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="10"
                    max="100"
                    value={thresholds.soilMoistureWarning}
                    onChange={(e) => handleChange('soilMoistureWarning', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-amber-600 dark:text-amber-400 focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">%</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Batas jenuh air (75%)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200/60 dark:border-purple-900/20">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  ADC Saat Kering Kerontang (0%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="10"
                    min="1000"
                    max="4095"
                    value={thresholds.soilAdcDry}
                    onChange={(e) => handleChange('soilAdcDry', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-purple-600 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">ADC</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default udara/kering: 3300</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  ADC Saat Basah Jenuh Air (100%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="10"
                    min="100"
                    max="3500"
                    value={thresholds.soilAdcWet}
                    onChange={(e) => handleChange('soilAdcWet', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-purple-600 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">ADC</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default air jenuh: 1200</span>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 4: SENSOR GETARAN DIGITAL & PROTEKSI BATERAI AKI                   */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Sensor Getaran Digital 801S */}
            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-purple-900/30 bg-slate-50 dark:bg-[#1a162b] space-y-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide">
                <Activity className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>4. Getaran Bahaya (801S GPIO 7)</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-purple-300/70">
                Batas frekuensi pulsa getaran atau magnitudo getaran lereng.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ambang Getaran Bahaya
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    max="100"
                    value={thresholds.vibrationDanger}
                    onChange={(e) => handleChange('vibrationDanger', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-purple-700 dark:text-purple-300 focus:ring-1 focus:ring-purple-600 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">g / Pulsa</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 0.25 g / 5 pulsa</span>
              </div>
            </div>

            {/* Proteksi Baterai Aki 12V */}
            <div className="p-4 rounded-xl border border-slate-200/80 dark:border-purple-900/30 bg-slate-50 dark:bg-[#1a162b] space-y-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide">
                <Battery className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>5. Proteksi Aki 12V (INA219/INA226)</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-purple-300/70">
                Batas cut-off tegangan aki lemah untuk proteksi sel baterai.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Batas Baterai Lemah (Volt)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="9.0"
                    max="15.0"
                    value={thresholds.batteryLowVoltage}
                    onChange={(e) => handleChange('batteryLowVoltage', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-amber-600 dark:text-amber-400 focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">V</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 11.8 V (Cut-off VRLA 12V)</span>
              </div>
            </div>
          </div>

          {/* Section 5: Konfigurasi Siklus & Timer Alarm Otomatis */}
          <div className="p-4 rounded-xl border border-red-200/80 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/20 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">
                  5. Siklus Otomatis &amp; Timer Alarm (Sirine)
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-purple-300/70">
                  Alarm tidak berbunyi tanpa henti. Atur durasi aktif sirine dan jeda istirahat jika anomali masih berlanjut.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Alarm Duration */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Durasi Alarm Aktif (Detik / S)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="5"
                    max="86400"
                    value={thresholds.alarmDuration ?? 60}
                    onChange={(e) => handleChange('alarmDuration', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-red-600 dark:text-red-400 focus:ring-1 focus:ring-red-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">Detik (s)</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Lama waktu sirine berbunyi saat anomali terdeteksi (misal: 60s atau 5000s)
                </span>
              </div>

              {/* Alarm Pause */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Jeda / Snooze Alarm (Detik / S)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="5"
                    max="86400"
                    value={thresholds.alarmPause ?? 30}
                    onChange={(e) => handleChange('alarmPause', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#141122] border border-slate-300 dark:border-purple-900/50 text-xs font-mono font-bold text-amber-600 dark:text-amber-400 focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">Detik (s)</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Waktu mati sebelum sirine menyala lagi jika anomali masih terdeteksi (misal: 30s atau 1000s)
                </span>
              </div>
            </div>
          </div>

          {/* Hardware & EEPROM Info Ribbon */}
          <div className="p-3 rounded-xl bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 text-xs flex flex-wrap items-center justify-between gap-2 text-purple-900 dark:text-purple-200">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-purple-700 dark:text-purple-400 shrink-0" />
              <span>
                Penyimpanan: <strong>ESP32 Flash NVS (EEPROM Namespace: ews_thresh)</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-purple-700 dark:text-purple-300">
              <Cpu className="w-3.5 h-3.5" />
              <span>ESP32-S3 Auto-Sync &amp; REST DB</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 dark:border-purple-900/30">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-purple-300/70 dark:hover:text-white flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-purple-950/60 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Standar Pabrik</span>
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-purple-300/70 hover:bg-purple-50 dark:hover:bg-purple-950/60 transition-colors cursor-pointer"
              >
                Batal
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 active:scale-[0.98]"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan ke EEPROM &amp; Server...</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-4 h-4" />
                    <span>💾 Simpan Kalibrasi ke EEPROM</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
