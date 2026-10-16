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
  Bug,
  GraduationCap,
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
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-white dark:bg-[#110e1f] border-r border-slate-200 dark:border-purple-950/40 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand / Academic Logo Header */}
        <div className="h-16 px-4 border-b border-slate-200 dark:border-purple-950/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-700 text-white flex items-center justify-center font-bold shadow-xs">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight leading-none">
                  EWS GEOTEKNIK
                </h1>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-semibold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                  LAB
                </span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-purple-300/70 font-medium">
                Pusat Mitigasi &amp; Telemetri
              </span>
            </div>
          </div>

          {/* Mobile Close Button */}
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-purple-50 dark:hover:bg-purple-950/50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Status Strip (WS & Jam) */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-[#0c0a15] border-b border-slate-200 dark:border-purple-950/40 flex items-center justify-between text-[11px] font-mono shrink-0">
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
            <span className="text-slate-600 dark:text-purple-200/80 font-medium text-[10.5px]">
              {wsStatus === 'connected'
                ? 'Gateway Aktif'
                : wsStatus === 'connecting'
                ? 'Sinkronisasi...'
                : 'Offline'}
            </span>
          </div>

          <div className="flex items-center gap-1 text-slate-500 dark:text-purple-300/70">
            <Clock className="w-3 h-3 text-slate-400 dark:text-purple-400/60" />
            <span className="text-[10.5px]">{currentTime}</span>
          </div>
        </div>

        {/* Navigation Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {/* Group 1: Menu Utama */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold text-slate-400 dark:text-purple-300/60 uppercase tracking-wider mb-2">
              Menu Utama &bull; Laboratorium
            </div>

            {/* Overview / Ringkasan */}
            {!isOperator && (
              <button
                onClick={() => handleNavClick('overview')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  activeTab === 'overview'
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-700 dark:hover:text-purple-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard
                    className={`w-4 h-4 ${
                      activeTab === 'overview'
                        ? 'text-white'
                        : 'text-purple-600 dark:text-purple-400'
                    }`}
                  />
                  <span>Dashboard Ringkasan</span>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    activeTab === 'overview'
                      ? 'bg-purple-800 text-purple-100'
                      : 'bg-slate-100 dark:bg-[#1a162b] text-slate-600 dark:text-purple-300'
                  }`}
                >
                  {ewsNodes.length} Titik
                </span>
              </button>
            )}

            {/* Riwayat Alarm */}
            <button
              onClick={() => handleNavClick('alarm-history')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'alarm-history'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-700 dark:hover:text-purple-300'
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
                <span>Riwayat Insiden &amp; Alarm</span>
              </div>
              {pendingAlarmCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white">
                  {pendingAlarmCount}
                </span>
              )}
            </button>

            {/* Perangkap Hama IoT */}
            <button
              onClick={() => handleNavClick('pest-traps')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'pest-traps'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-700 dark:hover:text-purple-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Bug
                  className={`w-4 h-4 ${
                    activeTab === 'pest-traps'
                      ? 'text-white'
                      : 'text-emerald-500'
                  }`}
                />
                <span>Perangkap Hama IoT</span>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  activeTab === 'pest-traps'
                    ? 'bg-purple-800 text-purple-100'
                    : 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                }`}
              >
                Aktif
              </span>
            </button>
          </div>

          {/* Group 2: Titik Pantau EWS */}
          <div className="space-y-1">
            <div className="px-3 flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-purple-300/60 uppercase tracking-wider mb-2">
              <span>Sensor Lereng Multi-Node</span>
              {onAddEwsClick && currentUser.role === 'superadmin' && (
                <button
                  type="button"
                  onClick={() => {
                    onAddEwsClick();
                    onCloseMobile();
                  }}
                  className="p-1 rounded hover:bg-purple-100 dark:hover:bg-purple-950/80 text-purple-700 dark:text-purple-300 cursor-pointer transition-colors"
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
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-purple-700 text-white shadow-xs'
                        : isAssigned
                        ? 'text-purple-800 dark:text-purple-200 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 hover:bg-purple-100 dark:hover:bg-purple-950/50'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-700 dark:hover:text-purple-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Radio
                        className={`w-4 h-4 shrink-0 ${
                          isSelected
                            ? 'text-white'
                            : 'text-purple-500 dark:text-purple-400'
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
                          isSelected ? 'text-white' : 'text-slate-400 dark:text-purple-400/50'
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
            <div className="px-3 text-[10px] font-bold text-slate-400 dark:text-purple-300/60 uppercase tracking-wider mb-2">
              Konfigurasi &amp; Standar
            </div>

            {/* Menu Akun */}
            <button
              onClick={() => handleNavClick('account-settings')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                activeTab === 'account-settings'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-700 dark:hover:text-purple-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <User
                  className={`w-4 h-4 ${
                    activeTab === 'account-settings'
                      ? 'text-white'
                      : 'text-purple-600 dark:text-purple-400'
                  }`}
                />
                <span>Pengaturan Akun Petugas</span>
              </div>
              <Shield
                className={`w-3.5 h-3.5 ${
                  activeTab === 'account-settings' ? 'text-white' : 'text-slate-400'
                }`}
              />
            </button>

            {/* Dokumen Teknis & CAD */}
            <button
              onClick={() => {
                onOpenDocs();
                onCloseMobile();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-700 dark:hover:text-purple-300 transition-all duration-150 cursor-pointer"
            >
              <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Dokumen Riset &amp; 3D CAD</span>
            </button>
          </div>
        </div>

        {/* Footer / User Strip */}
        <div className="p-3 border-t border-slate-200 dark:border-purple-950/40 bg-slate-50 dark:bg-[#0c0a15] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-purple-200 dark:border-purple-800/80 shrink-0 bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                {currentUser.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                    {currentUser.fullName.charAt(0)}
                  </span>
                )}
              </div>

              <div className="truncate text-left leading-tight">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                  {currentUser.fullName}
                </div>
                <div className="text-[10px] text-purple-700 dark:text-purple-300/80 font-medium truncate">
                  {isOperator ? `Pos Pantau ${assignedEws}` : 'Peneliti / Superadmin'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Dark / Light Toggle */}
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-lg text-slate-600 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-950/60 transition-colors cursor-pointer"
                title={
                  theme === 'dark'
                    ? 'Ganti ke Mode Terang'
                    : 'Ganti ke Mode Gelap'
                }
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-purple-700" />
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
