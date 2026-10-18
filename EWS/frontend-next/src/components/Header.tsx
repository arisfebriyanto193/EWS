'use client';
import React, { useState } from 'react';
import { UserAccount, EWSNode } from '../types';
import {
  Menu,
  ShieldAlert,
  Volume2,
  VolumeX,
  Radio,
  Activity,
  LayoutDashboard,
  User,
  Plus,
  Bug,
  GraduationCap,
  AlertTriangle,
  LogIn,
} from 'lucide-react';
import { TriggerCauseModal } from './TriggerCauseModal';

interface HeaderProps {
  currentUser: UserAccount | null;
  activeTab: string;
  activeEws?: EWSNode;
  onOpenMobileMenu: () => void;
  anySirenActive: boolean;
  activeSirenNodes: EWSNode[];
  globalMute: boolean;
  onToggleMute: () => void;
  onAddEwsClick?: () => void;
  onRequireLogin?: (notice?: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activeTab,
  activeEws,
  onOpenMobileMenu,
  anySirenActive,
  activeSirenNodes,
  globalMute,
  onToggleMute,
  onAddEwsClick,
  onRequireLogin,
}) => {
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const activeTriggerNode = activeSirenNodes[0] || activeEws;

  // Breadcrumb / Title mapping
  let title = 'Dashboard Ringkasan Multi-Node';
  let Icon = LayoutDashboard;
  let subtitle = 'Pusat telemetri sensor kestabilan lereng & deteksi dini bencana';

  if (activeTab === 'alarm-history') {
    title = 'Riwayat Insiden & Log Mitigasi';
    Icon = Activity;
    subtitle = 'Catatan ambang batas sensor, aktivasi sirine, dan tindakan operator';
  } else if (activeTab === 'account-settings') {
    title = 'Konfigurasi Akun & Otoritas';
    Icon = User;
    subtitle = 'Data profil peneliti/operator lapangan dan keamanan akses';
  } else if (activeTab === 'pest-traps') {
    title = 'Monitoring Perangkap Hama IoT';
    Icon = Bug;
    subtitle = 'Kendali fototaksis LED UV, status daya surya, dan perhitungan serangga';
  } else if (activeEws) {
    title = activeEws.name;
    Icon = Radio;
    subtitle = `${activeEws.location} \u2022 Koordinat: ${activeEws.coordinates?.lat ?? '-'}, ${activeEws.coordinates?.lng ?? '-'}`;
  }

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#110e1f]/95 backdrop-blur-xs border-b border-slate-200 dark:border-purple-950/40 transition-colors duration-150">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Mobile Menu Trigger + Academic Breadcrumb Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenMobileMenu}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 cursor-pointer"
              aria-label="Buka Menu Navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/70 border border-purple-200 dark:border-purple-900/60 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight leading-tight line-clamp-1">
                    {title}
                  </h2>
                  {activeEws && (
                    <span
                      className={`text-[10px] px-2 py-0.2 rounded-full font-semibold uppercase font-mono ${
                        activeEws.status === 'bahaya'
                          ? 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900'
                          : activeEws.status === 'siaga'
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
                          : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                      }`}
                    >
                      {activeEws.status}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-purple-300/70 hidden sm:block line-clamp-1">
                  {subtitle}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Quick Actions */}
          <div className="flex items-center gap-2">
            {/* Quick Add EWS Button on Overview */}
            {activeTab === 'overview' && onAddEwsClick && currentUser?.role === 'superadmin' && (
              <button
                type="button"
                onClick={onAddEwsClick}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 active:scale-[0.98] text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Registrasi Titik Baru</span>
              </button>
            )}

            {/* Quick Login Button jika belum login */}
            {!currentUser && (
              <button
                type="button"
                onClick={() => onRequireLogin?.('Silakan login untuk mengakses konfigurasi dan wewenang petugas.')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 active:scale-[0.98] text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Login Petugas</span>
                <span className="xs:hidden">Login</span>
              </button>
            )}

            {/* Emergency Siren Mute & Trigger Detail Buttons */}
            {anySirenActive && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onToggleMute}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  {globalMute ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  <span>{globalMute ? 'Buka Suara Sirine' : 'Senyapkan Sirine'}</span>
                </button>

                {activeTriggerNode && (
                  <button
                    onClick={() => setIsTriggerModalOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    title="Lihat rincian sensor pemicu bahaya"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Sensor Pemicu</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Persistent Alarm Banner if any Siren is active */}
      {activeSirenNodes.length > 0 && (
        <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between text-xs font-bold shadow-md">
          <div className="flex items-center gap-2 truncate">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span className="truncate">
              PERINGATAN BAHAYA: Sirine 12V 110dB Aktif di {activeSirenNodes.map((e) => e.name).join(', ')}!
              {activeSirenNodes[0]?.alarmReason && (
                <span className="font-normal opacity-90 ml-1.5 hidden md:inline">
                  &bull; Penyebab: {activeSirenNodes[0].alarmReason}
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {activeTriggerNode && (
              <button
                onClick={() => setIsTriggerModalOpen(true)}
                className="px-2.5 py-1 rounded bg-white text-red-700 hover:bg-slate-100 text-[11px] font-bold border border-white/60 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <AlertTriangle className="w-3 h-3 text-red-600" />
                <span>Sensor Pemicu</span>
              </button>
            )}
            <button
              onClick={onToggleMute}
              className="px-2.5 py-1 rounded bg-red-950/80 hover:bg-red-900 text-[11px] font-semibold border border-red-300/30 transition-colors cursor-pointer"
            >
              {globalMute ? 'Buka Suara' : 'Senyapkan'}
            </button>
          </div>
        </div>
      )}

      {/* Sensor Trigger Cause Detail Modal */}
      {activeTriggerNode && (
        <TriggerCauseModal
          ews={activeTriggerNode}
          isOpen={isTriggerModalOpen}
          onClose={() => setIsTriggerModalOpen(false)}
          onToggleMute={onToggleMute}
        />
      )}
    </header>
  );
};
