'use client';

import React, { use } from 'react';
import { useRouter } from 'next/navigation';
import { useEWS } from '@/context/EWSContext';
import { EWSDashboardSingle } from '@/components/EWSDashboardSingle';
import { Radio, AlertCircle } from 'lucide-react';

export default function EWSSinglePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const {
    ewsNodes,
    currentUser,
    handleUpdateEws,
    handleTriggerAlarm,
    handleResetAlarm,
    openLoginModal,
  } = useEWS();

  const activeEws =
    ewsNodes.find((e) => e.id.toLowerCase() === id.toLowerCase()) ||
    ewsNodes.find((e) => e.id === id);

  if (!activeEws) {
    return (
      <div className="p-8 text-center bg-white dark:bg-[#141122] rounded-xl border border-slate-200 dark:border-purple-900/40 space-y-4">
        <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
          Titik Pantau &quot;{id}&quot; Tidak Ditemukan
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Titik EWS ini mungkin belum didaftarkan atau telah dihapus dari sistem.
        </p>
        <button
          type="button"
          onClick={() => router.push('/ews')}
          className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold cursor-pointer"
        >
          Lihat Stasiun EWS yang Tersedia
        </button>
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
