import React from 'react';
import { Box, Layers, Cpu, ShieldCheck, Sun, Wrench, X } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Spesifikasi Teknis Fabrikasi, Box IP65 & 3D CAD
              </h3>
              <p className="text-xs text-slate-400">
                Ringkasan Standar Produksi Bagian 1, 2, dan 3 Dokumen Spesifikasi Teknis
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
          
          {/* Section 1: Box Antiair & Lingkungan */}
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
              <Box className="w-4 h-4" />
              <span>Standar Box Elektronik Utama & Perlindungan Cuaca (Halaman 4)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="font-semibold text-slate-200 block">Material & Proteksi Box:</span>
                <p className="text-slate-400 mt-1">
                  Polycarbonate / ABS industrial minimal <strong>IP65</strong> (~400 &times; 300 &times; 200 mm), gasket EPDM/silikon, dan kunci box antitamper.
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="font-semibold text-slate-200 block">Jalur Kabel & Kondensasi:</span>
                <p className="text-slate-400 mt-1">
                  Cable gland <strong>IP68</strong>, breather vent bermembran, silika gel desiccant, serta loop tetesan air (drip loop) pada sambungan.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Komponen Cetak 3D */}
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-sm font-bold text-purple-300 flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              <span>Komponen Cetak 3D CAD EWS & Perangkap Hama (Halaman 5 & 8)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="font-semibold text-slate-200 block">Material Cetak:</span>
                <p className="text-slate-400 mt-1">
                  <strong>ASA</strong> (Pilihan utama) atau <strong>PETG tahan UV</strong>. Filament PLA dilarang untuk luar ruang.
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="font-semibold text-slate-200 block">Ketebalan Dinding:</span>
                <p className="text-slate-400 mt-1">
                  Minimal dinding <strong>3 mm</strong>, infill &ge; 40%, insert ulir kuningan tahan karat.
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="font-semibold text-slate-200 block">Bagian yang Dicetak:</span>
                <p className="text-slate-400 mt-1">
                  Dudukan inclinometer & ADXL345, adaptor corong hama, bracket antena outdoor, pelindung lampu LED UV.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Sistem Daya Surya 30Wp & Baterai VRLA */}
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-sm font-bold text-amber-300 flex items-center gap-2">
              <Sun className="w-4 h-4" />
              <span>Sistem Daya Mandiri Surya & Baterai (Halaman 4 & 7)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="font-semibold text-slate-200 block">Daya Unit EWS (4 Titik):</span>
                <p className="text-slate-400 mt-1">
                  Panel Surya 30 Wp 12V, Baterai VRLA Deep Cycle <strong>12V 20Ah</strong>, Solar Charge Controller PWM 10A, Buck converter 12V ke 5V 5A.
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="font-semibold text-slate-200 block">Daya Unit Perangkap Hama (5 Unit):</span>
                <p className="text-slate-400 mt-1">
                  Panel Surya 30 Wp, Baterai VRLA <strong>12V 12Ah</strong>, Lampu UV 395-405nm ~5W, Blower sentrifugal 12V 15-25W via MOSFET switch.
                </p>
              </div>
            </div>
          </div>

          {/* Section 4: Logika Operasi & Standar Keselamatan */}
          <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Logika Operasi Lokal & Integrasi Notifikasi (Halaman 6 & 13)</span>
            </h4>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Alarm sirine 12V (110-120dB) dan strobo diproses secara lokal oleh pengendali ESP32 sehingga tetap berfungsi saat koneksi seluler/server terputus.</li>
              <li>Data pengukuran yang gagal terkirim akibat gangguan GSM disimpan pada MicroSD 32GB dan disinkronkan otomatis saat sinyal kembali normal.</li>
              <li>Setiap titik EWS terhubung ke Bot Telegram mandiri dengan format peringatan siaga, bahaya, offline, dan laporan berkala harian.</li>
            </ul>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white rounded-xl cursor-pointer"
          >
            Tutup Dokumentasi
          </button>
        </div>
      </div>
    </div>
  );
};
