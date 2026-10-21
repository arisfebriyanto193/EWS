'use client';
import React from 'react';
import { UserAccount } from '../types';
import {
  Menu,
  Bug,
  User,
  LogIn,
  Zap,
} from 'lucide-react';

interface HeaderProps {
  currentUser: UserAccount | null;
  activeTab: string;
  wsStatus?: 'connected' | 'connecting' | 'disconnected';
  onOpenMobileMenu: () => void;
  onRequireLogin?: (notice?: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activeTab,
  wsStatus = 'connected',
  onOpenMobileMenu,
  onRequireLogin,
}) => {
  let title = 'Monitoring & Kontrol Perangkap Hama IoT';
  let Icon = Bug;
  let subtitle = 'Fototaksis Spektrum UV, Kendali Blower Suction & Daya Solar Cell';

  if (activeTab === 'account-settings') {
    title = 'Pengaturan Akun & Otoritas';
    Icon = User;
    subtitle = 'Kelola profil peneliti/operator dan kredensial akses';
  }

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#110e1f]/95 backdrop-blur-xs border-b border-slate-200 dark:border-purple-950/40 transition-colors duration-150">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Mobile Menu Trigger + Breadcrumb Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenMobileMenu}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 cursor-pointer"
              aria-label="Buka Menu Navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight leading-tight line-clamp-1">
                    {title}
                  </h2>
                  <span
                    className={`text-[10px] px-2 py-0.2 rounded-full font-semibold uppercase font-mono ${
                      wsStatus === 'connected'
                        ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                        : wsStatus === 'connecting'
                        ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
                        : 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                    }`}
                  >
                    {wsStatus === 'connected' ? 'Live Telemetry' : wsStatus}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-purple-300/70 hidden sm:block line-clamp-1">
                  {subtitle}
                </p>
              </div>
            </div>
          </div>

          {/* Right: User State / Quick Action */}
          <div className="flex items-center gap-2">
            {!currentUser ? (
              <button
                type="button"
                onClick={() => onRequireLogin?.('Silakan login untuk mengatur parameter perangkap hama.')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Login Petugas</span>
                <span className="xs:hidden">Login</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1a152e] border border-slate-200 dark:border-purple-950/50">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-slate-700 dark:text-purple-200">
                  {currentUser.fullName || currentUser.username}
                </span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  {currentUser.role}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
