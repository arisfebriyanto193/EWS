'use client';
import React, { useState, useEffect } from 'react';
import { PestTrapNode, ColorPresetItem } from '../types';
import { api } from '../services/api';
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
  Timer,
  Zap,
  Save,
  Undo2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface PestTrapDashboardProps {
  traps: PestTrapNode[];
  onUpdateTrap: (updated: PestTrapNode) => void;
  onAddTrap?: (newTrap: Partial<PestTrapNode>) => Promise<any>;
  onDeleteTrap?: (id: string) => Promise<any>;
  onRequestFastTelemetry?: (trapId: string) => Promise<any> | void;
}

const DEFAULT_PRESETS: ColorPresetItem[] = [
  { id: 0, name: 'UV Lampu Hama (Default)', r: 100, g: 0, b: 255 },
  { id: 1, name: 'Hijau Daun Serangga', r: 0, g: 255, b: 30 },
  { id: 2, name: 'Kuning / Amber', r: 255, g: 190, b: 0 },
  { id: 3, name: 'Putih Terang Daya Penuh', r: 255, g: 255, b: 255 },
  { id: 4, name: 'Biru Tua Fototaksis', r: 0, g: 40, b: 255 },
  { id: 5, name: 'Merah Pengalih Perhatian', r: 255, g: 0, b: 0 },
];

// ============ Battery Voltage Chart Component (SVG) ============
const BatteryChart: React.FC<{ trapId: string }> = ({ trapId }) => {
  const [data, setData] = useState<{ voltage: number; solarCurrent: number; timestamp: string }[]>([]);
  const [period, setPeriod] = useState<number>(24); // hours
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await api.getBatteryHistory(trapId, { hours: period });
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [trapId, period]);

  const W = 700;
  const H = 200;
  const PAD = { top: 20, right: 20, bottom: 35, left: 45 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const voltages = data.map((d) => d.voltage);
  const minV = voltages.length > 0 ? Math.floor(Math.min(...voltages) * 10) / 10 - 0.2 : 10;
  const maxV = voltages.length > 0 ? Math.ceil(Math.max(...voltages) * 10) / 10 + 0.2 : 14;
  const rangeV = maxV - minV || 1;

  const points = data.map((d, i) => {
    const x = PAD.left + (i / Math.max(data.length - 1, 1)) * chartW;
    const y = PAD.top + chartH - ((d.voltage - minV) / rangeV) * chartH;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = linePath + ` L ${(PAD.left + chartW).toFixed(1)} ${(PAD.top + chartH).toFixed(1)} L ${PAD.left.toFixed(1)} ${(PAD.top + chartH).toFixed(1)} Z`;

  // Y axis labels
  const ySteps = 5;
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => {
    const val = minV + (rangeV / ySteps) * i;
    return { val: val.toFixed(1), y: PAD.top + chartH - (i / ySteps) * chartH };
  });

  // X axis: show ~6 time labels
  const xLabelCount = Math.min(6, data.length);
  const xLabels = data.length > 0
    ? Array.from({ length: xLabelCount }, (_, i) => {
        const idx = Math.round((i / (xLabelCount - 1)) * (data.length - 1));
        const d = data[idx];
        const date = new Date(d.timestamp);
        return {
          label: date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          x: PAD.left + (idx / Math.max(data.length - 1, 1)) * chartW,
        };
      })
    : [];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Battery className="w-4 h-4 text-amber-500" />
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Grafik Tegangan Baterai</h4>
        </div>
        <div className="flex items-center gap-1.5">
          {[6, 12, 24, 48, 168].map((h) => (
            <button
              key={h}
              onClick={() => setPeriod(h)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                period === h
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {h < 24 ? `${h}j` : h === 24 ? '1h' : h === 48 ? '2h' : '7h'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[200px] text-xs text-slate-400">Memuat data...</div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center h-[200px] text-xs text-slate-400">
          Belum ada data baterai untuk periode ini
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[500px]" preserveAspectRatio="xMidYMid meet">
            {/* Grid lines */}
            {yLabels.map((yl, i) => (
              <g key={i}>
                <line x1={PAD.left} y1={yl.y} x2={PAD.left + chartW} y2={yl.y} stroke="currentColor" strokeOpacity={0.08} strokeDasharray="4 2" />
                <text x={PAD.left - 6} y={yl.y + 3} textAnchor="end" className="fill-slate-400 dark:fill-slate-500" fontSize="9" fontFamily="monospace">
                  {yl.val}V
                </text>
              </g>
            ))}

            {/* X axis labels */}
            {xLabels.map((xl, i) => (
              <text key={i} x={xl.x} y={H - 6} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500" fontSize="9" fontFamily="monospace">
                {xl.label}
              </text>
            ))}

            {/* Area fill */}
            {points.length > 1 && (
              <path d={areaPath} fill="url(#battGrad)" opacity={0.3} />
            )}

            {/* Line */}
            {points.length > 1 && (
              <path d={linePath} fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            )}

            {/* Dots (show only ~20 to avoid clutter) */}
            {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 20)) === 0 || i === points.length - 1).map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#f59e0b" stroke="white" strokeWidth={1} />
            ))}

            {/* Gradient definition */}
            <defs>
              <linearGradient id="battGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
          </svg>
        </div>
      )}

      {data.length > 0 && (
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
          <span>{data.length} titik data dalam {period < 24 ? `${period} jam` : `${period / 24} hari`} terakhir</span>
          <span>
            Min: <strong className="text-slate-700 dark:text-slate-300">{Math.min(...voltages).toFixed(2)}V</strong>
            {' • '}Max: <strong className="text-slate-700 dark:text-slate-300">{Math.max(...voltages).toFixed(2)}V</strong>
            {' • '}Rata-rata: <strong className="text-slate-700 dark:text-slate-300">{(voltages.reduce((a, b) => a + b, 0) / voltages.length).toFixed(2)}V</strong>
          </span>
        </div>
      )}
    </div>
  );
};

export const PestTrapDashboard: React.FC<PestTrapDashboardProps> = ({
  traps,
  onUpdateTrap,
  onAddTrap,
  onDeleteTrap,
  onRequestFastTelemetry,
}) => {
  const [selectedTrapId, setSelectedTrapId] = useState<string>(traps[0]?.id || 'TRAP-01');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTrapId, setNewTrapId] = useState('');
  const [newTrapName, setNewTrapName] = useState('');
  const [newTrapLocation, setNewTrapLocation] = useState('');

  // Editing preset state (modal)
  const [editingPresetIdx, setEditingPresetIdx] = useState<number | null>(null);
  const [customR, setCustomR] = useState(100);
  const [customG, setCustomG] = useState(0);
  const [customB, setCustomB] = useState(255);
  const [customName, setCustomName] = useState('');

  const activeTrap = traps.find((t) => t.id === selectedTrapId) || traps[0];

  // Draft configuration form state (isolated from instant publish)
  const [draftConfig, setDraftConfig] = useState(() => ({
    mode: activeTrap?.mode || 'otomatis',
    blowerMode: (activeTrap?.blowerMode || 'sensor') as 'sensor' | 'time',
    ledRunning: activeTrap?.ledRunning ?? false,
    startTime: activeTrap?.startTime || '18:00',
    endTime: activeTrap?.endTime || '06:00',
    ledRotationInterval: activeTrap?.ledRotationInterval || 15,
    manualIntervalMin: activeTrap?.manualIntervalMin || 15,
    manualDurationSec: activeTrap?.manualDurationSec || 3,
    activePreset: activeTrap?.activePreset !== undefined ? activeTrap.activePreset : 0,
    presets: activeTrap?.presets && activeTrap.presets.length > 0 ? activeTrap.presets : DEFAULT_PRESETS,
  }));

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fast telemetry countdown / state
  const [fastTelemetrySecondsLeft, setFastTelemetrySecondsLeft] = useState<number>(0);
  const [isRequestingFast, setIsRequestingFast] = useState(false);

  // Sync draft when switching selected trap
  useEffect(() => {
    if (activeTrap) {
      setDraftConfig({
        mode: activeTrap.mode || 'otomatis',
        blowerMode: (activeTrap.blowerMode || 'sensor') as 'sensor' | 'time',
        ledRunning: activeTrap.ledRunning ?? false,
        startTime: activeTrap.startTime || '18:00',
        endTime: activeTrap.endTime || '06:00',
        ledRotationInterval: activeTrap.ledRotationInterval || 15,
        manualIntervalMin: activeTrap.manualIntervalMin || 15,
        manualDurationSec: activeTrap.manualDurationSec || 3,
        activePreset: activeTrap.activePreset !== undefined ? activeTrap.activePreset : 0,
        presets: activeTrap.presets && activeTrap.presets.length > 0 ? activeTrap.presets : DEFAULT_PRESETS,
      });
      setSaveSuccess(false);
    }
  }, [activeTrap?.id]);

  // Fast telemetry countdown ticker
  useEffect(() => {
    if (fastTelemetrySecondsLeft <= 0) return;
    const interval = setInterval(() => {
      setFastTelemetrySecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [fastTelemetrySecondsLeft]);

  const isFastModeActive = fastTelemetrySecondsLeft > 0 || Boolean(activeTrap?.isFastTelemetry);

  const presets: ColorPresetItem[] = draftConfig.presets && draftConfig.presets.length > 0
    ? draftConfig.presets
    : DEFAULT_PRESETS;

  const currentPresetIdx = draftConfig.activePreset !== undefined ? draftConfig.activePreset : 0;
  const currentActivePreset = presets[currentPresetIdx] || presets[0] || DEFAULT_PRESETS[0];

  const handleDraftChange = (field: string, value: any) => {
    setDraftConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
    setSaveSuccess(false);
  };

  const handleResetDraft = () => {
    if (!activeTrap) return;
    setDraftConfig({
      mode: activeTrap.mode || 'otomatis',
      blowerMode: (activeTrap.blowerMode || 'sensor') as 'sensor' | 'time',
      ledRunning: activeTrap.ledRunning ?? false,
      startTime: activeTrap.startTime || '18:00',
      endTime: activeTrap.endTime || '06:00',
      ledRotationInterval: activeTrap.ledRotationInterval || 15,
      manualIntervalMin: activeTrap.manualIntervalMin || 15,
      manualDurationSec: activeTrap.manualDurationSec || 3,
      activePreset: activeTrap.activePreset !== undefined ? activeTrap.activePreset : 0,
      presets: activeTrap.presets && activeTrap.presets.length > 0 ? activeTrap.presets : DEFAULT_PRESETS,
    });
    setSaveSuccess(false);
  };

  const hasChanges = Boolean(
    activeTrap && (
      draftConfig.mode !== activeTrap.mode ||
      draftConfig.blowerMode !== (activeTrap.blowerMode || 'sensor') ||
      draftConfig.ledRunning !== (activeTrap.ledRunning ?? false) ||
      draftConfig.startTime !== (activeTrap.startTime || '18:00') ||
      draftConfig.endTime !== (activeTrap.endTime || '06:00') ||
      draftConfig.ledRotationInterval !== (activeTrap.ledRotationInterval || 15) ||
      draftConfig.manualIntervalMin !== (activeTrap.manualIntervalMin || 15) ||
      draftConfig.manualDurationSec !== (activeTrap.manualDurationSec || 3) ||
      draftConfig.activePreset !== (activeTrap.activePreset !== undefined ? activeTrap.activePreset : 0) ||
      JSON.stringify(draftConfig.presets) !== JSON.stringify(activeTrap.presets && activeTrap.presets.length > 0 ? activeTrap.presets : DEFAULT_PRESETS)
    )
  );

  const handleSaveConfig = async () => {
    if (!activeTrap) return;
    setIsSaving(true);
    try {
      const selectedPreset = draftConfig.presets[draftConfig.activePreset] || DEFAULT_PRESETS[0];
      const updatedTrap: PestTrapNode = {
        ...activeTrap,
        mode: draftConfig.mode,
        blowerMode: draftConfig.blowerMode,
        ledRunning: draftConfig.ledRunning,
        startTime: draftConfig.startTime,
        endTime: draftConfig.endTime,
        ledRotationInterval: draftConfig.ledRotationInterval,
        manualIntervalMin: draftConfig.manualIntervalMin,
        manualDurationSec: draftConfig.manualDurationSec,
        activePreset: draftConfig.activePreset,
        ledColor: selectedPreset?.name || activeTrap.ledColor,
        presets: draftConfig.presets,
      };

      await onUpdateTrap(updatedTrap);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      console.error('Gagal menyimpan konfigurasi perangkap:', err);
      alert('Gagal menyimpan konfigurasi: ' + (err?.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTriggerFastTelemetry = async () => {
    if (!activeTrap) return;
    setIsRequestingFast(true);
    setFastTelemetrySecondsLeft(30);
    try {
      if (onRequestFastTelemetry) {
        await onRequestFastTelemetry(activeTrap.id);
      } else {
        await api.controlTrap(activeTrap.id, { command: 'FAST_TELEMETRY' });
      }
    } catch (err: any) {
      console.warn('Gagal meminta telemetri cepat:', err);
    } finally {
      setIsRequestingFast(false);
    }
  };

  // Immediate actuator toggles (for physical tests/maintenance)
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

  const openEditPresetModal = (idx: number) => {
    const p = presets[idx];
    if (!p) return;
    setEditingPresetIdx(idx);
    setCustomName(p.name);
    setCustomR(p.r);
    setCustomG(p.g);
    setCustomB(p.b);
  };

  const handleSavePresetModal = () => {
    if (editingPresetIdx === null) return;
    const updatedPresets = [...presets];
    updatedPresets[editingPresetIdx] = {
      ...updatedPresets[editingPresetIdx],
      name: customName || `Preset ${editingPresetIdx + 1}`,
      r: customR,
      g: customG,
      b: customB,
    };

    handleDraftChange('presets', updatedPresets);
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
          manualIntervalMin: 15,
          manualDurationSec: 3,
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
                className={`px-3.5 py-2 rounded-lg border text-xs font-medium transition-all cursor-pointer flex items-center gap-2 ${
                  isSelected
                    ? 'bg-purple-700 border-purple-700 text-white shadow-xs'
                    : 'bg-white dark:bg-[#141122] border-slate-200 dark:border-purple-900/30 text-slate-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40'
                }`}
              >
                <Bug className="w-3.5 h-3.5" />
                <span>{t.id}</span>
                <span
                  className={`w-2.5 h-2.5 rounded-full border ${
                    t.isOnline
                      ? 'bg-emerald-500 border-emerald-400'
                      : 'bg-slate-400 border-slate-300'
                  }`}
                  title={t.isOnline ? 'Online' : 'Offline'}
                />
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-3.5 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Tambah Perangkat Baru</span>
        </button>
      </div>

      {activeTrap && (
        <>
          {/* Trap Header & Location Bar */}
          <div className="bg-white dark:bg-[#141122] border border-slate-200 dark:border-purple-900/30 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-800/60">
                  {activeTrap.id}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{activeTrap.name}</h3>

                {/* Online/Offline Badge */}
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 ${
                    activeTrap.isOnline
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900'
                      : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${activeTrap.isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  {activeTrap.isOnline ? 'Online' : 'Offline'}
                </span>

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
              <p className="text-xs text-slate-500 dark:text-purple-300/70 mt-1">
                Lokasi: {activeTrap.location}
                {activeTrap.lastSeenAt
                  ? ` • Terakhir terlihat: ${new Date(activeTrap.lastSeenAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                  : ' • Belum pernah terhubung'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Telemetry Status & Rate Indicator */}
              <div className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 ${
                isFastModeActive
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-bold'
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isFastModeActive ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                <span>
                  {isFastModeActive
                    ? `Mode Cepat: 3 dtk ${fastTelemetrySecondsLeft > 0 ? `(${fastTelemetrySecondsLeft}d)` : ''}`
                    : 'Mode Hemat: 5 menit'}
                </span>
              </div>

              {/* Tombol Percepat Data (Live Telemetri) */}
              <button
                type="button"
                onClick={handleTriggerFastTelemetry}
                disabled={isRequestingFast}
                title="Kirim perintah ke mikrokontroler ESP32 untuk mempercepat telemetri ke mode real-time 3 detik"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-[0.98] ${
                  isFastModeActive
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-purple-700 hover:bg-purple-800 text-white'
                }`}
              >
                <Zap className={`w-3.5 h-3.5 ${isFastModeActive ? 'animate-bounce' : ''}`} />
                <span>{isFastModeActive ? 'Perpanjang Realtime' : '⚡ Percepat Data'}</span>
              </button>

              <button
                onClick={handleDeleteActiveTrap}
                className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Node</span>
              </button>
            </div>
          </div>

          {/* Action Bar: Simpan Pengaturan & Status Sinkronisasi */}
          <div className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs ${
            hasChanges
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 ring-2 ring-amber-400/20'
              : 'bg-white dark:bg-[#141122] border-slate-200 dark:border-purple-900/30'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                hasChanges
                  ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                  : 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
              }`}>
                {hasChanges ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    {hasChanges ? 'Perubahan Belum Disimpan' : 'Pengaturan Perangkap Tersinkron'}
                  </h4>
                  {saveSuccess && (
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Check className="w-3 h-3" /> Berhasil Disimpan &amp; Dikirim ke ESP32!
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-purple-300/70">
                  {hasChanges
                    ? 'Pengaturan mode, jadwal, blower, atau preset telah diubah. Klik tombol Simpan untuk menerapkan ke ESP32.'
                    : 'Seluruh konfigurasi waktu, mode kerja, dan warna lampu tersimpan di ESP32 & server.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {hasChanges && (
                <button
                  type="button"
                  onClick={handleResetDraft}
                  disabled={isSaving}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Batal</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSaving || !hasChanges}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-[0.98] ${
                  hasChanges
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/30'
                    : 'bg-slate-100 dark:bg-[#1f1a35] text-slate-400 dark:text-purple-400/40 border border-slate-200 dark:border-purple-900/30 cursor-not-allowed'
                }`}
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
              </button>
            </div>
          </div>

          {/* Mode Operasi Selector (2 Mode Saja) */}
          <div className="bg-white dark:bg-[#141122] border border-slate-200 dark:border-purple-900/30 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 dark:border-purple-900/30 gap-2">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-purple-700 dark:text-purple-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Pilih Mode Kerja Sistem</h4>
              </div>
              <span className="text-xs text-slate-500 dark:text-purple-300/70 font-mono">
                Mode Aktif (Draft): <strong className="text-purple-700 dark:text-purple-300 uppercase">{draftConfig.mode === 'manual' ? 'MANUAL' : 'OTOMATIS'}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Mode 1: Manual */}
              <button
                type="button"
                onClick={() => handleDraftChange('mode', 'manual')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative ${
                  draftConfig.mode === 'manual'
                    ? 'bg-purple-50/70 dark:bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/20'
                    : 'bg-slate-50 dark:bg-[#1a162b] border-slate-200 dark:border-purple-900/30 hover:border-purple-300 dark:hover:border-purple-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">1. Mode Manual</span>
                  </div>
                  {draftConfig.mode === 'manual' && <Check className="w-4 h-4 text-purple-700 dark:text-purple-300" />}
                </div>
                <p className="text-xs text-slate-500 dark:text-purple-300/70 leading-relaxed">
                  Lampu penarik hama aktif menyala terus (24 jam non-stop). Blower dan rotasi lampu bekerja mengikuti parameter yang dikonfigurasi di bawah.
                </p>
              </button>

              {/* Mode 2: Otomatis */}
              <button
                type="button"
                onClick={() => handleDraftChange('mode', 'otomatis')}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative ${
                  draftConfig.mode === 'otomatis' || draftConfig.mode === 'otomatis_led'
                    ? 'bg-purple-50/70 dark:bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/20'
                    : 'bg-slate-50 dark:bg-[#1a162b] border-slate-200 dark:border-purple-900/30 hover:border-purple-300 dark:hover:border-purple-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">2. Mode Otomatis (Jadwal RTC DS3231)</span>
                  </div>
                  {(draftConfig.mode === 'otomatis' || draftConfig.mode === 'otomatis_led') && <Check className="w-4 h-4 text-purple-700 dark:text-purple-300" />}
                </div>
                <p className="text-xs text-slate-500 dark:text-purple-300/70 leading-relaxed">
                  Bekerja otomatis sesuai jam operasional ({draftConfig.startTime || '18:00'} - {draftConfig.endTime || '06:00'}). Di luar jadwal, sistem masuk mode standby hemat daya.
                </p>
              </button>
            </div>
          </div>

          {/* Parameter Kontrol: Blower Mode & LED Running */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 gap-2">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Pengaturan Parameter Blower &amp; Lampu LED</h4>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Klik "Simpan Pengaturan" untuk memperbarui ESP32</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Opsi Pemicu Blower */}
              <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Wind className="w-4 h-4 text-cyan-600" />
                    Pilihan Pemicu Blower
                  </label>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 font-semibold">
                    {draftConfig.blowerMode === 'time' ? 'Siklus Waktu' : 'Sensor VL53L0X'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDraftChange('blowerMode', 'sensor')}
                    className={`px-3 py-2.5 rounded-lg border text-left text-xs font-semibold transition-all cursor-pointer flex flex-col gap-1 ${
                      draftConfig.blowerMode !== 'time'
                        ? 'bg-white dark:bg-slate-900 border-cyan-500 text-cyan-700 dark:text-cyan-300 ring-2 ring-cyan-500/20 shadow-xs'
                        : 'bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">🎯 Sensor Jarak</span>
                    <span className="text-[10px] font-normal text-slate-500">Nyala saat hama mendekat</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDraftChange('blowerMode', 'time')}
                    className={`px-3 py-2.5 rounded-lg border text-left text-xs font-semibold transition-all cursor-pointer flex flex-col gap-1 ${
                      draftConfig.blowerMode === 'time'
                        ? 'bg-white dark:bg-slate-900 border-cyan-500 text-cyan-700 dark:text-cyan-300 ring-2 ring-cyan-500/20 shadow-xs'
                        : 'bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">⏱️ Siklus Waktu</span>
                    <span className="text-[10px] font-normal text-slate-500">Nyala berkala tiap interval</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {draftConfig.blowerMode === 'time'
                    ? `Blower akan otomatis menyala selama ${draftConfig.manualDurationSec || 3} detik setiap ${draftConfig.manualIntervalMin || 15} menit sekali.`
                    : `Blower akan menyala selama ${draftConfig.manualDurationSec || 3} detik saat sensor jarak mendeteksi objek hama (dengan jeda cooldown ${draftConfig.manualIntervalMin || 15} menit).`}
                </p>
              </div>

              {/* Opsi Rotasi Lampu (LED Running) */}
              <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <RotateCw className="w-4 h-4 text-purple-600" />
                    Mode Rotasi Warna Lampu (LED Running)
                  </label>
                  <span className={`text-[11px] font-mono px-2 py-0.5 rounded-md font-semibold ${
                    draftConfig.ledRunning
                      ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}>
                    {draftConfig.ledRunning ? 'ON (Berganti Warna)' : 'OFF (1 Warna)'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDraftChange('ledRunning', true)}
                    className={`px-3 py-2.5 rounded-lg border text-left text-xs font-semibold transition-all cursor-pointer flex flex-col gap-1 ${
                      draftConfig.ledRunning
                        ? 'bg-white dark:bg-slate-900 border-purple-500 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20 shadow-xs'
                        : 'bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">🌈 LED Running: ON</span>
                    <span className="text-[10px] font-normal text-slate-500">Berganti warna otomatis</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDraftChange('ledRunning', false)}
                    className={`px-3 py-2.5 rounded-lg border text-left text-xs font-semibold transition-all cursor-pointer flex flex-col gap-1 ${
                      !draftConfig.ledRunning
                        ? 'bg-white dark:bg-slate-900 border-purple-500 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20 shadow-xs'
                        : 'bg-white/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">💡 LED Running: OFF</span>
                    <span className="text-[10px] font-normal text-slate-500">1 warna preset tetap</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {draftConfig.ledRunning
                    ? `Lampu LED NeoPixel akan berganti warna secara otomatis antar preset setiap ${draftConfig.ledRotationInterval || 15} menit.`
                    : `Lampu LED NeoPixel akan terus menyala pada 1 warna preset yang dipilih di palet warna di bawah.`}
                </p>
              </div>
            </div>
          </div>

          {/* Schedule, LED Rotation & Manual Cycling Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Detail Konfigurasi Waktu &amp; Durasi</h4>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Sinkron dengan Modul RTC DS3231 &amp; ESP32</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {/* Jam Mulai */}
              <div className="bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  Jam Mulai Aktif
                </label>
                <input
                  type="time"
                  value={draftConfig.startTime || '18:00'}
                  onChange={(e) => handleDraftChange('startTime', e.target.value)}
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
                  value={draftConfig.endTime || '06:00'}
                  onChange={(e) => handleDraftChange('endTime', e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">Waktu perangkap otomatis mati (Pagi hari)</span>
              </div>

              {/* Interval Rotasi Warna LED */}
              <div className="bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-purple-600" />
                  Rotasi Lampu (LED Running)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={draftConfig.ledRotationInterval || 15}
                    onChange={(e) => handleDraftChange('ledRotationInterval', Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">Menit</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Warna berganti setiap sekian menit jika LED Running ON</span>
              </div>

              {/* Manual Mode: Interval Siklus / Cooldown */}
              <div className="bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <Timer className="w-3.5 h-3.5 text-emerald-600" />
                  {draftConfig.blowerMode === 'time' ? 'Interval Siklus Blower' : 'Jeda Cooldown Blower'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={draftConfig.manualIntervalMin || 15}
                    onChange={(e) => handleDraftChange('manualIntervalMin', Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">Menit</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  {draftConfig.blowerMode === 'time' ? 'Blower nyala berkala tiap menit ini' : 'Jeda minimum antar deteksi sensor'}
                </span>
              </div>

              {/* Durasi Nyala Blower */}
              <div className="bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  Durasi Nyala Blower
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={3600}
                    value={draftConfig.manualDurationSec || 3}
                    onChange={(e) => handleDraftChange('manualDurationSec', Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">Detik</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Lama blower berputar dalam satu siklus/triger</span>
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
                <span className="text-slate-500">Preset Aktif:</span>
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
                        onClick={() => handleDraftChange('activePreset', idx)}
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
            <div className="lg:col-span-2 bg-white dark:bg-[#141122] border border-slate-200 dark:border-purple-900/30 rounded-xl p-5 sm:p-6 shadow-xs space-y-6 transition-colors">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-purple-900/30 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-700 dark:text-purple-400" />
                <span>Kendali Aktuator &amp; Telemetri Sensor Real-Time</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Actuator 1: LED Lampu */}
                <div className="bg-slate-50 dark:bg-[#1a162b] p-4 rounded-xl border border-slate-200/80 dark:border-purple-900/30 flex items-center justify-between">
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
                      <p className="text-[11px] text-slate-500 dark:text-purple-300/70">
                        {currentActivePreset.name}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleUV(activeTrap)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-[0.98] ${
                      activeTrap.uvLedStatus
                        ? 'bg-purple-700 text-white hover:bg-purple-800'
                        : 'bg-slate-200 dark:bg-[#251e3d] text-slate-700 dark:text-purple-300 hover:bg-slate-300 dark:hover:bg-purple-950/60'
                    }`}
                  >
                    {activeTrap.uvLedStatus ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Actuator 2: Blower (Status dari sensor, bisa test manual) */}
                <div className="bg-slate-50 dark:bg-[#1a162b] p-4 rounded-xl border border-slate-200/80 dark:border-purple-900/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                        activeTrap.blowerStatus
                          ? 'bg-purple-100 dark:bg-purple-950/80 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300'
                          : 'bg-slate-200 dark:bg-[#251e3d] border-slate-300 dark:border-purple-900/40 text-slate-400'
                      }`}
                    >
                      <Wind className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">Centrifugal Blower Hisap</h4>
                      <p className="text-[11px] text-slate-500 dark:text-purple-300/70">
                        {activeTrap.blowerStatus
                          ? `Aktif (otomatis mati setelah ${activeTrap.manualDurationSec || 3} dtk)`
                          : 'Standby — Otomatis nyala saat sensor VL53 deteksi hama'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleBlower(activeTrap)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-[0.98] ${
                      activeTrap.blowerStatus
                        ? 'bg-purple-700 text-white hover:bg-purple-800'
                        : 'bg-slate-200 dark:bg-[#251e3d] text-slate-700 dark:text-purple-300 hover:bg-slate-300 dark:hover:bg-purple-950/60'
                    }`}
                  >
                    {activeTrap.blowerStatus ? 'AKTIF' : 'TEST'}
                  </button>
                </div>

                {/* Sensor 1: Fotoelektrik */}
                <div className="bg-slate-50 dark:bg-[#1a162b] p-4 rounded-xl border border-slate-200/80 dark:border-purple-900/30">
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

          {/* Battery Voltage History Chart */}
          <BatteryChart trapId={activeTrap.id} />
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
                  onClick={handleSavePresetModal}
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
