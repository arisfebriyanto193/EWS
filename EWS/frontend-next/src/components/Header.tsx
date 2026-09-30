'use client';
import React from 'react';
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
} from 'lucide-react';

interface HeaderProps {
  currentUser: UserAccount;
  activeTab: string;
  activeEws?: EWSNode;
  onOpenMobileMenu: () => void;
  anySirenActive: boolean;
  activeSirenNodes: EWSNode[];
  globalMute: boolean;
  onToggleMute: () => void;
  onAddEwsClick?: () => void;
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
}) => {
  // Breadcrumb / Title mapping
  let title = 'Ringkasan Sistem';
  let Icon = LayoutDashboard;
  let subtitle = 'Monitoring seluruh titik pantau dan telemetri multi-node';

  if (activeTab === 'alarm-history') {
    title = 'Riwayat Alarm & Mitigasi';
    Icon = Activity;
    subtitle = 'Log catatan darurat, pemicu sensor, dan konfirmasi operator';
  } else if (activeTab === 'account-settings') {
    title = 'Pengaturan Akun & Keamanan';
    Icon = User;
    subtitle = 'Profil petugas operasional dan pembaruan kata sandi';
  } else if (activeEws) {
    title = activeEws.name;
    Icon = Radio;
    subtitle = `${activeEws.location} (${activeEws.coordinates?.lat ?? '-'}, ${activeEws.coordinates?.lng ?? '-'})`;
  }

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Mobile Menu Trigger + Breadcrumb Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenMobileMenu}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Buka Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight leading-tight line-clamp-1">
                  {title}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block line-clamp-1">
                  {subtitle}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Quick Actions */}
          <div className="flex items-center gap-2">
            {/* Quick Add EWS Button on Overview */}
            {activeTab === 'overview' && onAddEwsClick && currentUser.role === 'superadmin' && (
              <button
                type="button"
                onClick={onAddEwsClick}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Titik</span>
              </button>
            )}

            {/* Emergency Siren Mute Button */}
            {anySirenActive && (
              <button
                onClick={onToggleMute}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors animate-pulse cursor-pointer"
              >
                {globalMute ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{globalMute ? 'Unmute Sirine' : 'Mute Sirine'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Persistent Alarm Banner if any Siren is active */}
      {activeSirenNodes.length > 0 && (
        <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between text-xs font-bold shadow-md">
          <div className="flex items-center gap-2 truncate">
            <ShieldAlert className="w-4 h-4 shrink-0 animate-bounce" />
            <span className="truncate">
              PERINGATAN BAHAYA: Sirine 12V 110dB Aktif di {activeSirenNodes.map((e) => e.name).join(', ')}!
            </span>
          </div>
          <button
            onClick={onToggleMute}
            className="shrink-0 ml-2 px-2 py-0.5 rounded bg-red-950/80 hover:bg-red-900 text-[11px] font-semibold border border-red-300/30"
          >
            {globalMute ? 'Buka Suara' : 'Senyapkan'}
          </button>
        </div>
      )}
    </header>
  );
};
