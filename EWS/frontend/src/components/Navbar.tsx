import React, { useState, useEffect } from 'react';
import { UserAccount, EWSNode } from '../types';
import {
  Radio,
  LogOut,
  Clock,
  Shield,
  Send,
  Layers,
  FileText,
  Bug,
  Activity,
  Menu,
  X,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface NavbarProps {
  currentUser: UserAccount;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
  onOpenDocs: () => void;
  ewsNodes: EWSNode[];
  wsStatus?: 'connected' | 'connecting' | 'disconnected';
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  onSelectTab,
  onLogout,
  onOpenDocs,
  ewsNodes,
  wsStatus = 'connected',
}) => {
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
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & title */}
          <div className="flex items-center gap-3">
            <div
              onClick={() => onSelectTab(isOperator && assignedEws ? assignedEws : 'overview')}
              className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-cyan-600/30 cursor-pointer"
            >
              <Radio className="w-5 h-5 animate-pulse" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Landslide EWS Monitoring
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                  4 TITIK LANDSLIDE EWS
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Sistem Monitoring 4 Titik EWS &amp; Bot Telegram Mandiri
              </p>
            </div>
          </div>

          {/* Center / Right controls */}
          <div className="flex items-center gap-3">
            {/* WebSocket Status Indicator */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  wsStatus === 'connected'
                    ? 'bg-emerald-400 animate-pulse'
                    : wsStatus === 'connecting'
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-red-400'
                }`}
              />
              <span
                className={
                  wsStatus === 'connected'
                    ? 'text-emerald-300'
                    : wsStatus === 'connecting'
                    ? 'text-amber-300'
                    : 'text-red-300'
                }
              >
                {wsStatus === 'connected' ? 'WS: Live (3440)' : wsStatus === 'connecting' ? 'WS: Menyambung' : 'WS: Terputus'}
              </span>
            </div>

            {/* Clock */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-cyan-400">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{currentTime}</span>
            </div>

            {/* Engineering specs button */}
            <button
              onClick={onOpenDocs}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors cursor-pointer"
              title="Buka Dokumen Spesifikasi Teknis, Box IP65 & CAD 3D"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Spesifikasi 3D</span>
            </button>

            {/* Current user badge */}
            <div className="flex items-center gap-2 pl-2 sm:border-l sm:border-slate-800">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-cyan-500/50 shrink-0">
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.fullName}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="hidden sm:block text-left text-xs leading-tight">
                <span className="font-semibold text-slate-200 block truncate max-w-[130px]">
                  {currentUser.fullName}
                </span>
                <span className="text-[10px] text-cyan-400 block truncate max-w-[130px]">
                  {isOperator ? `Pos Pantau ${assignedEws}` : 'Superadmin BPBD'}
                </span>
              </div>

              {/* Logout button */}
              <button
                onClick={onLogout}
                className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-950/40 transition-colors cursor-pointer ml-1"
                title="Keluar dari sistem"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <div className="hidden lg:flex items-center space-x-1 py-2 border-t border-slate-800 text-xs font-medium overflow-x-auto">
          {/* If superadmin, can view overview */}
          {!isOperator && (
            <button
              onClick={() => onSelectTab('overview')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-cyan-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Ringkasan 4 Titik EWS
            </button>
          )}

          {/* Individual EWS dashboards */}
          {ewsNodes.map((ews) => {
            const isAssigned = isOperator && assignedEws === ews.id;
            const isSelected = activeTab === ews.id;

            return (
              <button
                key={ews.id}
                onClick={() => onSelectTab(ews.id)}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-600 text-white font-semibold'
                    : isAssigned
                    ? 'text-cyan-300 hover:bg-slate-800 font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span>Dashboard {ews.id}</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    ews.status === 'bahaya'
                      ? 'bg-red-500 animate-ping'
                      : ews.status === 'siaga'
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                />
              </button>
            );
          })}

          {/* Alarm History Tab */}
          <button
            onClick={() => onSelectTab('alarm-history')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'alarm-history'
                ? 'bg-amber-600 text-white font-semibold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>Riwayat Alarm &amp; Mitigasi</span>
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-3 border-t border-slate-800 space-y-1 text-xs">
            {!isOperator && (
              <button
                onClick={() => {
                  onSelectTab('overview');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg ${
                  activeTab === 'overview' ? 'bg-cyan-600 text-white' : 'text-slate-300'
                }`}
              >
                Ringkasan 4 Titik EWS
              </button>
            )}

            {ewsNodes.map((ews) => (
              <button
                key={ews.id}
                onClick={() => {
                  onSelectTab(ews.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between ${
                  activeTab === ews.id ? 'bg-cyan-600 text-white' : 'text-slate-300'
                }`}
              >
                <span>Dashboard {ews.id} ({ews.name})</span>
                <span className="text-[10px] uppercase font-mono">{ews.status}</span>
              </button>
            ))}

            <button
              onClick={() => {
                onSelectTab('alarm-history');
                setMobileMenuOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg ${
                activeTab === 'alarm-history' ? 'bg-amber-600 text-white' : 'text-slate-300'
              }`}
            >
              Riwayat Alarm &amp; Mitigasi
            </button>

            <button
              onClick={() => {
                onOpenDocs();
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800"
            >
              Spesifikasi 3D CAD &amp; IP65
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
