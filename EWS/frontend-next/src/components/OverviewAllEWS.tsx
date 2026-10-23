'use client';
import React, { useState, useMemo } from 'react';
import { EWSNode, UserAccount } from '../types';
import {
  Radio,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  Plus,
  Bot,
  MapPin,
  Compass,
  Droplets,
  Battery,
  Wifi,
  Send,
  Layers,
  Search,
  Copy,
  Check,
  Smartphone,
  Trash2,
  Download,
} from 'lucide-react';
import { TelegramConfigModal } from './TelegramConfigModal';
import { TelkomselConfigModal } from './TelkomselConfigModal';

interface OverviewAllEWSProps {
  ewsNodes: EWSNode[];
  onSelectEws: (id: string) => void;
  onAddEwsClick?: () => void;
  onDeleteEws?: (id: string) => void;
  currentUser?: UserAccount | null;
  onRequireLogin?: (notice?: string) => void;
  onOpenTelegramConfig?: (ews: EWSNode) => void;
  onOpenTelkomselConfig?: (ews: EWSNode) => void;
}

export const OverviewAllEWS: React.FC<OverviewAllEWSProps> = ({
  ewsNodes,
  onSelectEws,
  onAddEwsClick,
  onDeleteEws,
  currentUser,
  onRequireLogin,
  onOpenTelegramConfig,
  onOpenTelkomselConfig,
}) => {
  const [selectedTelegramEws, setSelectedTelegramEws] = useState<EWSNode | null>(null);
  const [selectedTelkomselEws, setSelectedTelkomselEws] = useState<EWSNode | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'aman' | 'siaga' | 'bahaya'>('all');

  // Hitung status agregat
  const safeCount = ewsNodes.filter((e) => e.status === 'aman').length;
  const siagaCount = ewsNodes.filter((e) => e.status === 'siaga').length;
  const dangerCount = ewsNodes.filter((e) => e.status === 'bahaya').length;
  const telegramActiveCount = ewsNodes.filter((e) => e.telegramConfig && e.telegramConfig.chatId).length;

  const handleCopyCoords = (ews: EWSNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `${ews.coordinates.lat.toFixed(6)}, ${ews.coordinates.lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopiedId(ews.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTelegramClick = (ews: EWSNode) => {
    if (onOpenTelegramConfig) {
      onOpenTelegramConfig(ews);
      return;
    }
    if (!currentUser) {
      onRequireLogin?.('Silakan login untuk mengatur Bot Telegram stasiun EWS.');
      return;
    }
    setSelectedTelegramEws(ews);
  };

  const handleTelkomselClick = (ews: EWSNode) => {
    if (onOpenTelkomselConfig) {
      onOpenTelkomselConfig(ews);
      return;
    }
    if (!currentUser) {
      onRequireLogin?.('Silakan login untuk mengakses konfigurasi SIM & Paket Telkomsel IoT.');
      return;
    }
    setSelectedTelkomselEws(ews);
  };

  const handleAddClick = () => {
    if (!currentUser) {
      onRequireLogin?.('Silakan login sebagai Superadmin untuk mendaftarkan titik pantau EWS baru.');
      return;
    }
    if (currentUser.role !== 'superadmin') {
      alert('Hanya akun Superadmin yang memiliki wewenang untuk mendaftarkan titik pantau EWS baru.');
      return;
    }
    onAddEwsClick?.();
  };

  const handleDeleteClick = (id: string) => {
    if (!currentUser) {
      onRequireLogin?.('Silakan login sebagai Superadmin untuk menghapus stasiun EWS.');
      return;
    }
    if (currentUser.role !== 'superadmin') {
      alert('Hanya akun Superadmin yang memiliki wewenang untuk menghapus titik EWS.');
      return;
    }
    onDeleteEws?.(id);
  };

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    return ewsNodes.filter((ews) => {
      const matchSearch =
        ews.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ews.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ews.location.toLowerCase().includes(searchQuery.toLowerCase());

      const matchStatus = statusFilter === 'all' || ews.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [ewsNodes, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Top Academic Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Safe */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Status Normal</span>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
              {safeCount} <span className="text-xs font-sans font-normal text-slate-500 dark:text-slate-400">Titik</span>
            </div>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">Lereng stabil aman</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        {/* Siaga */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Status Waspada</span>
            <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
              {siagaCount} <span className="text-xs font-sans font-normal text-slate-500 dark:text-slate-400">Titik</span>
            </div>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">Ambang batas terlampaui</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* Bahaya */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Status Bahaya</span>
            <div className="text-2xl font-bold font-mono text-red-600 dark:text-red-400 mt-0.5">
              {dangerCount} <span className="text-xs font-sans font-normal text-slate-500 dark:text-slate-400">Titik</span>
            </div>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">Sirine 110dB aktif</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        {/* Telegram Bot & Jaringan */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Transmisi Bot Telegram</span>
            <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5">
              {telegramActiveCount} / {ewsNodes.length}{' '}
              <span className="text-xs font-sans font-normal text-slate-500 dark:text-slate-400">Aktif</span>
            </div>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">Transmisi bot terhubung</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Monitoring Section */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Titik Pemantauan Geoteknik &amp; Early Warning System</span>
              {ewsNodes.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 font-mono font-medium">
                  {ewsNodes.length} Perangkat
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pusat kendali dan telemetri multi-node mitigasi bencana pergerakan lereng tanah
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/logs/export/csv"
              download
              className="self-start sm:self-auto px-3.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              title="Ekspor seluruh rekaman telemetri sensor semua stasiun (.CSV)"
            >
              <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Ekspor Semua CSV</span>
            </a>

            <button
              type="button"
              onClick={handleAddClick}
              className="self-start sm:self-auto px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Titik EWS</span>
            </button>
          </div>
        </div>

        {/* Interactive Filter & Search Bar */}
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-3 mb-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-xs">
          {/* Status Segmented Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Semua ({ewsNodes.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('aman')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === 'aman'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
              }`}
            >
              Normal ({safeCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('siaga')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === 'siaga'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
              }`}
            >
              Waspada ({siagaCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('bahaya')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === 'bahaya'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-950/30'
              }`}
            >
              Bahaya ({dangerCount})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari ID, nama lereng..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>
        </div>

        {/* Empty State vs Node Cards */}
        {filteredNodes.length === 0 ? (
          <div className="bg-white dark:bg-[#111827] border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 sm:p-12 text-center transition-colors">
            <div className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3">
              <Radio className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white">
              Tidak Ada Titik Pemantauan yang Cocok
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 mb-4">
              {searchQuery || statusFilter !== 'all'
                ? 'Tidak ditemukan titik EWS yang sesuai dengan kata kunci pencarian atau filter status yang dipilih.'
                : 'Sistem monitoring saat ini siap menerima perangkat baru. Silakan tambahkan stasiun pemantauan lereng EWS pertama.'}
            </p>
            {searchQuery || statusFilter !== 'all' ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                Reset Filter Pencarian
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAddClick}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Perangkat EWS</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredNodes.map((ews) => {
              const isBahaya = ews.status === 'bahaya';
              const isSiaga = ews.status === 'siaga';

              const statusBadgeClasses = isBahaya
                ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800'
                : isSiaga
                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';

              const cardBorder = isBahaya
                ? 'border-red-300 dark:border-red-900/60'
                : isSiaga
                ? 'border-amber-300 dark:border-amber-900/60'
                : 'border-slate-200 dark:border-slate-800';

              return (
                <div
                  key={ews.id}
                  className={`bg-white dark:bg-[#111827] rounded-xl border ${cardBorder} hover:border-blue-400 dark:hover:border-blue-600 p-5 transition-all duration-150 shadow-xs hover:shadow-md flex flex-col justify-between`}
                >
                  <div>
                    {/* Card top */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                            {ews.id}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">{ews.name}</h4>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="truncate">{ews.location}</span>
                          </p>
                          <button
                            type="button"
                            onClick={(e) => handleCopyCoords(ews, e)}
                            className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer font-mono"
                            title="Salin Koordinat WGS84"
                          >
                            {copiedId === ews.id ? (
                              <span className="text-emerald-600 flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> Disalin
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5">
                                <Copy className="w-3 h-3" />
                              </span>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${statusBadgeClasses}`}
                        >
                          {ews.status.toUpperCase()}
                        </span>
                        {onDeleteEws && (
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(ews.id)}
                            className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                            title={`Hapus ${ews.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sensor highlights */}
                    <div className="grid grid-cols-3 gap-2 my-4">
                      <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1">
                          <Compass className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          Kemiringan
                        </span>
                        <div className="text-xs sm:text-sm font-mono font-bold text-slate-900 dark:text-white mt-1">
                          {ews.sensorData.pitchAngle?.toFixed(2) ?? '0.00'}° / {ews.sensorData.rollAngle?.toFixed(2) ?? '0.00'}°
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1">
                          <Droplets className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                          Curah Hujan
                        </span>
                        <div className="text-xs sm:text-sm font-mono font-bold text-slate-900 dark:text-white mt-1">
                          {(ews.sensorData.rainfallRate ?? 0).toFixed(2)} <span className="text-[10px] font-normal text-slate-500">mm</span>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 text-center">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1">
                          <Battery className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          Baterai VRLA
                        </span>
                        <div className={`text-xs sm:text-sm font-mono font-bold mt-1 ${
                          (ews.sensorData.batteryVoltage ?? 0) <= 0.5
                            ? 'text-orange-600 dark:text-orange-400'
                            : (ews.sensorData.batteryVoltage ?? 0) < (ews.thresholds?.batteryLowVoltage ?? 11.8)
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-900 dark:text-white'
                        }`}>
                          {(ews.sensorData.batteryVoltage ?? 0).toFixed(2)} <span className="text-[10px] font-normal text-slate-500">V</span>
                        </div>
                      </div>
                    </div>

                    {/* Network WiFi & IP Address strip */}
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs mb-2">
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[130px]">
                          {ews.sensorData?.wifiSsid || 'WiFi EWS'}
                        </span>
                        <span className="text-[10px] font-mono text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900/50">
                          {ews.sensorData?.ipAddress || '192.168.1.1'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {ews.sensorData?.wifiRssi ?? ews.sensorData?.gsmSignalDbm ?? -65} dBm
                      </span>
                    </div>

                    {/* Telegram channel info */}
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs mb-2">
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <Send className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="truncate max-w-[200px] text-[11px] font-mono">
                          {ews.telegramConfig ? ews.telegramConfig.channelName : 'Belum Dikonfigurasi'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTelegramClick(ews)}
                        className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Konfigurasi Bot
                      </button>
                    </div>

                    {/* Telkomsel SIM & Quota info */}
                    <div className="p-2.5 bg-red-50/40 dark:bg-red-950/20 rounded-lg border border-red-200/70 dark:border-red-900/30 flex items-center justify-between text-xs mb-4">
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <Smartphone className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
                        <span className="truncate max-w-[200px] text-[11px] font-mono">
                          {ews.telkomselConfig?.isConnected
                            ? (ews.telkomselConfig.phoneNumber || ews.telkomselConfig.msisdn) + " (" + (ews.telkomselConfig.quotaData?.primaryQuota?.remaining || "Aktif") + ")"
                            : "SIM Telkomsel Belum Terhubung"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTelkomselClick(ews)}
                        className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                      >
                        {ews.telkomselConfig?.isConnected ? 'Cek Kuota' : 'Hubungkan'}
                      </button>
                    </div>
                  </div>

                  {/* Bottom CTA to view dedicated dashboard */}
                  <button
                    onClick={() => onSelectEws(ews.id)}
                    className="w-full py-2.5 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/70 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer group border border-blue-200/80 dark:border-blue-900/60"
                  >
                    <span>Buka Analisis &amp; Kendali {ews.id}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Peta Sebaran Stasiun Lapangan */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>
                Peta Sebaran Stasiun Lapangan{' '}
                {ewsNodes.length > 0 ? `(${ewsNodes.length} Titik EWS)` : '(Menunggu Perangkat)'}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Distribusi spasial pemantauan lereng mitigasi bencana tanah longsor mandiri tenaga surya
            </p>
          </div>
          {ewsNodes.length > 0 && (
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Normal
              </span>
              <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Waspada
              </span>
              <span className="flex items-center gap-1.5 text-red-700 dark:text-red-400 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                Bahaya
              </span>
            </div>
          )}
        </div>

        {/* Map Canvas Illustration */}
        <div className="relative h-72 sm:h-80 w-full bg-slate-50 dark:bg-[#0b0f19] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden p-5 flex flex-col justify-between">
          {/* Topographical grid pattern background */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(#3b82f6 0.8px, transparent 0.8px)',
              backgroundSize: '28px 28px',
            }}
          />

          <div className="relative z-10 flex justify-between text-[10px] sm:text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span>SEKTOR LERENG KRITIS &bull; ZONA A-IV</span>
            <span>SKALA 1:5,000 &bull; DATUM WGS-84</span>
          </div>

          {/* Clean Academic Nodes Pins (Non AI-blink) */}
          <div className="relative z-10 h-44 sm:h-52 w-full flex items-center justify-center">
            {ewsNodes.length === 0 ? (
              <div className="text-center p-4 max-w-sm bg-white/90 dark:bg-[#111827]/90 backdrop-blur rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <MapPin className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Peta Siap Memetakan Koordinat
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Titik stasiun EWS akan otomatis diposisikan pada peta setelah didaftarkan.
                </p>
              </div>
            ) : (
              ewsNodes.map((ews, idx) => {
                const positions = [
                  { top: '25%', left: '25%' },
                  { top: '45%', left: '65%' },
                  { top: '65%', left: '35%' },
                  { top: '80%', left: '78%' },
                  { top: '35%', left: '80%' },
                  { top: '75%', left: '15%' },
                ];
                const pos = positions[idx] || {
                  top: `${30 + ((idx * 20) % 50)}%`,
                  left: `${20 + ((idx * 25) % 60)}%`,
                };
                const isAmber = ews.status === 'siaga';
                const isRed = ews.status === 'bahaya';

                const pinBg = isRed
                  ? 'bg-red-600 text-white'
                  : isAmber
                  ? 'bg-amber-600 text-white'
                  : 'bg-blue-600 text-white';

                return (
                  <div
                    key={ews.id}
                    onClick={() => onSelectEws(ews.id)}
                    style={{ top: pos.top, left: pos.left }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
                  >
                    <div className="relative flex items-center justify-center">
                      {isRed && (
                        <span className="absolute w-7 h-7 rounded-full opacity-60 bg-red-500 animate-ping" />
                      )}
                      <div
                        className={`w-6 h-6 rounded-full border-2 border-white dark:border-[#0b0f19] flex items-center justify-center shadow-md font-bold text-[10px] ${pinBg} transition-transform group-hover:scale-110`}
                      >
                        {idx + 1}
                      </div>
                    </div>

                    {/* Clean Academic Tooltip on hover */}
                    <div className="hidden group-hover:block absolute bottom-8 left-1/2 -translate-x-1/2 z-30 min-w-[200px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl shadow-lg text-left">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-xs text-slate-900 dark:text-white truncate">{ews.name}</span>
                        <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50">
                          {ews.id}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{ews.location}</span>
                      <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px] text-blue-600 dark:text-blue-400 font-mono">
                        Sudut: {ews.sensorData.pitchAngle?.toFixed(2) ?? '0.00'}° &bull; Hujan: {(ews.sensorData.rainfallRate ?? 0).toFixed(2)} mm/j
                      </div>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 block mt-1">
                        Klik untuk membuka analisis lengkap &rarr;
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="relative z-10 flex justify-between text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
            <span>Elevasi Zona: 850 - 1,200 mdpl (Mitigasi Geoteknik)</span>
            <span>Sensor Inclinometer RS485 &bull; Tipping Bucket Rain Gauge</span>
          </div>
        </div>
      </div>

      {/* Telegram Config Modal */}
      {selectedTelegramEws && (
        <TelegramConfigModal
          ews={selectedTelegramEws}
          isOpen={true}
          onClose={() => setSelectedTelegramEws(null)}
          onSave={(newCfg) => {
            selectedTelegramEws.telegramConfig = newCfg;
            setSelectedTelegramEws(null);
          }}
        />
      )}

      {/* Telkomsel Config Modal */}
      {selectedTelkomselEws && (
        <TelkomselConfigModal
          ews={selectedTelkomselEws}
          isOpen={true}
          onClose={() => setSelectedTelkomselEws(null)}
          onSave={(newCfg) => {
            selectedTelkomselEws.telkomselConfig = newCfg;
            setSelectedTelkomselEws(null);
          }}
        />
      )}
    </div>
  );
};
