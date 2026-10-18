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
  Info,
  Server,
  Cpu,
  Layers,
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

  // Endpoint URL
  const downloadEspAutoUrl = api.getDownloadStorageUrl(ews.id, 'auto');
  const downloadEspSdUrl = api.getDownloadStorageUrl(ews.id, 'sd');
  const downloadEspInternalUrl = api.getDownloadStorageUrl(ews.id, 'internal');
  const downloadServerDbUrl = api.getExportCsvUrl(ews.id);

  // Link IP Langsung (jika satu jaringan lokal / hotspot)
  const directEspAutoUrl = ipAddress ? `http://${ipAddress}/download_telemetry` : null;
  const directEspSdUrl = ipAddress ? `http://${ipAddress}/download_telemetry?source=sd` : null;
  const directEspInternalUrl = ipAddress ? `http://${ipAddress}/download_telemetry?source=internal` : null;
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
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-800 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Unduh Data Telemetri (.CSV)</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-mono font-bold">
                  {ews.id}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pilih sumber data: langsung dari alat ESP32 atau dari database server
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
          {/* Status Singkat Perangkat */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1a162b] border border-slate-200/80 dark:border-purple-900/30">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
                <HardDrive className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span className="font-medium">MicroSD Alat:</span>
              </div>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {(ews.sensorData?.microSdStorageUsedMb / 1024).toFixed(1)} GB / 32 GB
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1a162b] border border-slate-200/80 dark:border-purple-900/30">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
                <Cpu className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="font-medium">Flash Internal:</span>
              </div>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                6.18 MB (SPIFFS)
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1a162b] border border-slate-200/80 dark:border-purple-900/30">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
                <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-medium">IP ESP32:</span>
              </div>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate block">
                {ipAddress || 'Offline / Tersembunyi'}
              </span>
            </div>
          </div>

          {/* DUA PILIHAN UTAMA: FILE ESP32 vs DATABASE SERVER */}
          <div className="space-y-4 pt-1">
            {/* PILIHAN 1: FILE DARI ESP32 */}
            <div className="p-4 rounded-2xl border-2 border-emerald-500/30 dark:border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/20 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-300">
                        Pilihan 1
                      </span>
                      <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                        Unduh File Langsung dari Alat ESP32
                      </h4>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      Mengambil file <code>.CSV</code> fisik asli yang dicatat setiap 5 menit oleh firmware mikrokontroler ke <strong>MicroSD Card</strong> atau <strong>Flash Internal (SPIFFS 6.18MB)</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Tombol Aksi Pilihan 1 */}
              <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40 flex flex-wrap items-center gap-2">
                <a
                  href={downloadEspAutoUrl}
                  download
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh File ESP32 (Otomatis)</span>
                </a>

                {/* Sub-pilihan khusus jika ingin spesifik MicroSD atau Internal */}
                <a
                  href={downloadEspSdUrl}
                  download
                  className="px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  title="Unduh spesifik dari MicroSD Card"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Khusus MicroSD</span>
                </a>

                <a
                  href={downloadEspInternalUrl}
                  download
                  className="px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  title="Unduh spesifik dari Flash Internal SPIFFS"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Khusus Internal Flash</span>
                </a>

                {directEspAutoUrl && (
                  <a
                    href={directEspAutoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl border border-slate-300 dark:border-purple-900/50 hover:bg-white dark:hover:bg-purple-900/30 text-slate-600 dark:text-slate-300 text-xs"
                    title={`Akses langsung via IP Lokal (${directEspAutoUrl})`}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>

            {/* PILIHAN 2: DATA DARI DATABASE SERVER */}
            <div className="p-4 rounded-2xl border-2 border-purple-500/30 dark:border-purple-500/40 bg-purple-50/20 dark:bg-purple-950/20 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/80 text-purple-800 dark:text-purple-300">
                        Pilihan 2
                      </span>
                      <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                        Unduh Data dari Database Server (DB Cloud)
                      </h4>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      Mengambil seluruh histori data telemetri yang telah dikirimkan oleh stasiun <strong>{ews.id}</strong> dan tersimpan rapi di database pusat server backend (MySQL).
                    </p>
                  </div>
                </div>
              </div>

              {/* Tombol Aksi Pilihan 2 */}
              <div className="pt-2 border-t border-purple-200/60 dark:border-purple-800/40 flex flex-wrap items-center gap-2">
                <a
                  href={downloadServerDbUrl}
                  download
                  className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh Data dari DB (.CSV)</span>
                </a>
              </div>
            </div>
          </div>

          {/* Akses Cepat Web Panel Internal ESP32 jika Satu WiFi */}
          {directEspWebUrl && (
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#1a162b]/80 border border-slate-200 dark:border-purple-900/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-slate-600 dark:text-slate-300">
                  Panel Lokal ESP32: <code className="text-purple-700 dark:text-purple-300 font-mono font-bold">{directEspWebUrl}</code>
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
            Format: Tanggal (DD-MM-YYYY), Jam, Nilai Sensor, Kode Error
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
