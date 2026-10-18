'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useEWS } from '@/context/EWSContext';
import { EWSDashboardSingle } from '@/components/EWSDashboardSingle';
import { Radio } from 'lucide-react';

export default function EWSIndexPage() {
  const router = useRouter();
  const {
    ewsNodes,
    currentUser,
    handleUpdateEws,
    handleTriggerAlarm,
    handleResetAlarm,
    openLoginModal,
  } = useEWS();

  const activeEws = ewsNodes[0];

  if (!activeEws) {
    return (
      <div className="p-8 text-center bg-white dark:bg-[#141122] rounded-xl border border-slate-200 dark:border-purple-900/40">
        <p className="text-sm text-slate-500">Memuat data stasiun EWS...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quick Node Selector Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs font-semibold text-slate-500 dark:text-purple-300/70 shrink-0">
          Pilih Titik Pantau:
        </span>
        {ewsNodes.map((node) => (
          <button
            key={node.id}
            type="button"
            onClick={() => router.push(`/ews/${node.id}`)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              node.id === activeEws.id
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-white dark:bg-[#141122] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-purple-900/40 hover:bg-purple-50 dark:hover:bg-purple-950/40'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>{node.id}</span>
            <span
              className={`w-2 h-2 rounded-full ${
                node.status === 'bahaya'
                  ? 'bg-red-500 animate-pulse'
                  : node.status === 'siaga'
                  ? 'bg-amber-500'
                  : node.status === 'offline'
                  ? 'bg-slate-400'
                  : 'bg-emerald-500'
              }`}
            />
          </button>
        ))}
      </div>

      <EWSDashboardSingle
        key={activeEws.id}
        ews={activeEws}
        currentUser={currentUser}
        onUpdateEws={handleUpdateEws}
        onTriggerAlarm={handleTriggerAlarm}
        onResetAlarm={handleResetAlarm}
        onRequireLogin={openLoginModal}
      />
    </div>
  );
}
