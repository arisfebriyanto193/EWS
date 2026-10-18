'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { EWSNode } from '../types';
import { api } from '../services/api';
import {
  Download,
  HardDrive,
  Database,
  ExternalLink,
  Wifi,
  X,
  FileSpreadsheet,
  AlertTriangle,
  Info,
  Server,
  Cpu,
} from 'lucide-react';

interface DownloadStorageModalProps {
  ews: EWSNode;
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadStorageModal: React.FC<DownloadStorageModalProps> = ({
  ews,
  isOpen,
  onClose,
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

  const ipAddress = ews.sensorData?.ipAddress && ews.sensorData.ipAddress !== '0.0.0.0'
    ? ews.sensorData.ipAddress
    : null;

  const downloadSdUrl = api.getDownloadStorageUrl(ews.id, 'sd');
  const downloadInternalUrl = api.getDownloadStorageUrl(ews.id, 'internal');
  const downloadAutoUrl = api.getDownloadStorageUrl(ews.id, 'auto');
  const downloadServerDbUrl = api.getExportCsvUrl(ews.id);

  const directEspSdUrl = ipAddress ? `http://${ipAddress}/download_telemetry?source=sd` : null;
  const directEspInternalUrl = ipAddress ? `http://${ipAddress}/download_telemetry?source=internal` : null;
  const directEspEventsUrl = ipAddress ? `http://${ipAddress}/download_events` : null;
  const directEspWebUrl = ipAddress ? `http://${ipAddress}/` : null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-2xl bg-white dark:bg-[#141122] border border-slate-200 dark:border-purple-900/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10">
        {/* Header Modal */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-purple-900/40 flex items-center justify-between bg-slate-50 dark:bg-[#1a162b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/80 border border-sky-300 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Unduh Data Rekaman Sensor (.CSV)</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-mono font-bold">
                  {ews.id}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Stasiun: {ews.name} ({ews.location})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-purple-900/30 transition-colors cursor-pointer"
            title="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Status Hardware Penyimpanan */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1a162b] border border-slate-200/80 dark:border-purple-900/30">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
                <HardDrive className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span className="font-medium">MicroSD Card:</span>
              </div>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {(ews.sensorData?.microSdStorageUsedMb / 1024).toFixed(1)} GB / 32 GB
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1a162b] border border-slate-200/80 dark:border-purple-900/30">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
                <Cpu className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="font-medium">Internal SPIFFS:</span>
              </div>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                6.18 MB (Cadangan)
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1a162b] border border-slate-200/80 dark:border-purple-900/30">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
                <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-medium">IP Perangkat:</span>
              </div>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate block">
                {ipAddress || 'Offline / Tersembunyi'}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Perekaman Hybrid Otonom (5 Menit):</p>
              <p className="text-blue-800/80 dark:text-blue-300/80 mt-0.5 leading-relaxed">
                ESP32 merekam data telemetri berkala tiap 5 menit ke <strong>MicroSD</strong>. Jika MicroSD tidak terdeteksi, data otomatis disimpan ke <strong>Flash Internal SPIFFS (6.18MB)</strong>.
              </p>
            </div>
          </div>

          {/* Opsi Unduh Kartu */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-purple-300 uppercase tracking-wider">
              Pilih Media Penyimpanan Sumber:
            </h4>

            {/* 1. Unduh dari MicroSD Card */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-purple-900/40 bg-white dark:bg-[#1a162b] hover:border-emerald-500/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>1. Unduh dari MicroSD Card Alat</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold font-mono">
                      Fisik SD
                    </span>
                  </h5>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Mengambil rekaman CSV dari kartu MicroSD fisik yang terpasang pada stasiun EWS.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={downloadSdUrl}
                  download
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh (.CSV)</span>
                </a>
                {directEspSdUrl && (
                  <a
                    href={directEspSdUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg border border-slate-200 dark:border-purple-900/50 hover:bg-slate-100 dark:hover:bg-purple-900/30 text-slate-600 dark:text-slate-300 text-xs"
                    title={`Unduh langsung via IP Lokal ESP32 (${directEspSdUrl})`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* 2. Unduh dari Flash Internal SPIFFS */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-purple-900/40 bg-white dark:bg-[#1a162b] hover:border-sky-500/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-950/80 border border-sky-300 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0 mt-0.5">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>2. Unduh dari Flash Internal Alat</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-semibold font-mono">
                      SPIFFS 6.18MB
                    </span>
                  </h5>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Mengambil rekaman CSV dari chip Flash internal ESP32 (saat SD tidak dipasang atau dicabut).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={downloadInternalUrl}
                  download
                  className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh (.CSV)</span>
                </a>
                {directEspInternalUrl && (
                  <a
                    href={directEspInternalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg border border-slate-200 dark:border-purple-900/50 hover:bg-slate-100 dark:hover:bg-purple-900/30 text-slate-600 dark:text-slate-300 text-xs"
                    title={`Unduh langsung via IP Lokal ESP32 (${directEspInternalUrl})`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* 3. Unduh dari Database Server Pusat */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-purple-900/40 bg-white dark:bg-[#1a162b] hover:border-purple-500/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-800 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 mt-0.5">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>3. Unduh dari Database Server / Cloud</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-semibold font-mono">
                      MySQL Cloud
                    </span>
                  </h5>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Seluruh riwayat telemetri stasiun {ews.id} yang telah tersinkronisasi ke server pusat.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={downloadServerDbUrl}
                  download
                  className="px-3.5 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh (.CSV)</span>
                </a>
              </div>
            </div>
          </div>

          {/* Opsi Akses Web Panel ESP32 Langsung jika satu WiFi */}
          {directEspWebUrl && (
            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-[#1a162b]/80 border border-slate-200 dark:border-purple-900/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-slate-600 dark:text-slate-300">
                  Panel Web Server Internal ESP32: <code className="text-purple-700 dark:text-purple-300 font-mono font-bold">{directEspWebUrl}</code>
                </span>
              </div>
              <a
                href={directEspWebUrl}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
              >
                Buka Panel &rarr;
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-purple-900/40 bg-slate-50 dark:bg-[#1a162b] flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Format: Tanggal (DD-MM-YYYY), Jam, Nilai Sensor, Kode Anomali
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-purple-900/50 hover:bg-slate-200 dark:hover:bg-purple-900/30 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
