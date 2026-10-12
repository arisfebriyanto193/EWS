'use client';
import React, { useState } from 'react';
import { PestTrapNode, ColorPresetItem } from '../types';
import {
  Battery,
  Bug,
  Lightbulb,
  RotateCw,
  Sun,
  Wind,
  Plus,
  Trash2,
  Clock,
  Palette,
  Sliders,
  Check,
  X,
  Gauge,
  Calendar,
  Layers,
} from 'lucide-react';

interface PestTrapDashboardProps {
  traps: PestTrapNode[];
  onUpdateTrap: (updated: PestTrapNode) => void;
  onAddTrap?: (newTrap: Partial<PestTrapNode>) => Promise<any>;
  onDeleteTrap?: (id: string) => Promise<any>;
}

const DEFAULT_PRESETS: ColorPresetItem[] = [
  { id: 0, name: 'UV Lampu Hama (Default)', r: 100, g: 0, b: 255 },
  { id: 1, name: 'Hijau Daun Serangga', r: 0, g: 255, b: 30 },
  { id: 2, name: 'Kuning / Amber', r: 255, g: 190, b: 0 },
  { id: 3, name: 'Putih Terang Daya Penuh', r: 255, g: 255, b: 255 },
  { id: 4, name: 'Biru Tua Fototaksis', r: 0, g: 40, b: 255 },
  { id: 5, name: 'Merah Pengalih Perhatian', r: 255, g: 0, b: 0 },
];

export const PestTrapDashboard: React.FC<PestTrapDashboardProps> = ({
  traps,
  onUpdateTrap,
  onAddTrap,
  onDeleteTrap,
}) => {
  const [selectedTrapId, setSelectedTrapId] = useState<string>(traps[0]?.id || 'TRAP-01');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTrapId, setNewTrapId] = useState('');
  const [newTrapName, setNewTrapName] = useState('');
  const [newTrapLocation, setNewTrapLocation] = useState('');

  // Editing preset state
  const [editingPresetIdx, setEditingPresetIdx] = useState<number | null>(null);
  const [customR, setCustomR] = useState(100);
  const [customG, setCustomG] = useState(0);
  const [customB, setCustomB] = useState(255);
  const [customName, setCustomName] = useState('');

  const activeTrap = traps.find((t) => t.id === selectedTrapId) || traps[0];

  const presets: ColorPresetItem[] = activeTrap?.presets && activeTrap.presets.length > 0
    ? activeTrap.presets
    : DEFAULT_PRESETS;

  const currentPresetIdx = activeTrap?.activePreset !== undefined ? activeTrap.activePreset : 0;
  const currentActivePreset = presets[currentPresetIdx] || presets[0] || DEFAULT_PRESETS[0];

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

  const handlePresetSelect = (trap: PestTrapNode, presetId: number) => {
    onUpdateTrap({
      ...trap,
      activePreset: presetId,
    });
  };

  const handleScheduleChange = (trap: PestTrapNode, field: 'startTime' | 'endTime', value: string) => {
    onUpdateTrap({
      ...trap,
      [field]: value,
    });
  };

  const handleIntervalChange = (trap: PestTrapNode, interval: number) => {
    onUpdateTrap({
      ...trap,
      ledRotationInterval: Math.max(1, interval),
    });
  };

  const openEditPresetModal = (idx: number) => {
    const p = presets[idx];
    if (!p) return;
    setEditingPresetIdx(idx);
    setCustomName(p.name);
    setCustomR(p.r);
    setCustomG(p.g);
    setCustomB(p.b);
  };

  const handleSavePreset = (trap: PestTrapNode) => {
    if (editingPresetIdx === null) return;
    const updatedPresets = [...presets];
    updatedPresets[editingPresetIdx] = {
      ...updatedPresets[editingPresetIdx],
      name: customName || `Preset ${editingPresetIdx + 1}`,
      r: customR,
      g: customG,
      b: customB,
    };

    onUpdateTrap({
      ...trap,
      presets: updatedPresets,
    });
    setEditingPresetIdx(null);
  };

  const handleCreateTrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrapId.trim() || !newTrapName.trim()) {
      alert('Harap isi ID dan Nama Perangkat');
      return;
    }

    if (onAddTrap) {
      try {
        await onAddTrap({
          id: newTrapId.trim().toUpperCase(),
          name: newTrapName.trim(),
          location: newTrapLocation.trim() || 'Kebun Pertanian',
          mode: 'otomatis',
          startTime: '18:00',
          endTime: '06:00',
          activePreset: 0,
          ledRotationInterval: 15,
          presets: DEFAULT_PRESETS,
        });
        setSelectedTrapId(newTrapId.trim().toUpperCase());
        setIsAddModalOpen(false);
        setNewTrapId('');
        setNewTrapName('');
        setNewTrapLocation('');
      } catch (err: any) {
        // error already handled
      }
    }
  };

  const handleDeleteActiveTrap = async () => {
    if (!activeTrap) return;
    if (confirm(`Yakin ingin menghapus perangkat ${activeTrap.id} (${activeTrap.name})?`)) {
      if (onDeleteTrap) {
        await onDeleteTrap(activeTrap.id);
        const remaining = traps.filter((t) => t.id !== activeTrap.id);
        if (remaining.length > 0) {
          setSelectedTrapId(remaining[0].id);
        }
      }
    }
  };

  const totalCatches = traps.reduce((acc, t) => acc + (t.photoelectricCount || 0), 0);
  const activeCount = traps.filter((t) => t.uvLedStatus).length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Sistem IoT Cerdas
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Perangkap Hama &amp; Pemikat Lampu Spektrum Terjadwal
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pengendalian lampu multi-spektrum, penjadwalan otomatis RTC, sensor jarak wadah VL53L0X ToF, pemantau daya INA226, dan kendali blower hisap.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="bg-slate-50 dark:bg-slate-950 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px]">TOTAL HAMA TERPERANGKAP</span>
              <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">{totalCatches} Ekor</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px]">UNIT LAMPU AKTIF</span>
              <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{activeCount} / {traps.length} Unit</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trap selector tabs + Add Button */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
                <span
                  className="w-2.5 h-2.5 rounded-full border border-black/20"
                  style={{
                    backgroundColor: t.uvLedStatus
                      ? (t.presets && t.presets[t.activePreset || 0]
                          ? `rgb(${t.presets[t.activePreset || 0].r}, ${t.presets[t.activePreset || 0].g}, ${t.presets[t.activePreset || 0].b})`
                          : '#10b981')
                      : '#94a3b8',
                  }}
                />
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Tambah Perangkat Baru</span>
        </button>
      </div>

      {activeTrap && (
        <>
          {/* Trap Header & Location Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                  {activeTrap.id}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{activeTrap.name}</h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    activeTrap.containerCapacityPercent > 80
                      ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900'
                  }`}
                >
                  {activeTrap.containerCapacityPercent > 80 ? 'Wadah Penuh' : 'Operasi Normal'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Lokasi: {activeTrap.location} {activeTrap.lastSeenAt ? `• Terakhir online: ${new Date(activeTrap.lastSeenAt).toLocaleTimeString()}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteActiveTrap}
                className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Node</span>
              </button>
            </div>
          </div>

          {/* Mode Operasi Selector */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Pilih Mode Kerja Sistem</h4>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Mode Aktif: <strong className="text-blue-600 dark:text-blue-400 uppercase">{activeTrap.mode}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Mode 1: Manual */}
              <button
                onClick={() => handleModeChange(activeTrap, 'manual')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  activeTrap.mode === 'manual'
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/20'
                    : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">1. Mode Manual</span>
                  {activeTrap.mode === 'manual' && <Check className="w-4 h-4 text-blue-600" />}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Kendali langsung manual dari saklar/tombol fisik dan web dashboard tanpa mengikuti jadwal otomatis.
                </p>
              </button>

              {/* Mode 2: Otomatis */}
              <button
                onClick={() => handleModeChange(activeTrap, 'otomatis')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  activeTrap.mode === 'otomatis'
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/20'
                    : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">2. Mode Otomatis (Jadwal + Preset)</span>
                  {activeTrap.mode === 'otomatis' && <Check className="w-4 h-4 text-blue-600" />}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Lampu &amp; blower aktif otomatis sesuai rentang jam RTC dengan 1 warna preset yang telah ditentukan.
                </p>
              </button>

              {/* Mode 3: Otomatis-LED (Rotasi) */}
              <button
                onClick={() => handleModeChange(activeTrap, 'otomatis_led')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  activeTrap.mode === 'otomatis_led'
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/20'
                    : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">3. Mode Otomatis-LED (Rotasi)</span>
                  {activeTrap.mode === 'otomatis_led' && <Check className="w-4 h-4 text-blue-600" />}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Aktif sesuai jadwal, dan warna lampu berganti otomatis bergiliran setiap interval menit yang ditentukan.
                </p>
              </button>
            </div>
          </div>

          {/* Schedule & LED Rotation Interval Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Konfigurasi Jadwal &amp; Rotasi Warna</h4>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Sinkron dengan Modul RTC DS3231</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Jam Mulai */}
              <div className="bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  Jam Mulai Aktif
                </label>
                <input
                  type="time"
                  value={activeTrap.startTime || '18:00'}
                  onChange={(e) => handleScheduleChange(activeTrap, 'startTime', e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Waktu perangkap mulai menyala (Sore/Malam)</span>
              </div>

              {/* Jam Selesai */}
              <div className="bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-600" />
                  Jam Selesai Aktif
                </label>
                <input
                  type="time"
                  value={activeTrap.endTime || '06:00'}
                  onChange={(e) => handleScheduleChange(activeTrap, 'endTime', e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Waktu perangkap otomatis mati (Pagi hari)</span>
              </div>

              {/* Interval Rotasi Warna LED */}
              <div className="bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-purple-600" />
                  Interval Rotasi Warna Lampu
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={activeTrap.ledRotationInterval || 15}
                    onChange={(e) => handleIntervalChange(activeTrap, parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">Menit</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Warna berganti tiap sekian menit (Mode Otomatis-LED)</span>
              </div>
            </div>
          </div>

          {/* Color Preset Palette Manager */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 gap-2">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Preset Spektrum Warna Lampu (RGB / UV)</h4>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Preset Aktif Saat Ini:</span>
                <span
                  className="px-2.5 py-1 rounded font-bold text-white shadow-xs"
                  style={{
                    backgroundColor: `rgb(${currentActivePreset.r}, ${currentActivePreset.g}, ${currentActivePreset.b})`,
                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                  }}
                >
                  {currentActivePreset.name} (R:{currentActivePreset.r} G:{currentActivePreset.g} B:{currentActivePreset.b})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {presets.map((preset, idx) => {
                const isCurrent = idx === currentPresetIdx;
                const bgColor = `rgb(${preset.r}, ${preset.g}, ${preset.b})`;

                return (
                  <div
                    key={preset.id ?? idx}
                    className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${
                      isCurrent
                        ? 'border-purple-500 bg-purple-50/40 dark:bg-purple-950/30 ring-2 ring-purple-500/20'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg border border-black/20 shadow-xs flex-shrink-0 flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: bgColor }}
                      >
                        {isCurrent && <Check className="w-5 h-5 drop-shadow" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {idx + 1}. {preset.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block">
                          RGB({preset.r}, {preset.g}, {preset.b})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800">
                      <button
                        onClick={() => handlePresetSelect(activeTrap, idx)}
                        className={`flex-1 py-1 px-2 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                          isCurrent
                            ? 'bg-purple-600 text-white'
                            : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {isCurrent ? 'Aktif' : 'Pilih Preset'}
                      </button>

                      <button
                        onClick={() => openEditPresetModal(idx)}
                        className="py-1 px-2.5 rounded text-[11px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                      >
                        Edit Warna
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actuators & Sensors Monitoring Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Actuators Control & Sensor Overview */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs space-y-6 transition-colors">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Kendali Aktuator &amp; Telemetri Sensor Real-Time</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Actuator 1: LED Lampu */}
                <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center border text-white"
                      style={{
                        backgroundColor: activeTrap.uvLedStatus
                          ? `rgb(${currentActivePreset.r}, ${currentActivePreset.g}, ${currentActivePreset.b})`
                          : '#64748b',
                      }}
                    >
                      <Lightbulb className="w-5 h-5 drop-shadow" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">Lampu Pemikat Spektrum</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {currentActivePreset.name}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleUV(activeTrap)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      activeTrap.uvLedStatus
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {activeTrap.uvLedStatus ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Actuator 2: Blower */}
                <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                        activeTrap.blowerStatus
                          ? 'bg-blue-100 dark:bg-blue-950/80 border-blue-300 dark:border-blue-800 text-blue-600 dark:text-blue-400'
                          : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400'
                      }`}
                    >
                      <Wind className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">Centrifugal Blower Hisap</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">12V 15-25W Driver MOSFET</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleBlower(activeTrap)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      activeTrap.blowerStatus
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {activeTrap.blowerStatus ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Sensor 1: Fotoelektrik */}
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
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Deteksi laser optik jatuhnya serangga</p>
                </div>

                {/* Sensor 2: PIR */}
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
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Deteksi keberadaan serangga di corong</p>
                </div>
              </div>
            </div>

            {/* Right Column: VL53L0X & INA226 Power System */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs space-y-6 flex flex-col justify-between transition-colors">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-emerald-600" />
                    Sensor Jarak Wadah VL53L0X
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                    {activeTrap.containerCapacityPercent}% Penuh
                  </span>
                </h4>

                {/* Container visualization */}
                <div className="my-4">
                  <div className="w-full bg-slate-100 dark:bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800">
                    <div
                      className={`h-full rounded-full transition-all ${
                        activeTrap.containerCapacityPercent > 80 ? 'bg-red-500' : 'bg-emerald-600'
                      }`}
                      style={{ width: `${Math.min(100, activeTrap.containerCapacityPercent)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-mono">
                    <span>Jarak Pembacaan Sensor:</span>
                    <strong>{activeTrap.currentDistance !== undefined ? `${activeTrap.currentDistance} mm` : 'ToF Auto'}</strong>
                  </div>
                </div>

                <button
                  onClick={() => handleEmptyContainer(activeTrap)}
                  className="w-full py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs text-slate-700 dark:text-slate-200 font-medium transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Kosongkan Wadah &amp; Reset Hitungan</span>
                </button>

                {/* Power Subsystem INA226 */}
                <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Modul Monitor Daya INA226 (I2C):
                  </span>

                  <div className="flex items-center justify-between text-xs p-2.5 bg-slate-50 dark:bg-slate-950/70 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                      <Battery className="w-3.5 h-3.5 text-amber-500" />
                      Tegangan Baterai VRLA:
                    </span>
                    <span className="font-mono text-slate-900 dark:text-white font-bold">{activeTrap.batteryVoltage} V</span>
                  </div>

                  <div className="flex items-center justify-between text-xs p-2.5 bg-slate-50 dark:bg-slate-950/70 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                      <Sun className="w-3.5 h-3.5 text-emerald-500" />
                      Arus Solar / Beban:
                    </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{activeTrap.solarChargingCurrent} mA</span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 text-center pt-3 border-t border-slate-200 dark:border-slate-800">
                Mode Deep-Sleep diaktifkan dengan penekanan tombol fisik ESP32.
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal: Tambah Perangkat Baru */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                Tambah Perangkat Perangkap Hama
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTrapSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  ID Perangkat (e.g. TRAP-06)
                </label>
                <input
                  type="text"
                  required
                  placeholder="TRAP-06"
                  value={newTrapId}
                  onChange={(e) => setNewTrapId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Nama Perangkat
                </label>
                <input
                  type="text"
                  required
                  placeholder="Perangkap Hama Blok F"
                  value={newTrapName}
                  onChange={(e) => setNewTrapName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Lokasi Pemasangan
                </label>
                <input
                  type="text"
                  placeholder="Blok Tanaman Hortikultura"
                  value={newTrapLocation}
                  onChange={(e) => setNewTrapLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                >
                  Simpan &amp; Daftarkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Custom RGB Preset Editor */}
      {editingPresetIdx !== null && activeTrap && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Palette className="w-5 h-5 text-purple-600" />
                Atur Warna Preset #{editingPresetIdx + 1}
              </h3>
              <button
                onClick={() => setEditingPresetIdx(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Nama Preset
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white"
                />
              </div>

              {/* Color Preview Swatch */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4 bg-slate-50 dark:bg-slate-950/60">
                <div
                  className="w-16 h-16 rounded-xl border border-black/20 shadow-md flex-shrink-0"
                  style={{ backgroundColor: `rgb(${customR}, ${customG}, ${customB})` }}
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">Preview Warna Lampu</span>
                  <span className="text-xs font-mono text-purple-600 dark:text-purple-400 font-bold">
                    RGB({customR}, {customG}, {customB})
                  </span>
                </div>
              </div>

              {/* Red Slider */}
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-red-600">Red (Merah)</span>
                  <span className="font-mono">{customR}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={customR}
                  onChange={(e) => setCustomR(parseInt(e.target.value, 10))}
                  className="w-full accent-red-600 cursor-pointer"
                />
              </div>

              {/* Green Slider */}
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-emerald-600">Green (Hijau)</span>
                  <span className="font-mono">{customG}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={customG}
                  onChange={(e) => setCustomG(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>

              {/* Blue Slider */}
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-blue-600">Blue (Biru)</span>
                  <span className="font-mono">{customB}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={customB}
                  onChange={(e) => setCustomB(parseInt(e.target.value, 10))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPresetIdx(null)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleSavePreset(activeTrap)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-xs"
                >
                  Terapkan Perubahan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
