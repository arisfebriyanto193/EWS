'use client';
import React, { useState, useEffect } from 'react';
import { UserAccount, EWSNode } from '../types';
import { useTheme } from '../context/ThemeContext';
import {
  Activity,
  Bug,
  Clock,
  Layers,
  LogOut,
  Menu,
  Moon,
  Radio,
  ShieldAlert,
  Sun,
  X,
} from 'lucide-react';

interface NavbarProps {
  currentUser: UserAccount;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
  onOpenDocs: () => void;
  ewsNodes: EWSNode[];
  wsStatus?: 'connected' | 'connecting' | 'disconnected';
  onAddEwsClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  onSelectTab,
  onLogout,
  onOpenDocs,
  ewsNodes,
  wsStatus = 'connected',
  onAddEwsClick,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [currentTime, setCurrentTime] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 transition-colors shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Left Brand Identity */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSelectTab(isOperator && assignedEws ? assignedEws : 'overview')}
              className="w-10 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center font-bold shadow-xs transition-colors cursor-pointer"
              title="Kembali ke Ringkasan Sistem"
            >
              <ShieldAlert className="w-5 h-5 text-white" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  PUSDALOPS BPBD &bull; EWS MONITORING
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {ewsNodes.length > 0 ? `${ewsNodes.length} TITIK TERPADU` : 'STANDBY'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Sistem Telemetri Sensor Lapangan, Sirine 110dB &amp; Bot Telegram Mandiri
              </p>
            </div>
          </div>

          {/* Right Controls & Utilities */}
          <div className="flex items-center gap-2.5">
            
            {/* WebSocket Status */}
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px] font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  wsStatus === 'connected'
                    ? 'bg-emerald-500'
                    : wsStatus === 'connecting'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-red-500'
                }`}
              />
              <span className="text-slate-700 dark:text-slate-300">
                {wsStatus === 'connected' ? 'WS: Live' : wsStatus === 'connecting' ? 'WS: Menyambung' : 'WS: Terputus'}
              </span>
            </div>

            {/* Live Clock */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{currentTime}</span>
            </div>

            {/* Dark / Light Mode Switcher */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              title={theme === 'dark' ? 'Ganti ke Mode Terang (Light)' : 'Ganti ke Mode Gelap (Dark)'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>

            {/* Technical Docs Button */}
            <button
              onClick={onOpenDocs}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              title="Spesifikasi Teknis & Box IP65"
            >
              <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Dokumen Teknis</span>
            </button>

            {/* User Profile */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0">
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.fullName}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="hidden sm:block text-left text-xs leading-tight">
                <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate max-w-[120px]">
                  {currentUser.fullName}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate max-w-[120px]">
                  {isOperator ? `Pos ${assignedEws}` : 'Superadmin'}
                </span>
              </div>

              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors cursor-pointer ml-1"
                title="Keluar dari sistem"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="hidden lg:flex items-center space-x-1 py-2 border-t border-slate-200 dark:border-slate-800 text-xs font-medium overflow-x-auto">
          {!isOperator && (
            <button
              onClick={() => onSelectTab('overview')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Ringkasan EWS {ewsNodes.length > 0 ? `(${ewsNodes.length})` : ''}
            </button>
          )}

          {ewsNodes.map((ews) => {
            const isAssigned = isOperator && assignedEws === ews.id;
            const isSelected = activeTab === ews.id;

            return (
              <button
                key={ews.id}
                onClick={() => onSelectTab(ews.id)}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : isAssigned
                    ? 'text-blue-600 dark:text-blue-400 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{ews.id}</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    ews.status === 'bahaya'
                      ? 'bg-red-500 animate-pulse'
                      : ews.status === 'siaga'
                      ? 'bg-amber-500'
                      : ews.status === 'offline'
                      ? 'bg-slate-400'
                      : 'bg-emerald-500'
                  }`}
                />
              </button>
            );
          })}

          {/* Pest Traps Tab */}
          <button
            onClick={() => onSelectTab('pest-traps')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'pest-traps'
                ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Bug className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Perangkap Hama (5 Unit)</span>
          </button>

          {/* Alarm History Tab */}
          <button
            onClick={() => onSelectTab('alarm-history')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'alarm-history'
                ? 'bg-amber-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-amber-500" />
            <span>Riwayat Alarm &amp; Mitigasi</span>
          </button>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-3 border-t border-slate-200 dark:border-slate-800 space-y-1 text-xs">
            {!isOperator && (
              <button
                onClick={() => {
                  onSelectTab('overview');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg font-medium ${
                  activeTab === 'overview'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Ringkasan EWS {ewsNodes.length > 0 ? `(${ewsNodes.length})` : ''}
              </button>
            )}

            {ewsNodes.map((ews) => (
              <button
                key={ews.id}
                onClick={() => {
                  onSelectTab(ews.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between font-medium ${
                  activeTab === ews.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{ews.id} &bull; {ews.name}</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {ews.status}
                </span>
              </button>
            ))}

            <button
              onClick={() => {
                onSelectTab('pest-traps');
                setMobileMenuOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 font-medium ${
                activeTab === 'pest-traps'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Bug className="w-3.5 h-3.5" />
              <span>Perangkap Hama Solar (5 Unit)</span>
            </button>

            <button
              onClick={() => {
                onSelectTab('alarm-history');
                setMobileMenuOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 font-medium ${
                activeTab === 'alarm-history'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Riwayat Alarm &amp; Mitigasi</span>
            </button>

            <button
              onClick={() => {
                onOpenDocs();
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Spesifikasi Teknis &amp; Box IP65</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
