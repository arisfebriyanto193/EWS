import React, { useState } from 'react';
import { PestTrapNode } from '../types';
import {
  Bug,
  Sun,
  Battery,
  Wind,
  Zap,
  Lightbulb,
  CheckCircle,
  AlertTriangle,
  RotateCw,
  Clock,
  Sliders,
  Filter,
} from 'lucide-react';

interface PestTrapDashboardProps {
  traps: PestTrapNode[];
  onUpdateTrap: (updated: PestTrapNode) => void;
}

export const PestTrapDashboard: React.FC<PestTrapDashboardProps> = ({
  traps,
  onUpdateTrap,
}) => {
  const [selectedTrapId, setSelectedTrapId] = useState<string>(traps[0].id);

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

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950/40 to-slate-900 border border-purple-900/50 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800">
                Bagian 2 Spesifikasi Teknis
              </span>
              <h2 className="text-xl font-bold text-white">
                5 Unit Perangkap Hama Bertenaga Surya
              </h2>
            </div>
            <p className="text-xs text-slate-300">
              LED UV 395-405 nm (~5W), Centrifugal Blower 12V (15-25W), Sensor PIR HC-SR501, Sensor Fotoelektrik E3F-DS30C4, dan Panel Surya 30Wp.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800 text-center">
              <span className="text-slate-400 block text-[10px]">TOTAL HAMA TERTANGKAP</span>
              <span className="text-lg font-bold text-purple-400">{totalCatches} Ekor</span>
            </div>
            <div className="bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800 text-center">
              <span className="text-slate-400 block text-[10px]">LAMPU UV AKTIF</span>
              <span className="text-lg font-bold text-emerald-400">{activeCount} / 5 Unit</span>
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
              className={`px-4 py-2.5 rounded-xl border text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${
                isSelected
                  ? 'bg-purple-900/60 border-purple-500 text-white shadow-lg shadow-purple-950/50'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <Bug className="w-3.5 h-3.5 text-purple-400" />
              <span>{t.id}</span>
              <span className={`w-2 h-2 rounded-full ${t.uvLedStatus ? 'bg-purple-400 animate-pulse' : 'bg-slate-600'}`} />
            </button>
          );
        })}
      </div>

      {/* Selected Trap Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Status & Controls */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                  {activeTrap.id}
                </span>
                <h3 className="text-base font-bold text-white">{activeTrap.name}</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">{activeTrap.location}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                activeTrap.containerCapacityPercent > 80
                  ? 'bg-red-950 text-red-300 border-red-700'
                  : 'bg-purple-950 text-purple-300 border-purple-700'
              }`}>
                {activeTrap.containerCapacityPercent > 80 ? 'WADAH HAMPIR PENUH' : 'OPERASI NORMAL'}
              </span>
            </div>
          </div>

          {/* Trap Actuators and Sensors Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Actuator 1: LED UV 395-405nm */}
            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                  activeTrap.uvLedStatus
                    ? 'bg-purple-900/60 border-purple-500 text-purple-300 shadow-md shadow-purple-600/30'
                    : 'bg-slate-800 border-slate-700 text-slate-500'
                }`}>
                  <Lightbulb className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Lampu Penarik UV</h4>
                  <p className="text-[11px] text-slate-400">LED 395-405 nm ~5W 12V</p>
                </div>
              </div>

              <button
                onClick={() => handleToggleUV(activeTrap)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTrap.uvLedStatus
                    ? 'bg-purple-600 text-white hover:bg-purple-500'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {activeTrap.uvLedStatus ? 'AKTIF' : 'MATI'}
              </button>
            </div>

            {/* Actuator 2: Centrifugal Blower 12V */}
            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                  activeTrap.blowerStatus
                    ? 'bg-cyan-900/60 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-600/30'
                    : 'bg-slate-800 border-slate-700 text-slate-500'
                }`}>
                  <Wind className={`w-5 h-5 ${activeTrap.blowerStatus ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Centrifugal Blower</h4>
                  <p className="text-[11px] text-slate-400">12V 15-25W & Driver MOSFET</p>
                </div>
              </div>

              <button
                onClick={() => handleToggleBlower(activeTrap)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTrap.blowerStatus
                    ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {activeTrap.blowerStatus ? 'AKTIF' : 'MATI'}
              </button>
            </div>

            {/* Sensor 1: Sensor Fotoelektrik E3F-DS30C4 */}
            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">
                Sensor Fotoelektrik E3F-DS30C4
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-bold font-mono text-purple-300">
                  {activeTrap.photoelectricCount}
                </span>
                <span className="text-xs text-slate-400">Hama Terhisap Corong</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">NPN NO, Catu 6-36V, Sensitivitas teratur</p>
            </div>

            {/* Sensor 2: Sensor PIR HC-SR501 */}
            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">
                Sensor Gerak PIR HC-SR501
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-bold font-mono text-emerald-400">
                  {activeTrap.pirTriggerCount}
                </span>
                <span className="text-xs text-slate-400">Pemicu Aliran Udara</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Blower bekerja periodik hemat daya</p>
            </div>
          </div>

          {/* Mode Operasi Selector */}
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-300 block mb-2">
              Mode Operasi Mikrokontroler ESP32:
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(['otomatis_malam', 'hemat_energi', 'manual'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleModeChange(activeTrap, mode)}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-colors cursor-pointer ${
                    activeTrap.mode === mode
                      ? 'bg-purple-950 border-purple-500 text-purple-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-bold text-white pb-3 border-b border-slate-800 flex items-center justify-between">
              <span>Wadah Penampungan Kasa</span>
              <span className="text-xs font-mono text-purple-400 font-bold">
                {activeTrap.containerCapacityPercent}% Penuh
              </span>
            </h4>

            {/* Container visualization */}
            <div className="my-4">
              <div className="w-full bg-slate-950 h-5 rounded-full p-1 border border-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    activeTrap.containerCapacityPercent > 80 ? 'bg-red-500' : 'bg-purple-500'
                  }`}
                  style={{ width: `${activeTrap.containerCapacityPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Dapat dilepas untuk pembersihan tanpa membuka box elektronik IP65 (Halaman 8 Dokumen Teknis).
              </p>
            </div>

            <button
              onClick={() => handleEmptyContainer(activeTrap)}
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium transition-colors border border-slate-700 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <RotateCw className="w-3.5 h-3.5 text-purple-400" />
              <span>Kosongkan Wadah & Reset Hitungan</span>
            </button>

            {/* Power Subsystem */}
            <div className="mt-6 pt-5 border-t border-slate-800 space-y-3">
              <span className="text-xs font-semibold text-slate-300 block">
                Sistem Daya Mandiri Surya 30Wp:
              </span>

              <div className="flex items-center justify-between text-xs p-2.5 bg-slate-950/70 rounded-xl border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Battery className="w-3.5 h-3.5 text-amber-400" />
                  Baterai VRLA 12V 12Ah:
                </span>
                <span className="font-mono text-amber-300 font-bold">{activeTrap.batteryVoltage} V</span>
              </div>

              <div className="flex items-center justify-between text-xs p-2.5 bg-slate-950/70 rounded-xl border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-emerald-400" />
                  Arus Pengisian Solar 30Wp:
                </span>
                <span className="font-mono text-emerald-400 font-bold">{activeTrap.solarChargingCurrent} mA</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 text-center pt-3 border-t border-slate-800">
            Komponen Cetak 3D ASA/PETG Dinding &ge; 3mm & Tudung Hujan
          </div>
        </div>

      </div>
    </div>
  );
};
