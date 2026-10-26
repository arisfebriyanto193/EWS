'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { EWSNode } from '../types';
import { formatWIB } from '../utils/date';
import {
  X,
  Send,
  Smartphone,
  Sliders,
  Download,
  RefreshCw,
  Volume2,
  VolumeX,
  AlertTriangle,
  ChevronRight,
  SlidersHorizontal,
  Clock,
  MapPin,
  CheckCircle2,
  ShieldAlert,
  RotateCcw,
  Pencil,
} from 'lucide-react';

interface DeviceOptionsModalProps {
  ews: EWSNode;
  isOpen: boolean;
  onClose: () => void;
  onOpenTelegram: () => void;
  onOpenTelkomsel: () => void;
  onOpenThreshold: () => void;
  onOpenEditConfig?: () => void;
  onOpenDownload: () => void;
  onRequestDataNow: () => void;
  isRequestingData?: boolean;
  canControl?: boolean;
  onTestSiren?: () => void;
  isSirenTesting?: boolean;
  onToggleMute?: () => void;
  onOpenTriggerCause?: () => void;
  onResetAlarm?: () => void;
  onRestartEsp?: () => void;
  isRestarting?: boolean;
}

export const DeviceOptionsModal: React.FC<DeviceOptionsModalProps> = ({
  ews,
  isOpen,
  onClose,
  onOpenTelegram,
  onOpenTelkomsel,
  onOpenThreshold,
  onOpenEditConfig,
  onOpenDownload,
  onRequestDataNow,
  isRequestingData = false,
  canControl = false,
  onTestSiren,
  isSirenTesting = false,
  onToggleMute,
  onOpenTriggerCause,
  onResetAlarm,
  onRestartEsp,
  isRestarting = false,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const handleAction = (actionFn?: () => void, shouldCloseModal = true) => {
    if (!actionFn) return;
    if (shouldCloseModal) {
      onClose();
    }
    actionFn();
  };

  const statusBadge =
    ews.status === 'bahaya'
      ? { label: 'BAHAYA', bg: 'bg-red-500 text-white animate-pulse' }
      : ews.status === 'siaga'
      ? { label: 'SIAGA', bg: 'bg-amber-500 text-white' }
      : ews.status === 'baterai_lemah'
      ? { label: 'BATERAI LEMAH', bg: 'bg-orange-500 text-white' }
      : ews.status === 'offline'
      ? { label: 'OFFLINE', bg: 'bg-slate-400 text-white' }
      : { label: 'NORMAL / AMAN', bg: 'bg-emerald-500 text-white' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] z-10">
        {/* Header Modal */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-slate-700 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-xs">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Opsi &amp; Pengaturan Perangkat
                </h3>
                <span className="px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                  {ews.id}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                <span className="truncate">{ews.name} &bull; {ews.location}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Strip (Status & Waktu Terakhir Terupdate dalam WIB) */}
        <div className="px-5 py-2.5 bg-blue-50/60 dark:bg-blue-950/30 border-b border-blue-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Status Alat:</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${statusBadge.bg}`}>
              {statusBadge.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span>Update: {formatWIB(ews.sensorData?.lastSeenAt || ews.sensorData?.lastUpdated, false)}</span>
          </div>
        </div>

        {/* Modal Body / Menu Options */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* GRUP 1: KONFIGURASI UTAMA */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-2.5">
              Konfigurasi &amp; Pemantauan Sistem
            </h4>

            {onOpenEditConfig && (
              <button
                type="button"
                onClick={() => handleAction(onOpenEditConfig)}
                className="w-full text-left p-3.5 mb-2.5 rounded-xl border border-blue-300/80 dark:border-blue-800/80 bg-linear-to-r from-blue-50/70 to-indigo-50/50 dark:from-blue-950/40 dark:to-indigo-950/30 hover:from-blue-100/80 hover:to-indigo-100/60 dark:hover:from-blue-900/50 dark:hover:to-indigo-900/40 transition-all flex items-center justify-between gap-3 group cursor-pointer shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      Edit Konfigurasi Titik EWS
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/80 text-blue-700 dark:text-blue-300 font-semibold font-mono">
                        ID, Nama &amp; Koordinat
                      </span>
                    </span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                      Ubah ID node ({ews.id}), nama titik, lokasi lereng, koordinat GPS &amp; ambang batas
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform shrink-0" />
              </button>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* 1. Bot Telegram */}
              <button
                type="button"
                onClick={() => handleAction(onOpenTelegram)}
                className="w-full text-left p-3.5 rounded-xl border border-blue-200/80 dark:border-slate-800 bg-blue-50/30 dark:bg-slate-900/60 hover:bg-blue-50 dark:hover:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700 transition-all flex items-start justify-between gap-3 group cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Konfigurasi Bot Telegram
                      </span>
                      {ews.telegramConfig?.enabled && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500" title="Aktif" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      Token bot, Chat ID grup &amp; peringatan otomatis
                    </p>
                    <span className="inline-block mt-1 text-[10px] font-mono text-blue-600 dark:text-blue-400 font-semibold truncate max-w-[170px]">
                      {ews.telegramConfig?.enabled
                        ? ews.telegramConfig.channelName || 'Terhubung'
                        : 'Belum Dikonfigurasi'}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
              </button>

              {/* 2. SIM & Kuota Telkomsel */}
              <button
                type="button"
                onClick={() => handleAction(onOpenTelkomsel)}
                className="w-full text-left p-3.5 rounded-xl border border-red-200/70 dark:border-red-900/40 bg-red-50/20 dark:bg-slate-900/60/80 hover:bg-red-50/60 dark:hover:bg-red-950/40 hover:border-red-300 dark:hover:border-red-700 transition-all flex items-start justify-between gap-3 group cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        SIM &amp; Kuota Telkomsel
                      </span>
                      {ews.telkomselConfig?.isConnected && (
                        <span className="w-2 h-2 rounded-full bg-red-500" title="Terhubung" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      Sisa kuota internet modem 4G, pulsa &amp; masa aktif
                    </p>
                    <span className="inline-block mt-1 text-[10px] font-mono text-red-600 dark:text-red-400 font-bold truncate max-w-[170px]">
                      {ews.telkomselConfig?.isConnected
                        ? `${ews.telkomselConfig.quotaData?.primaryQuota?.remaining || 'Aktif'} • ${ews.telkomselConfig.phoneNumber || ews.telkomselConfig.msisdn || ''}`
                        : 'SIM Belum Terhubung'}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-red-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
              </button>

              {/* 3. Atur Ambang Batas Sensor */}
              <button
                type="button"
                onClick={() => handleAction(onOpenThreshold)}
                className="w-full text-left p-3.5 rounded-xl border border-indigo-200/80 dark:border-indigo-900/40 bg-indigo-50/20 dark:bg-slate-900/60/80 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/40 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all flex items-start justify-between gap-3 group cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      Atur Ambang Batas
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      Batas siaga/bahaya sudut, curah hujan &amp; getaran
                    </p>
                    <span className="inline-block mt-1 text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-medium">
                      Simpan ke EEPROM ESP32
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
              </button>

              {/* 4. Unduh Data (.CSV) */}
              <button
                type="button"
                onClick={() => handleAction(onOpenDownload)}
                className="w-full text-left p-3.5 rounded-xl border border-sky-200/80 dark:border-sky-900/40 bg-sky-50/20 dark:bg-slate-900/60/80 hover:bg-sky-50/60 dark:hover:bg-sky-950/40 hover:border-sky-300 dark:hover:border-sky-700 transition-all flex items-start justify-between gap-3 group cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      Unduh Data (.CSV)
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      Ekspor telemetri 5-menit (MicroSD / Server)
                    </p>
                    <span className="inline-block mt-1 text-[10px] font-mono text-sky-600 dark:text-sky-400 font-medium">
                      Zona Waktu WIB Terkalibrasi
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-sky-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
              </button>
            </div>
          </div>

          {/* GRUP 2: AKTUATOR & TINDAKAN CEPAT */}
          <div className="pt-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-2.5">
              Kontrol Aktuator &amp; Tindakan Cepat
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Minta Data Realtime */}
              <button
                type="button"
                onClick={() => handleAction(onRequestDataNow, false)}
                disabled={isRequestingData}
                className="w-full text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:bg-blue-50 dark:hover:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700 transition-all flex items-center justify-between gap-3 group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <RefreshCw className={`w-4 h-4 ${isRequestingData ? 'animate-spin' : ''}`} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      {isRequestingData ? 'Meminta Data...' : 'Minta Data Realtime'}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Query telemetri terkini langsung ke ESP32
                    </span>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                  {isRequestingData ? 'Tunggu...' : 'Kirim'}
                </span>
              </button>

              {/* Analisis Sensor Pemicu */}
              <button
                type="button"
                onClick={() => handleAction(onOpenTriggerCause)}
                className="w-full text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:border-amber-300 dark:hover:border-amber-800 transition-all flex items-center justify-between gap-3 group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      Detail Sensor Pemicu
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Evaluasi matriks parameter vs ambang batas
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 transition-all shrink-0" />
              </button>

              {canControl && (
                <>
                  {/* Uji Sirine 12V */}
                  <button
                    type="button"
                    onClick={() => handleAction(onTestSiren, false)}
                    disabled={isSirenTesting}
                    className="w-full text-left p-3.5 rounded-xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/20 dark:bg-slate-900/60 hover:bg-amber-50 dark:hover:bg-amber-950/50 hover:border-amber-300 dark:hover:border-amber-700 transition-all flex items-center justify-between gap-3 group cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <Volume2 className={`w-4 h-4 ${isSirenTesting ? 'animate-bounce' : ''}`} />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white block">
                          {isSirenTesting ? 'Menguji Sirine...' : 'Uji Coba Sirine 12V'}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Bunyikan sirine &amp; strobo selama 2 detik
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      {isSirenTesting ? 'Bunyi...' : 'Uji'}
                    </span>
                  </button>

                  {/* Senyapkan Sirine */}
                  <button
                    type="button"
                    onClick={() => handleAction(onToggleMute, false)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 group cursor-pointer ${
                      ews.muted
                        ? 'border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          ews.muted
                            ? 'bg-red-100 dark:bg-red-900/80 text-red-600 dark:text-red-300'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {ews.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </div>
                      <div>
                        <span className="text-xs font-bold block">
                          {ews.muted ? 'Sirine Disenyapkan' : 'Senyapkan Sirine'}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {ews.muted
                            ? 'Sirine dibisukan oleh operator'
                            : 'Mute suara sirine 110dB di pos lapangan'}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold">
                      {ews.muted ? 'Buka Suara' : 'Mute'}
                    </span>
                  </button>

                  {/* Restart ESP32 */}
                  {onRestartEsp && (
                    <button
                      type="button"
                      onClick={() => handleAction(onRestartEsp, false)}
                      disabled={isRestarting}
                      className="w-full text-left p-3.5 rounded-xl border border-red-200/60 dark:border-red-900/40 bg-red-50/20 dark:bg-slate-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 hover:border-red-300 dark:hover:border-red-700 transition-all flex items-center justify-between gap-3 group cursor-pointer disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                          <RotateCcw className={`w-4 h-4 ${isRestarting ? 'animate-spin' : ''}`} />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 dark:text-white block">
                            {isRestarting ? 'Merestart ESP32...' : 'Restart ESP32'}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Reboot mikrokontroler dari jarak jauh
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                        {isRestarting ? 'Proses...' : 'Reboot'}
                      </span>
                    </button>
                  )}
                </>
              )}

              {/* Reset Alarm (jika tidak aman) */}
              {ews.status !== 'aman' && onResetAlarm && (
                <button
                  type="button"
                  onClick={() => handleAction(onResetAlarm)}
                  className="sm:col-span-2 w-full text-left p-3.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-all flex items-center justify-between gap-3 group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 block">
                        Reset Status Alarm ke Normal
                      </span>
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                        Kembalikan status sistem ke AMAN dan nonaktifkan sirine/strobo
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 px-3 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900">
                    Reset Sekarang
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between text-xs text-slate-500">
          <span>Perekaman data telemetri: otomatis 5 menit sekali (WIB)</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
