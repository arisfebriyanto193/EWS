'use client';
import React, { useState, useEffect } from 'react';
import { UserAccount, PestTrapNode } from '../types';
import { useTheme } from '../context/ThemeContext';
import {
  Bug,
  LayoutDashboard,
  User,
  Moon,
  Sun,
  LogOut,
  LogIn,
  Clock,
  X,
  Zap,
  Activity,
  Layers,
} from 'lucide-react';
import { formatWIB } from '../utils/date';

interface SidebarProps {
  currentUser: UserAccount | null;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
  pestTraps: PestTrapNode[];
  wsStatus?: 'connected' | 'connecting' | 'disconnected';
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onRequireLogin?: (notice?: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  activeTab,
  onSelectTab,
  onLogout,
  pestTraps = [],
  wsStatus = 'connected',
  isOpenMobile,
  onCloseMobile,
  onRequireLogin,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(formatWIB(now, true));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleNavClick = (tab: string) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const totalTraps = pestTraps.length;
  const activeTraps = pestTraps.filter((t) => t.status !== 'mati').length;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-white dark:bg-[#0b0f19] border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand / Logo Header */}
        <div className="h-16 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Bug className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight leading-none">
                  PERANGKAP HAMA
                </h1>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-semibold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50">
                  IOT
                </span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Pusat Kendali Fototaksis
              </span>
            </div>
          </div>

          {/* Mobile Close Button */}
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Clock & Node Quick Stats */}
        <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
            <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            <span>{currentTime || 'Memuat...'}</span>
          </div>
          <div className="flex items-center gap-1">
            <span
              className={`w-2 h-2 rounded-full ${
                wsStatus === 'connected'
                  ? 'bg-emerald-500'
                  : wsStatus === 'connecting'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">
              {wsStatus}
            </span>
          </div>
        </div>

        {/* Navigation Menus */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Main Navigation */}
          <div>
            <div className="px-3 mb-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Menu Utama
            </div>
            <nav className="space-y-1">
              <button
                onClick={() => handleNavClick('pest-traps')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'pest-traps' || activeTab === 'overview'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Bug className="w-4 h-4" />
                  <span>Dashboard Perangkap</span>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    activeTab === 'pest-traps' || activeTab === 'overview'
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {activeTraps}/{totalTraps}
                </span>
              </button>

              <button
                onClick={() => handleNavClick('account-settings')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'account-settings'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                <User className="w-4 h-4" />
                <span>Pengaturan Akun</span>
              </button>
            </nav>
          </div>

          {/* Node Traps Quick Switcher */}
          <div>
            <div className="px-3 mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Daftar Perangkat
              </span>
              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                {pestTraps.length} unit
              </span>
            </div>

            <div className="space-y-1">
              {pestTraps.map((trap) => (
                <div
                  key={trap.id}
                  onClick={() => handleNavClick('pest-traps')}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-xs bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        trap.status !== 'mati' ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                    <span className="font-semibold text-slate-800 dark:text-white">
                      {trap.name || trap.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    <span>{trap.batteryVoltage?.toFixed(1) || '12.6'}V</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                        trap.mode === 'otomatis'
                          ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40'
                          : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/40'
                      }`}
                    >
                      {trap.mode || 'auto'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Settings & User Auth */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0f172a] shrink-0 space-y-2">
          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              {theme === 'dark' ? <Moon className="w-4 h-4 text-blue-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
              <span>Mode Tampilan</span>
            </div>
            <span className="text-[10px] font-mono capitalize px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {theme}
            </span>
          </button>

          {/* User Section */}
          {currentUser ? (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="truncate">
                <div className="text-xs font-bold text-slate-800 dark:text-white truncate">
                  {currentUser.fullName || currentUser.username}
                </div>
                <div className="text-[10px] text-blue-600 dark:text-blue-400 capitalize">
                  {currentUser.role}
                </div>
              </div>
              <button
                onClick={onLogout}
                className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                title="Keluar"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onRequireLogin?.('Silakan login untuk mengakses fitur administrasi.')}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Login Petugas</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
