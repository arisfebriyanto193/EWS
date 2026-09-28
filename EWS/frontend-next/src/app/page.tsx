'use client';

import dynamic from 'next/dynamic';

const EWSApp = dynamic(() => import('@/components/EWSApp'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-slate-300">Memuat Sistem EWS & IoT Telemetri...</p>
      </div>
    </div>
  ),
});

export default function HomePage() {
  return <EWSApp />;
}
