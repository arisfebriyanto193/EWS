'use client';
import React, { useState } from 'react';
import { EWSNode } from '../types';
import {
  AlertTriangle,
  Battery,
  RotateCcw,
  Send,
  ShieldAlert,
  Sliders,
  WifiOff,
} from 'lucide-react';

interface SimulationControlsProps {
  ewsNodes: EWSNode[];
  onTriggerScenario: (ewsId: string, scenario: 'siaga' | 'bahaya' | 'offline' | 'baterai_lemah' | 'reset') => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  ewsNodes,
  onTriggerScenario,
}) => {
  const [selectedEwsId, setSelectedEwsId] = useState(ewsNodes[0]?.id || 'EWS-01');
  const [simToast, setSimToast] = useState<{ title: string; desc: string; type: string } | null>(null);

  const handleSimulate = (scenario: 'siaga' | 'bahaya' | 'offline' | 'baterai_lemah' | 'reset') => {
    onTriggerScenario(selectedEwsId, scenario);

    const targetEws = ewsNodes.find((e) => e.id === selectedEwsId);
    const targetName = targetEws ? targetEws.name : selectedEwsId;

    if (scenario === 'bahaya') {
      setSimToast({
        title: `Bahaya: Sirine 12V 110dB Aktif di ${targetName}`,
        desc: `Telegram Bot terkirim: Peringatan Utama Bahaya Longsor di ${targetName}!`,
        type: 'danger',
      });
    } else if (scenario === 'siaga') {
      setSimToast({
        title: `Status Siaga Dipicu pada ${targetName}`,
        desc: `Telegram Bot mengirim notifikasi peringatan parameter kemiringan > 1.5°.`,
        type: 'warning',
      });
    } else if (scenario === 'offline') {
      setSimToast({
        title: `Sinyal GSM Terputus pada ${targetName}`,
        desc: `ESP32 beralih menyimpan log ke MicroSD 32GB. Bot Telegram memberi tahu status offline.`,
        type: 'offline',
      });
    } else if (scenario === 'baterai_lemah') {
      setSimToast({
        title: `Baterai Kritis (<11.8V) pada ${targetName}`,
        desc: `Low Voltage Disconnect siaga. Bot Telegram mengirim peringatan daya surya 30Wp.`,
        type: 'warning',
      });
    } else {
      setSimToast({
        title: `Status ${targetName} Dikembalikan Normal (Aman)`,
        desc: `Sensor stabil, sirine padam, dan bot mengirim notifikasi Normal Kembali.`,
        type: 'success',
      });
    }

    setTimeout(() => {
      setSimToast(null);
    }, 6000);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs transition-colors">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>Simulator Pengujian Lapangan &amp; Uji Penerimaan Sistem</span>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 font-normal">(Dokumen Teknis Hal. 6 &amp; 12)</span>
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Uji respons sirine lokal, perubahan nilai sensor, dan pengiriman notifikasi otomatis Telegram Bot mandiri.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Target selector */}
          <select
            value={selectedEwsId}
            onChange={(e) => setSelectedEwsId(e.target.value)}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {ewsNodes.map((e) => (
              <option key={e.id} value={e.id}>
                Target: {e.id} ({e.name.split('-')[1]?.trim() || e.name})
              </option>
            ))}
          </select>

          {/* Trigger scenario buttons */}
          <button
            onClick={() => handleSimulate('siaga')}
            className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            title="Simulasikan hujan deras & kemiringan > 1.5°"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Picu Siaga</span>
          </button>

          <button
            onClick={() => handleSimulate('bahaya')}
            className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
            title="Simulasikan pergerakan tanah ekstrem & aktifkan sirine 12V"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-white" />
            <span>Picu Bahaya (Sirine)</span>
          </button>

          <button
            onClick={() => handleSimulate('offline')}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            title="Simulasikan hilangnya jaringan seluler GSM"
          >
            <WifiOff className="w-3.5 h-3.5 text-slate-500" />
            <span>Simulasi Offline</span>
          </button>

          <button
            onClick={() => handleSimulate('baterai_lemah')}
            className="px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/60 dark:hover:bg-orange-900/60 border border-orange-300 dark:border-orange-800 text-orange-800 dark:text-orange-300 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            title="Simulasikan tegangan aki drop < 11.8V"
          >
            <Battery className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            <span>Aki Drop</span>
          </button>

          <button
            onClick={() => handleSimulate('reset')}
            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            title="Kembalikan nilai sensor ke kondisi aman"
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Reset Normal</span>
          </button>
        </div>
      </div>

      {/* Toast Alert Simulation */}
      {simToast && (
        <div
          className={`mt-3 p-3 rounded-lg border flex items-start gap-2.5 text-xs animate-in slide-in-from-top-2 duration-200 ${
            simToast.type === 'danger'
              ? 'bg-red-50 dark:bg-red-950/80 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
              : simToast.type === 'warning'
              ? 'bg-amber-50 dark:bg-amber-950/80 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : simToast.type === 'offline'
              ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200'
              : 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
          }`}
        >
          <Send className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
          <div className="flex-1">
            <span className="font-bold block">{simToast.title}</span>
            <span className="text-[11px] opacity-90">{simToast.desc}</span>
          </div>
        </div>
      )}
    </div>
  );
};
