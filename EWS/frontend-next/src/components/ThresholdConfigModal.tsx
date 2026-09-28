'use client';
import React, { useState, useEffect } from 'react';
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
  Loader2,
  Radio,
  Sliders,
  X,
} from 'lucide-react';

interface ThresholdConfigModalProps {
  ews: EWSNode;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedThresholds: EWSNode['thresholds']) => void;
}

export const ThresholdConfigModal: React.FC<ThresholdConfigModalProps> = ({
  ews,
  isOpen,
  onClose,
  onSave,
}) => {
  const [thresholds, setThresholds] = useState<EWSNode['thresholds']>({
    ...ews.thresholds,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && ews?.thresholds) {
      setThresholds({ ...ews.thresholds });
      setSaveError(null);
      setSaveSuccess(false);
      setIsSaving(false);
    }
  }, [isOpen, ews.id, ews.thresholds]);

  if (!isOpen) return null;

  const handleChange = (key: keyof EWSNode['thresholds'], val: string) => {
    const num = parseFloat(val);
    setThresholds((prev) => ({
      ...prev,
      [key]: isNaN(num) ? 0 : num,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // 1. Simpan ke Backend MySQL melalui REST API
      await api.updateEwsThresholds(ews.id, thresholds);

      // 2. Siarkan langsung via WebSocket ke topik ews/{ewsId}/command
      // ESP32 akan menangkap command SET_THRESHOLDS dan menyimpannya permanen ke EEPROM
      wsClient.publish(`ews/${ews.id}/command`, {
        command: 'SET_THRESHOLDS',
        thresholds: thresholds,
        timestamp: new Date().toISOString(),
      });

      setIsSaving(false);
      setSaveSuccess(true);
      onSave(thresholds);

      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setIsSaving(false);
      setSaveError(err.message || 'Gagal menyimpan dan mengirim ambang batas ke perangkat');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center justify-center shadow-xs">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Atur Ambang Batas Sensor (Thresholds)</span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono font-bold">
                  {ews.id}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Nilai akan disiarkan ke ESP32 via WebSocket dan disimpan permanen di <strong>EEPROM</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Alert Banner */}
          {saveSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <strong>Berhasil!</strong> Ambang batas sensor berhasil disiarkan ke topik{' '}
                <code className="font-mono bg-emerald-100 dark:bg-emerald-900 px-1 py-0.5 rounded">
                  ews/{ews.id}/command
                </code>{' '}
                dan disimpan ke EEPROM ESP32.
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

          {/* Section 1: Inclinometer MPU-6050 (Kemiringan Lereng) */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide">
              <Compass className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>1. Inclinometer Dua Sumbu MPU-6050 (Pitch &amp; Roll)</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Menentukan batas pergeseran sudut kemiringan tanah lereng dalam satuan derajat (°).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ambang Siaga (° Derajat)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="45"
                    value={thresholds.tiltWarning}
                    onChange={(e) => handleChange('tiltWarning', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-amber-600 dark:text-amber-400 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">°</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 1.50°</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ambang Bahaya / Kritis (° Derajat)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="45"
                    value={thresholds.tiltDanger}
                    onChange={(e) => handleChange('tiltDanger', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-red-600 dark:text-red-400 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">°</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 3.00° (Memicu Sirine)</span>
              </div>
            </div>
          </div>

          {/* Section 2: Sensor Hujan (Rain Rate) */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide">
              <Droplets className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>2. Sensor Curah Hujan (Rainfall Rate)</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Batas intensitas curah hujan per jam untuk deteksi dini bahaya banjir bandang dan erosi tebing.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
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
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-teal-600 dark:text-teal-400 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">mm/h</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 20.0 mm/jam (Hujan Lebat)</span>
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
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-red-600 dark:text-red-400 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">mm/h</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 50.0 mm/jam (Hujan Ekstrem)</span>
              </div>
            </div>
          </div>

          {/* Section 3: Sensor Kelembapan Tanah & Sensor Getaran Digital */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Kelembapan Tanah */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 space-y-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide">
                <Droplets className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>3. Kelembapan Tanah (Ktanah)</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Tingkat kejenuhan air tanah sebelum pori lereng longsor.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ambang Jenuh Air (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="10"
                    max="100"
                    value={thresholds.soilMoistureWarning}
                    onChange={(e) => handleChange('soilMoistureWarning', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">%</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 75%</span>
              </div>
            </div>

            {/* Sensor Getaran Digital 801S */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 space-y-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide">
                <Activity className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>4. Sensor Getaran Digital (801S)</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Sensitivitas pemicu getaran digital / batas pulsa getaran per detik (GPIO 7).
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ambang Getaran Bahaya (Pulsa / Nilai)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="100"
                    value={thresholds.vibrationDanger}
                    onChange={(e) => handleChange('vibrationDanger', e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-purple-600 dark:text-purple-400 focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">Trig</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Default: 5 pulsa/detik (atau 0.25)</span>
              </div>
            </div>
          </div>

          {/* Section 4: Batas Tegangan Baterai Lemah */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs uppercase tracking-wide">
              <Battery className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>5. Proteksi Baterai VRLA Aki 12V (INA226)</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Batas cut-off tegangan aki untuk memicu status peringatan baterai lemah ke dashboard dan bot Telegram.
            </p>

            <div className="max-w-xs">
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
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-amber-600 dark:text-amber-400 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">V</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Default: 11.8 V (Cut-off VRLA 12V)</span>
            </div>
          </div>

          {/* Hardware & EEPROM Info Ribbon */}
          <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs flex items-center justify-between text-blue-900 dark:text-blue-300">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>
                Penyimpanan: <strong>ESP32 NVS Flash (EEPROM Namespace: ews_thresh)</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-blue-600 dark:text-blue-400">
              <Cpu className="w-3.5 h-3.5" />
              <span>ESP32-S3 Auto-Sync</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Batal
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyiarkan ke ESP32...</span>
                </>
              ) : (
                <>
                  <Radio className="w-4 h-4" />
                  <span>Simpan &amp; Kirim ke ESP32 (EEPROM)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
