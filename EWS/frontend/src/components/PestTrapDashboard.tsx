import React, { useState } from 'react';
import { PestTrapNode } from '../types';
import {
  Battery,
  Bug,
  Lightbulb,
  RotateCw,
  Sun,
  Wind,
} from 'lucide-react';

interface PestTrapDashboardProps {
  traps: PestTrapNode[];
  onUpdateTrap: (updated: PestTrapNode) => void;
}

export const PestTrapDashboard: React.FC<PestTrapDashboardProps> = ({
  traps,
  onUpdateTrap,
}) => {
  const [selectedTrapId, setSelectedTrapId] = useState<string>(traps[0]?.id || 'TRAP-01');

  const activeTrap = traps.find((t) => t.id === selectedTrapId) || traps[0];

  const handleToggleUV = (trap: PestTrapNode) => {
    onUpdateTrap({
      ...trap,
      uvLedStatus: !trap.uvLedStatus,
    });
  };

  const handleToggleBlower = (trap: PestTrapNode) => {
    onUpdateTrap({
      ...trap,
      blowerStatus: !trap.blowerStatus,
    });
  };

  const handleEmptyContainer = (trap: PestTrapNode) => {
    onUpdateTrap({
      ...trap,
      containerCapacityPercent: 0,
      photoelectricCount: 0,
      status: 'aktif',
    });
  };

  const handleModeChange = (trap: PestTrapNode, mode: PestTrapNode['mode']) => {
    onUpdateTrap({
      ...trap,
      mode,
    });
  };

  const totalCatches = traps.reduce((acc, t) => acc + t.photoelectricCount, 0);
  const activeCount = traps.filter((t) => t.uvLedStatus).length;

  if (!activeTrap) return null;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Bagian 2 Spesifikasi Teknis
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                5 Unit Perangkap Hama Bertenaga Surya
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              LED UV 395-405 nm (~5W), Centrifugal Blower 12V (15-25W), Sensor PIR HC-SR501, Sensor Fotoelektrik E3F-DS30C4, dan Panel Surya 30Wp.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="bg-slate-50 dark:bg-slate-950 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px]">TOTAL HAMA</span>
              <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">{totalCatches} Ekor</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px]">LAMPU UV AKTIF</span>
              <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{activeCount} / 5 Unit</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trap selector tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {traps.map((t) => {
          const isSelected = t.id === selectedTrapId;
          return (
            <button
              key={t.id}
              onClick={() => setSelectedTrapId(t.id)}
              className={`px-3.5 py-2 rounded-lg border text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Bug className="w-3.5 h-3.5" />
              <span>{t.id}</span>
              <span className={`w-2 h-2 rounded-full ${t.uvLedStatus ? 'bg-emerald-400' : 'bg-slate-400'}`} />
            </button>
          );
        })}
      </div>

      {/* Selected Trap Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Status & Controls */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs space-y-6 transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                  {activeTrap.id}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{activeTrap.name}</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{activeTrap.location}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                activeTrap.containerCapacityPercent > 80
                  ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900'
              }`}>
                {activeTrap.containerCapacityPercent > 80 ? 'Wadah Penuh' : 'Operasi Normal'}
              </span>
            </div>
          </div>

          {/* Trap Actuators and Sensors Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Actuator 1: LED UV 395-405nm */}
            <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
                  activeTrap.uvLedStatus
                    ? 'bg-indigo-100 dark:bg-indigo-950/80 border-indigo-300 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
                    : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400'
                }`}>
                  <Lightbulb className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Lampu Penarik UV</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">LED 395-405 nm ~5W 12V</p>
                </div>
              </div>

              <button
                onClick={() => handleToggleUV(activeTrap)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTrap.uvLedStatus
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {activeTrap.uvLedStatus ? 'AKTIF' : 'MATI'}
              </button>
            </div>

            {/* Actuator 2: Centrifugal Blower 12V */}
            <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
                  activeTrap.blowerStatus
                    ? 'bg-blue-100 dark:bg-blue-950/80 border-blue-300 dark:border-blue-800 text-blue-600 dark:text-blue-400'
                    : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400'
                }`}>
                  <Wind className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Centrifugal Blower</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">12V 15-25W Driver MOSFET</p>
                </div>
              </div>

              <button
                onClick={() => handleToggleBlower(activeTrap)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTrap.blowerStatus
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {activeTrap.blowerStatus ? 'AKTIF' : 'MATI'}
              </button>
            </div>

            {/* Sensor 1: Sensor Fotoelektrik E3F-DS30C4 */}
            <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">
                Sensor Fotoelektrik E3F-DS30C4
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                  {activeTrap.photoelectricCount}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Hama Terhisap</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">NPN NO, Catu 6-36V, Sensitivitas teratur</p>
            </div>

            {/* Sensor 2: Sensor PIR HC-SR501 */}
            <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">
                Sensor Gerak PIR HC-SR501
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                  {activeTrap.pirTriggerCount}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Pemicu Aliran Udara</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Blower bekerja periodik hemat daya</p>
            </div>
          </div>

          {/* Mode Operasi Selector */}
          <div className="bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
              Mode Operasi Mikrokontroler ESP32:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['otomatis_malam', 'hemat_energi', 'manual'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleModeChange(activeTrap, mode)}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-colors cursor-pointer ${
                    activeTrap.mode === mode
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {mode === 'otomatis_malam' && 'Otomatis Malam (RTC)'}
                  {mode === 'hemat_energi' && 'Mode Hemat Baterai'}
                  {mode === 'manual' && 'Manual Override'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Catch Container & Power System */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs space-y-6 flex flex-col justify-between transition-colors">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span>Wadah Penampungan Kasa</span>
              <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                {activeTrap.containerCapacityPercent}% Penuh
              </span>
            </h4>

            {/* Container visualization */}
            <div className="my-4">
              <div className="w-full bg-slate-100 dark:bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    activeTrap.containerCapacityPercent > 80 ? 'bg-red-500' : 'bg-blue-600'
                  }`}
                  style={{ width: `${activeTrap.containerCapacityPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                Dapat dilepas untuk pembersihan tanpa membuka box elektronik IP65 (Halaman 8 Dokumen Teknis).
              </p>
            </div>

            <button
              onClick={() => handleEmptyContainer(activeTrap)}
              className="w-full py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs text-slate-700 dark:text-slate-200 font-medium transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Kosongkan Wadah &amp; Reset Hitungan</span>
            </button>

            {/* Power Subsystem */}
            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Sistem Daya Mandiri Surya 30Wp:
              </span>

              <div className="flex items-center justify-between text-xs p-2.5 bg-slate-50 dark:bg-slate-950/70 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Battery className="w-3.5 h-3.5 text-amber-500" />
                  Baterai VRLA 12V 12Ah:
                </span>
                <span className="font-mono text-slate-900 dark:text-white font-bold">{activeTrap.batteryVoltage} V</span>
              </div>

              <div className="flex items-center justify-between text-xs p-2.5 bg-slate-50 dark:bg-slate-950/70 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-emerald-500" />
                  Arus Pengisian Solar 30Wp:
                </span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{activeTrap.solarChargingCurrent} mA</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 text-center pt-3 border-t border-slate-200 dark:border-slate-800">
            Komponen Cetak 3D ASA/PETG Dinding &ge; 3mm &amp; Tudung Hujan
          </div>
        </div>

      </div>
    </div>
  );
};
