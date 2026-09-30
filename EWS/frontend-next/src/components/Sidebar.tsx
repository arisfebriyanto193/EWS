'use client';
import React, { useState, useEffect } from 'react';
import { UserAccount, EWSNode, AlarmLog } from '../types';
import { useTheme } from '../context/ThemeContext';
import {
  LayoutDashboard,
  Radio,
  Activity,
  User,
  Layers,
  Plus,
  Moon,
  Sun,
  LogOut,
  Clock,
  Shield,
  X,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';

interface SidebarProps {
  currentUser: UserAccount;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
  onOpenDocs: () => void;
  ewsNodes: EWSNode[];
  alarmLogs?: AlarmLog[];
  wsStatus?: 'connected' | 'connecting' | 'disconnected';
  onAddEwsClick?: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  activeTab,
  onSelectTab,
  onLogout,
  onOpenDocs,
  ewsNodes,
  alarmLogs = [],
  wsStatus = 'connected',
  onAddEwsClick,
  isOpenMobile,
  onCloseMobile,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }) + ' WIB'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const isOperator = currentUser.role.startsWith('operator_');
  const assignedEws = currentUser.assignedEwsId;

  // Hitung alarm belum di-acknowledge
  const pendingAlarmCount = alarmLogs.filter((a) => !a.acknowledged).length;

  const handleNavClick = (tab: string) => {
    onSelectTab(tab);
    onCloseMobile();
  };

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
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand / Logo Header */}
        <div className="h-16 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight leading-none">
                EWS MONITORING
              </h1>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Pusdalops Kebencanaan
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

        {/* Live Status Strip (WS & Jam) */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                wsStatus === 'connected'
                  ? 'bg-emerald-500'
                  : wsStatus === 'connecting'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-red-500'
              }`}
            />
            <span className="text-slate-600 dark:text-slate-400 font-medium">
              {wsStatus === 'connected'
                ? 'WS: Terhubung'
                : wsStatus === 'connecting'
                ? 'WS: Menyambung'
                : 'WS: Terputus'}
            </span>
          </div>

          <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>{currentTime}</span>
          </div>
        </div>

        {/* Navigation Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Group 1: Menu Utama */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
              Menu Utama
            </div>

            {/* Overview / Ringkasan */}
            {!isOperator && (
              <button
                onClick={() => handleNavClick('overview')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'overview'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard
                    className={`w-4 h-4 ${
                      activeTab === 'overview'
                        ? 'text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  />
                  <span>Dashboard Ringkasan</span>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    activeTab === 'overview'
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {ewsNodes.length} Titik
                </span>
              </button>
            )}

            {/* Riwayat Alarm */}
            <button
              onClick={() => handleNavClick('alarm-history')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'alarm-history'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Activity
                  className={`w-4 h-4 ${
                    activeTab === 'alarm-history'
                      ? 'text-white'
                      : 'text-amber-500'
                  }`}
                />
                <span>Riwayat Alarm</span>
              </div>
              {pendingAlarmCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">
                  {pendingAlarmCount}
                </span>
              )}
            </button>
          </div>

          {/* Group 2: Titik Pantau EWS */}
          <div className="space-y-1">
            <div className="px-3 flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
              <span>Perangkat EWS</span>
              {onAddEwsClick && currentUser.role === 'superadmin' && (
                <button
                  type="button"
                  onClick={() => {
                    onAddEwsClick();
                    onCloseMobile();
                  }}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 cursor-pointer"
                  title="Tambah Titik EWS Baru"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {ewsNodes.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-slate-400 italic">
                Belum ada titik terdaftar
              </div>
            ) : (
              ewsNodes.map((ews) => {
                const isAssigned = isOperator && assignedEws === ews.id;
                const isSelected = activeTab === ews.id;

                const statusColor =
                  ews.status === 'bahaya'
                    ? 'bg-red-500'
                    : ews.status === 'siaga'
                    ? 'bg-amber-500'
                    : ews.status === 'offline'
                    ? 'bg-slate-400'
                    : 'bg-emerald-500';

                return (
                  <button
                    key={ews.id}
                    onClick={() => handleNavClick(ews.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : isAssigned
                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Radio
                        className={`w-4 h-4 shrink-0 ${
                          isSelected
                            ? 'text-white'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                      <span className="truncate">{ews.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span
                        className={`w-2 h-2 rounded-full ${statusColor} ${
                          ews.status === 'bahaya' ? 'animate-pulse' : ''
                        }`}
                        title={`Status: ${ews.status}`}
                      />
                      <ChevronRight
                        className={`w-3 h-3 ${
                          isSelected ? 'text-white' : 'text-slate-400'
                        }`}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Group 3: Akun & Konfigurasi Sistem */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
              Pengaturan & Akun
            </div>

            {/* Menu Akun Baru */}
            <button
              onClick={() => handleNavClick('account-settings')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'account-settings'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <User
                  className={`w-4 h-4 ${
                    activeTab === 'account-settings'
                      ? 'text-white'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                <span>Pengaturan Akun</span>
              </div>
              <Shield
                className={`w-3.5 h-3.5 ${
                  activeTab === 'account-settings' ? 'text-white' : 'text-slate-400'
                }`}
              />
            </button>

            {/* Dokumen Teknis */}
            <button
              onClick={() => {
                onOpenDocs();
                onCloseMobile();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
            >
              <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Dokumen Teknis & CAD</span>
            </button>
          </div>
        </div>

        {/* Footer / User Strip */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-200">
                <img
                  src={
                    currentUser.avatarUrl ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      currentUser.fullName
                    )}&background=2563eb&color=fff`
                  }
                  alt={currentUser.fullName}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="truncate text-left leading-tight">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                  {currentUser.fullName}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {isOperator ? `Pos ${assignedEws}` : 'Superadmin'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Dark / Light Toggle */}
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title={
                  theme === 'dark'
                    ? 'Ganti ke Mode Terang'
                    : 'Ganti ke Mode Gelap'
                }
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-600" />
                )}
              </button>

              {/* Logout */}
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors cursor-pointer"
                title="Keluar dari sistem"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
