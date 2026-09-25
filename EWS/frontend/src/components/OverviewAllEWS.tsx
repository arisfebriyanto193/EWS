import React from 'react';
import { EWSNode } from '../types';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Battery,
  Bot,
  CheckCircle,
  Compass,
  Droplets,
  MapPin,
  Radio,
  Send,
  Shield,
  ShieldAlert,
  Sun,
  Volume2,
} from 'lucide-react';

interface OverviewAllEWSProps {
  ewsNodes: EWSNode[];
  onSelectEws: (ewsId: string) => void;
  onOpenTelegramConfig: (ews: EWSNode) => void;
}

export const OverviewAllEWS: React.FC<OverviewAllEWSProps> = ({
  ewsNodes,
  onSelectEws,
  onOpenTelegramConfig,
}) => {
  const safeCount = ewsNodes.filter((e) => e.status === 'aman').length;
  const siagaCount = ewsNodes.filter((e) => e.status === 'siaga').length;
  const dangerCount = ewsNodes.filter((e) => e.status === 'bahaya').length;
  const offlineCount = ewsNodes.filter((e) => e.status === 'offline').length;

  return (
    <div className="space-y-6">
      {/* Top Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Status Aman</span>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{safeCount} Titik</div>
            <span className="text-[11px] text-slate-500">Normal terkendali</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-400 flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Status Siaga</span>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{siagaCount} Titik</div>
            <span className="text-[11px] text-slate-500">Waspada lereng</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-800 text-amber-400 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Status Bahaya</span>
            <div className="text-2xl font-bold font-mono text-red-400 mt-1">{dangerCount} Titik</div>
            <span className="text-[11px] text-slate-500">Sirine aktif lokal</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-800 text-red-400 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Bot Telegram Mandiri</span>
            <div className="text-2xl font-bold font-mono text-sky-400 mt-1">4 / 4 Aktif</div>
            <span className="text-[11px] text-slate-500">Tiap titik punya bot</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-950/80 border border-sky-800 text-sky-400 flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Grid of 4 EWS Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Radio className="w-5 h-5 text-cyan-400" />
              <span>Daftar 4 Titik Landslide Early Warning System (EWS)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Pilih salah satu titik untuk membuka dashboard mandiri masing-masing EWS
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ewsNodes.map((ews) => {
            const isBahaya = ews.status === 'bahaya';
            const isSiaga = ews.status === 'siaga';

            return (
              <div
                key={ews.id}
                className={`bg-slate-900/90 rounded-2xl border p-5 transition-all shadow-xl hover:shadow-cyan-950/40 relative overflow-hidden flex flex-col justify-between ${
                  isBahaya
                    ? 'border-red-600 bg-red-950/20'
                    : isSiaga
                    ? 'border-amber-600/80 bg-amber-950/15'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  {/* Card top */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                          {ews.id}
                        </span>
                        <h4 className="text-sm font-bold text-white">{ews.name}</h4>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                        <span className="truncate">{ews.location}</span>
                      </p>
                    </div>

                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0 border ${
                        isBahaya
                          ? 'bg-red-950 text-red-300 border-red-600 animate-pulse'
                          : isSiaga
                          ? 'bg-amber-950 text-amber-300 border-amber-600'
                          : 'bg-emerald-950 text-emerald-300 border-emerald-700'
                      }`}
                    >
                      {ews.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Sensor highlights */}
                  <div className="grid grid-cols-3 gap-2 my-4">
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                        <Compass className="w-3 h-3 text-cyan-400" />
                        Kemiringan
                      </span>
                      <div className="text-sm font-mono font-bold text-white mt-1">
                        {ews.sensorData.pitchAngle}° / {ews.sensorData.rollAngle}°
                      </div>
                    </div>

                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                        <Droplets className="w-3 h-3 text-teal-400" />
                        Hujan / Jam
                      </span>
                      <div className="text-sm font-mono font-bold text-teal-300 mt-1">
                        {ews.sensorData.rainfallRate} mm
                      </div>
                    </div>

                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                        <Battery className="w-3 h-3 text-amber-400" />
                        Baterai VRLA
                      </span>
                      <div className="text-sm font-mono font-bold text-amber-300 mt-1">
                        {ews.sensorData.batteryVoltage} V
                      </div>
                    </div>
                  </div>

                  {/* Telegram channel info */}
                  <div className="p-2.5 bg-slate-950/40 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs mb-4">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Send className="w-3.5 h-3.5 text-sky-400" />
                      <span className="truncate max-w-[200px]">{ews.telegramConfig.channelName}</span>
                    </div>
                    <button
                      onClick={() => onOpenTelegramConfig(ews)}
                      className="text-[11px] font-medium text-sky-400 hover:text-sky-300 underline cursor-pointer"
                    >
                      Konfigurasi Bot
                    </button>
                  </div>
                </div>

                {/* Bottom CTA to view dedicated dashboard */}
                <button
                  onClick={() => onSelectEws(ews.id)}
                  className="w-full py-2.5 px-4 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-200 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer group"
                >
                  <span>Buka Dashboard Mandiri {ews.id}</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Map Visualizer */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-cyan-400" />
              <span>Peta Topografi &amp; Koordinat 4 Titik Landslide EWS</span>
            </h3>
            <p className="text-xs text-slate-400">
              Distribusi geografis pemantauan lereng mitigasi bencana tanah longsor bertenaga surya 30Wp
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              EWS Aman
            </span>
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              EWS Siaga
            </span>
            <span className="flex items-center gap-1.5 text-red-400">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              EWS Bahaya
            </span>
          </div>
        </div>

        {/* Map Canvas Illustration */}
        <div className="relative h-80 w-full bg-slate-950 rounded-xl border border-slate-800 overflow-hidden p-6 flex flex-col justify-between">
          {/* Topographical contour grid pattern background */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(#38bdf8 1px, transparent 1px), radial-gradient(#0ea5e9 1px, transparent 1px)',
              backgroundSize: '40px 40px',
              backgroundPosition: '0 0, 20px 20px',
            }}
          />

          <div className="relative z-10 flex justify-between text-[11px] font-mono text-slate-500">
            <span>SEKTOR LERENG GUNUNG BUKIT TINGGI</span>
            <span>SKALA 1:5,000 &bull; DATUM WGS-84</span>
          </div>

          {/* Interactive nodes pins */}
          <div className="relative z-10 h-56 w-full">
            {/* EWS Pins */}
            {ewsNodes.map((ews, idx) => {
              // Position strategically across the map area
              const positions = [
                { top: '20%', left: '25%' },
                { top: '45%', left: '60%' },
                { top: '65%', left: '30%' },
                { top: '75%', left: '75%' },
              ];
              const pos = positions[idx] || { top: '50%', left: '50%' };
              const isAmber = ews.status === 'siaga';

              return (
                <div
                  key={ews.id}
                  onClick={() => onSelectEws(ews.id)}
                  style={{ top: pos.top, left: pos.left }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
                >
                  <div className="relative flex items-center justify-center">
                    <span
                      className={`absolute w-8 h-8 rounded-full opacity-75 animate-ping ${
                        isAmber ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                    />
                    <div
                      className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center shadow-lg font-bold text-[9px] text-white ${
                        isAmber ? 'bg-amber-600' : 'bg-emerald-600'
                      }`}
                    >
                      {idx + 1}
                    </div>
                  </div>

                  {/* Tooltip on hover */}
                  <div className="hidden group-hover:block absolute bottom-8 left-1/2 -translate-x-1/2 z-30 min-w-[170px] bg-slate-900 border border-slate-700 p-2.5 rounded-xl shadow-xl text-left">
                    <span className="font-bold text-xs text-white block">{ews.name}</span>
                    <span className="text-[10px] text-slate-400 block">{ews.location}</span>
                    <div className="mt-1 text-[10px] text-cyan-400 font-mono">
                      Kemiringan: {ews.sensorData.pitchAngle}° | Hujan: {ews.sensorData.rainfallRate}mm
                    </div>
                    <span className="text-[9px] text-sky-400 block mt-1 underline">
                      Klik untuk buka dashboard
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative z-10 flex justify-between text-[11px] text-slate-400">
            <span>Elevasi Topografi: 850 - 1,200 mdpl (Zona Rawan Longsor)</span>
            <span>Sensor Inclinometer RS485 &amp; Tipping Bucket Rain Gauge</span>
          </div>
        </div>
      </div>
    </div>
  );
};
