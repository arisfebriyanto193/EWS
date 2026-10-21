'use client';

import React, { useState } from 'react';
import { UserAccount } from '../types';
import { api } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import {
  Eye,
  EyeOff,
  Loader2,
  Moon,
  Shield,
  ShieldAlert,
  Sun,
  GraduationCap,
  Lock,
  X,
  ArrowLeft,
} from 'lucide-react';

interface LoginModalProps {
  onLogin: (user: UserAccount, token: string) => void;
  onClose?: () => void;
  notice?: string;
  isOverlay?: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  onLogin,
  onClose,
  notice,
  isOverlay = false,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState('admin_bpbd');
  const [password, setPassword] = useState('ews123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.login(username.trim(), password);
      if (response.success && response.user) {
        localStorage.setItem('ews_token', response.token);
        localStorage.setItem('ews_user', JSON.stringify(response.user));
        onLogin(response.user, response.token);
      } else {
        setError(response.message || 'Autentikasi gagal. Periksa username dan password.');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal terhubung ke gateway telemetri backend');
    } finally {
      setLoading(false);
    }
  };

  const setCredentials = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setError('');
  };

  const modalContent = (
    <div className="w-full max-w-md bg-white dark:bg-[#141122] border border-slate-200 dark:border-purple-900/40 rounded-2xl shadow-xl p-6 sm:p-8 transition-all relative">
      {/* Tombol Close / Batal jika dipanggil sebagai overlay */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-purple-950/60 transition-colors cursor-pointer"
          title="Tutup & kembali ke monitoring"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Header Akademik */}
      <div className="text-center mb-5">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-700 text-white shadow-sm mb-3">
          <GraduationCap className="w-6 h-6" />
        </div>
        <div className="inline-block px-2.5 py-0.5 mb-1.5 rounded-full bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900/60 text-[11px] font-semibold tracking-wide uppercase">
          Laboratorium Instrumentasi &amp; Geoteknik
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          Otorisasi &amp; Akses Petugas
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Masuk untuk konfigurasi ambang batas, aktuator &amp; pengaturan sistem
        </p>
      </div>

      {/* Notice Banner jika ada aksi konfigurasi yang memicu login */}
      {notice && (
        <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/80 rounded-xl text-purple-800 dark:text-purple-200 text-xs flex items-center gap-2.5 shadow-xs">
          <Lock className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
          <span className="font-medium leading-relaxed">{notice}</span>
        </div>
      )}

      {/* Quick Role Fillers */}
      <div className="mb-4 p-2 rounded-xl bg-slate-50 dark:bg-[#1b172e] border border-slate-200/80 dark:border-purple-900/30">
        <span className="text-[10px] font-semibold text-slate-500 dark:text-purple-300/80 uppercase tracking-wider block px-1 mb-1.5">
          Pilihan Akses Cepat:
        </span>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setCredentials('admin_bpbd', 'ews123')}
            className={`px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer border ${
              username === 'admin_bpbd'
                ? 'bg-purple-100 dark:bg-purple-950/80 border-purple-300 dark:border-purple-700 text-purple-900 dark:text-purple-200 font-semibold'
                : 'bg-white dark:bg-[#141122] border-slate-200 dark:border-purple-900/40 text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/40'
            }`}
          >
            <div className="font-medium text-[11px]">Superadmin</div>
            <div className="text-[10px] text-slate-400 font-mono">admin_bpbd</div>
          </button>
          <button
            type="button"
            onClick={() => setCredentials('operator_ews01', 'ews123')}
            className={`px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer border ${
              username === 'operator_ews01'
                ? 'bg-purple-100 dark:bg-purple-950/80 border-purple-300 dark:border-purple-700 text-purple-900 dark:text-purple-200 font-semibold'
                : 'bg-white dark:bg-[#141122] border-slate-200 dark:border-purple-900/40 text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/40'
            }`}
          >
            <div className="font-medium text-[11px]">Operator Pos 1</div>
            <div className="text-[10px] text-slate-400 font-mono">operator_ews01</div>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form Login */}
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Identitas Pengguna (Username)
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username akun"
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#1a162b] border border-slate-200 dark:border-purple-900/50 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-600/30 focus:border-purple-600 transition-all font-mono"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Kata Sandi (Password)
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Kata sandi"
              className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-[#1a162b] border border-slate-200 dark:border-purple-900/50 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-600/30 focus:border-purple-600 transition-all"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-purple-600 dark:hover:text-purple-300 transition-colors p-1 cursor-pointer"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-2.5 px-4 bg-purple-700 hover:bg-purple-800 active:scale-[0.99] text-white font-semibold text-sm rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Memverifikasi Otorisasi...</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>Masuk &amp; Buka Akses Konfigurasi</span>
            </>
          )}
        </button>
      </form>

      {/* Tombol Lanjut Mode Monitoring jika modal ditutup */}
      {onClose && (
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-purple-900/30 text-center">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-purple-300/70 hover:text-purple-700 dark:hover:text-purple-200 font-medium cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Mode Monitoring (Tamu)</span>
          </button>
        </div>
      )}

      {/* Footer Platform */}
      <div className="mt-4 text-center">
        <p className="text-[10.5px] text-slate-400 dark:text-slate-500">
          Smart Pest Trap IoT Platform &bull; ESP32 &amp; UV Atraktor
        </p>
      </div>
    </div>
  );

  if (isOverlay || onClose) {
    return (
      <div
        className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 selection:bg-purple-700 selection:text-white"
        onClick={(e) => {
          if (e.target === e.currentTarget && onClose) {
            onClose();
          }
        }}
      >
        {modalContent}
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50 dark:bg-[#0c0a15] relative selection:bg-purple-700 selection:text-white transition-colors duration-200">
      {/* Theme Toggle Button */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-5 right-5 p-2 rounded-xl bg-white dark:bg-[#141122] border border-slate-200 dark:border-purple-900/40 text-slate-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors shadow-xs cursor-pointer"
        title="Ganti tema visual"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-purple-700" />}
      </button>

      {modalContent}
    </div>
  );
};
