'use client';
import React from 'react';
import { EWSNode } from '../types';
import {
  AlertTriangle,
  ArrowRight,
  Battery,
  Bot,
  CheckCircle,
  Compass,
  Droplets,
  Layers,
  MapPin,
  Plus,
  Radio,
  Send,
  ShieldAlert,
  Trash2,
} from 'lucide-react';

interface OverviewAllEWSProps {
  ewsNodes: EWSNode[];
  onSelectEws: (ewsId: string) => void;
  onOpenTelegramConfig: (ews: EWSNode) => void;
  onAddEwsClick: () => void;
  onDeleteEws?: (ewsId: string) => void;
}

export const OverviewAllEWS: React.FC<OverviewAllEWSProps> = ({
  ewsNodes,
  onSelectEws,
  onOpenTelegramConfig,
  onAddEwsClick,
  onDeleteEws,
}) => {
  const safeCount = ewsNodes.filter((e) => e.status === 'aman').length;
  const siagaCount = ewsNodes.filter((e) => e.status === 'siaga').length;
  const dangerCount = ewsNodes.filter((e) => e.status === 'bahaya').length;
  const telegramActiveCount = ewsNodes.filter((e) => e.telegramConfig && e.telegramConfig.enabled).length;

  return (
    <div className="space-y-6">
      {/* Top Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Safe */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Status Normal</span>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
              {safeCount} <span className="text-xs font-sans font-normal text-slate-500">Titik</span>
            </div>
            <span className="text-[11px] text-slate-400">Lereng stabil</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        {/* Siaga */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Status Waspada</span>
            <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
              {siagaCount} <span className="text-xs font-sans font-normal text-slate-500">Titik</span>
            </div>
            <span className="text-[11px] text-slate-400">Peringatan lereng</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* Bahaya */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Status Bahaya</span>
            <div className="text-2xl font-bold font-mono text-red-600 dark:text-red-400 mt-0.5">
              {dangerCount} <span className="text-xs font-sans font-normal text-slate-500">Titik</span>
            </div>
            <span className="text-[11px] text-slate-400">Sirine aktif otomatis</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        {/* Telegram Bot */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs flex items-center justify-between transition-colors">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Transmisi Bot Telegram</span>
            <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5">
              {telegramActiveCount} / {ewsNodes.length}{' '}
              <span className="text-xs font-sans font-normal text-slate-500">Aktif</span>
            </div>
            <span className="text-[11px] text-slate-400">Bot mandiri per node</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center">
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
              <span>Titik Pemantauan Landslide Early Warning System</span>
              {ewsNodes.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-mono font-medium">
                  {ewsNodes.length} Perangkat Terpasang
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pusat kendali dan telemetri multi-node mitigasi bencana tanah longsor
            </p>
          </div>

          <button
            type="button"
            onClick={onAddEwsClick}
            className="self-start sm:self-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Titik EWS</span>
          </button>
        </div>

        {/* Empty State vs Node Cards */}
        {ewsNodes.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-8 sm:p-12 text-center transition-colors">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-4">
              <Radio className="w-8 h-8" />
            </div>
            <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Belum Ada Titik Pemantauan EWS Terdaftar
            </h4>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto mt-1 mb-6">
              Sistem monitoring saat ini siap menerima perangkat baru. Silakan tambahkan stasiun pemantauan lereng EWS pertama untuk mulai menerima telemetri live, kendali sirine 110dB, dan transmisi Bot Telegram.
            </p>
            <button
              type="button"
              onClick={onAddEwsClick}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Perangkat EWS Sekarang</span>
            </button>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3">
              Tersedia preset cepat lapangan: EWS-01 Lereng Pasir Madu, EWS-02 Tebing Cikadu, EWS-03 Aliran Talaga, EWS-04 Sukamulya.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ewsNodes.map((ews) => {
              const isBahaya = ews.status === 'bahaya';
              const isSiaga = ews.status === 'siaga';

              const statusBadgeClasses = isBahaya
                ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800'
                : isSiaga
                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';

              const cardBorder = isBahaya
                ? 'border-red-400 dark:border-red-800'
                : isSiaga
                ? 'border-amber-400 dark:border-amber-800'
                : 'border-slate-200 dark:border-slate-800';

              return (
                <div
                  key={ews.id}
                  className={`bg-white dark:bg-slate-900 rounded-xl border ${cardBorder} p-5 transition-all shadow-xs flex flex-col justify-between`}
                >
                  <div>
                    {/* Card top */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                            {ews.id}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">{ews.name}</h4>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{ews.location}</span>
                        </p>
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
                            onClick={() => onDeleteEws(ews.id)}
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
                      <div className="bg-slate-50 dark:bg-slate-950/70 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1">
                          <Compass className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          Inclinometer
                        </span>
                        <div className="text-xs sm:text-sm font-mono font-bold text-slate-900 dark:text-white mt-1">
                          {ews.sensorData.pitchAngle}° / {ews.sensorData.rollAngle}°
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-950/70 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1">
                          <Droplets className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                          Curah Hujan
                        </span>
                        <div className="text-xs sm:text-sm font-mono font-bold text-slate-900 dark:text-white mt-1">
                          {ews.sensorData.rainfallRate} <span className="text-[10px] font-normal text-slate-500">mm</span>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-950/70 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1">
                          <Battery className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          Baterai VRLA
                        </span>
                        <div className="text-xs sm:text-sm font-mono font-bold text-slate-900 dark:text-white mt-1">
                          {ews.sensorData.batteryVoltage} <span className="text-[10px] font-normal text-slate-500">V</span>
                        </div>
                      </div>
                    </div>

                    {/* Telegram channel info */}
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-950/50 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs mb-4">
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <Send className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="truncate max-w-[200px] text-[11px] font-mono">
                          {ews.telegramConfig ? ews.telegramConfig.channelName : 'Belum Dikonfigurasi'}
                        </span>
                      </div>
                      <button
                        onClick={() => onOpenTelegramConfig(ews)}
                        className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Konfigurasi Bot
                      </button>
                    </div>
                  </div>

                  {/* Bottom CTA to view dedicated dashboard */}
                  <button
                    onClick={() => onSelectEws(ews.id)}
                    className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer group border border-slate-200 dark:border-slate-700"
                  >
                    <span>Lihat Telemetri &amp; Kendali {ews.id}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Interactive Map Visualizer */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-xs transition-colors">
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
              Distribusi geografis pemantauan lereng mitigasi bencana tanah longsor bertenaga surya 30Wp
            </p>
          </div>
          {ewsNodes.length > 0 && (
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Aman
              </span>
              <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Waspada
              </span>
              <span className="flex items-center gap-1.5 text-red-700 dark:text-red-400">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                Bahaya
              </span>
            </div>
          )}
        </div>

        {/* Map Canvas Illustration */}
        <div className="relative h-72 sm:h-80 w-full bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden p-5 flex flex-col justify-between">
          {/* Topographical grid pattern background */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />

          <div className="relative z-10 flex justify-between text-[10px] sm:text-[11px] font-mono text-slate-500">
            <span>SEKTOR LERENG BUKIT TINGGI &bull; ZONA A-IV</span>
            <span>SKALA 1:5,000 &bull; DATUM WGS-84</span>
          </div>

          {/* Interactive nodes pins or Empty Map State */}
          <div className="relative z-10 h-44 sm:h-52 w-full flex items-center justify-center">
            {ewsNodes.length === 0 ? (
              <div className="text-center p-4 max-w-sm bg-white/80 dark:bg-slate-900/80 backdrop-blur rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <MapPin className="w-6 h-6 text-slate-400 mx-auto mb-2" />
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
                  : 'bg-emerald-600 text-white';

                return (
                  <div
                    key={ews.id}
                    onClick={() => onSelectEws(ews.id)}
                    style={{ top: pos.top, left: pos.left }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
                  >
                    <div className="relative flex items-center justify-center">
                      <span
                        className={`absolute w-7 h-7 rounded-full opacity-60 animate-ping ${
                          isRed ? 'bg-red-500' : isAmber ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                      />
                      <div
                        className={`w-6 h-6 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center shadow-md font-bold text-[10px] ${pinBg}`}
                      >
                        {idx + 1}
                      </div>
                    </div>

                    {/* Tooltip on hover */}
                    <div className="hidden group-hover:block absolute bottom-8 left-1/2 -translate-x-1/2 z-30 min-w-[180px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-lg shadow-lg text-left">
                      <span className="font-bold text-xs text-slate-900 dark:text-white block">{ews.name}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{ews.location}</span>
                      <div className="mt-1 text-[10px] text-blue-600 dark:text-blue-400 font-mono">
                        Kemiringan: {ews.sensorData.pitchAngle}° | Hujan: {ews.sensorData.rainfallRate}mm
                      </div>
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-1 underline">
                        Klik untuk buka telemetri
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="relative z-10 flex justify-between text-[10px] sm:text-[11px] text-slate-500">
            <span>Elevasi: 850 - 1,200 mdpl (Mitigasi Longsor)</span>
            <span>Sensor Inclinometer RS485 &bull; Tipping Bucket Rain Gauge</span>
          </div>
        </div>
      </div>
    </div>
  );
};
