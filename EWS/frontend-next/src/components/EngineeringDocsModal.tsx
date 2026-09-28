'use client';
import React from 'react';
import { Box, Layers, ShieldCheck, Sun, Wrench, X } from 'lucide-react';

interface EngineeringDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EngineeringDocsModal: React.FC<EngineeringDocsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors">
        {/* Header */}
        <div className="p-5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Spesifikasi Teknis Fabrikasi, Box IP65 &amp; 3D CAD
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ringkasan Standar Produksi Bagian 1, 2, dan 3 Dokumen Spesifikasi Teknis EWS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs text-slate-700 dark:text-slate-300">
          
          {/* Section 1: Box Antiair & Lingkungan */}
          <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-sm font-bold text-blue-700 dark:text-blue-400 flex items-center gap-2">
              <Box className="w-4 h-4" />
              <span>Standar Box Elektronik Utama &amp; Perlindungan Cuaca (Halaman 4)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-900 dark:text-slate-200 block">Material &amp; Proteksi Box:</span>
                <p className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Polycarbonate / ABS industrial minimal <strong>IP65</strong> (~400 &times; 300 &times; 200 mm), gasket EPDM/silikon, dan kunci box antitamper.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-900 dark:text-slate-200 block">Jalur Kabel &amp; Kondensasi:</span>
                <p className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Cable gland <strong>IP68</strong>, breather vent bermembran, silika gel desiccant, serta loop tetesan air (drip loop) pada sambungan.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Komponen Cetak 3D */}
          <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-sm font-bold text-purple-700 dark:text-purple-400 flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              <span>Komponen Cetak 3D CAD EWS &amp; Perangkap Hama (Halaman 5 &amp; 8)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-900 dark:text-slate-200 block">Material Cetak:</span>
                <p className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  <strong>ASA</strong> (Pilihan utama) atau <strong>PETG tahan UV</strong>. Filament PLA dilarang untuk luar ruang.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-900 dark:text-slate-200 block">Ketebalan Dinding:</span>
                <p className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Minimal dinding <strong>3 mm</strong>, infill &ge; 40%, insert ulir kuningan tahan karat.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-900 dark:text-slate-200 block">Bagian yang Dicetak:</span>
                <p className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Dudukan inclinometer &amp; ADXL345, adaptor corong hama, bracket antena outdoor, pelindung lampu LED UV.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Sistem Daya Surya 30Wp & Baterai VRLA */}
          <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Sun className="w-4 h-4" />
              <span>Sistem Daya Mandiri Surya &amp; Baterai (Halaman 4 &amp; 7)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-900 dark:text-slate-200 block">Daya Unit EWS (4 Titik):</span>
                <p className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Panel Surya 30 Wp 12V, Baterai VRLA Deep Cycle <strong>12V 20Ah</strong>, Solar Charge Controller PWM 10A, Buck converter 12V ke 5V 5A.
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="font-semibold text-slate-900 dark:text-slate-200 block">Daya Unit Perangkap Hama (5 Unit):</span>
                <p className="text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Panel Surya 30 Wp, Baterai VRLA <strong>12V 12Ah</strong>, Lampu UV 395-405nm ~5W, Blower sentrifugal 12V 15-25W via MOSFET switch.
                </p>
              </div>
            </div>
          </div>

          {/* Section 4: Logika Operasi & Standar Keselamatan */}
          <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Logika Operasi Lokal &amp; Integrasi Notifikasi (Halaman 6 &amp; 13)</span>
            </h4>
            <ul className="list-disc list-inside space-y-1.5 text-slate-600 dark:text-slate-400 leading-relaxed">
              <li>Alarm sirine 12V (110-120dB) dan strobo diproses secara lokal oleh pengendali ESP32 sehingga tetap berfungsi saat koneksi seluler/server terputus.</li>
              <li>Data pengukuran yang gagal terkirim akibat gangguan GSM disimpan pada MicroSD 32GB dan disinkronkan otomatis saat sinyal kembali normal.</li>
              <li>Setiap titik EWS terhubung ke Bot Telegram mandiri dengan format peringatan siaga, bahaya, offline, dan laporan berkala harian.</li>
            </ul>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-lg cursor-pointer transition-colors"
          >
            Tutup Dokumentasi
          </button>
        </div>
      </div>
    </div>
  );
};
