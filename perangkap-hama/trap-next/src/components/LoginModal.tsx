'use client';
import React, { useState } from 'react';
import { api } from '../services/api';
import { UserAccount } from '../types';
import { useTheme } from '../context/ThemeContext';
import { Lock, Eye, EyeOff, Loader2, ShieldAlert, Bug, X, Moon, Sun, ArrowLeft } from 'lucide-react';

interface LoginModalProps {
  onLogin?: (user: UserAccount, token: string) => void;
  onLoginSuccess?: (user: UserAccount) => void;
  notice?: string;
  onClose?: () => void;
  isOverlay?: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  onLogin,
  onLoginSuccess,
  notice,
  onClose,
  isOverlay = false,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.login(username, password);
      if (res && res.token && res.user) {
        localStorage.setItem('trap_token', res.token);
        localStorage.setItem('trap_user', JSON.stringify(res.user));
        if (onLogin) onLogin(res.user, res.token);
        if (onLoginSuccess) onLoginSuccess(res.user);
        if (onClose) onClose();
      } else {
        setError('Otentikasi gagal. Respon dari server tidak valid.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(
        err.message || 'Gagal terhubung ke gateway pusat. Periksa username dan password.'
      );
    } finally {
      setLoading(false);
    }
  };

  const setCredentials = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError('');
  };

  const modalContent = (
    <div className="w-full max-w-md bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-6 sm:p-8 transition-all relative">
      {/* Tombol Close / Batal jika dipanggil sebagai overlay */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Tutup & kembali ke monitoring"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Header */}
      <div className="text-center mb-5">
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60 shadow-xs mb-3">
          <Bug className="w-5 h-5" />
        </div>
        <div className="inline-block px-2.5 py-0.5 mb-1.5 rounded-full bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60 text-[11px] font-semibold tracking-wide uppercase">
          Pusat Kendali Perangkap Hama IoT
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          Otorisasi &amp; Akses Petugas
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Masuk untuk konfigurasi blower, lampu spektrum &amp; jadwal otomatis
        </p>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 rounded-lg text-blue-800 dark:text-blue-200 text-xs flex items-center gap-2.5 shadow-xs">
          <Lock className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <span className="font-medium leading-relaxed">{notice}</span>
        </div>
      )}

      {/* Quick Role Fillers */}
      <div className="mb-4 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block px-1 mb-1.5">
          Pilihan Akses Cepat:
        </span>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setCredentials('admin_trap', 'trap123')}
            className={`px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer border ${
              username === 'admin_trap'
                ? 'bg-blue-50 dark:bg-blue-950/80 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 font-semibold'
                : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <div className="font-medium text-[11px]">Superadmin</div>
            <div className="text-[10px] text-slate-400 font-mono">admin_trap</div>
          </button>
          <button
            type="button"
            onClick={() => setCredentials('operator_trap01', 'trap123')}
            className={`px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer border ${
              username === 'operator_trap01'
                ? 'bg-blue-50 dark:bg-blue-950/80 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 font-semibold'
                : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <div className="font-medium text-[11px]">Operator Pos 1</div>
            <div className="text-[10px] text-slate-400 font-mono">operator_trap01</div>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
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
            className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-mono"
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
              className="w-full pl-3.5 pr-10 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors p-1 cursor-pointer"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-sm rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium cursor-pointer transition-colors"
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
        className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 selection:bg-blue-600 selection:text-white"
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
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50 dark:bg-[#0b0f19] relative selection:bg-blue-600 selection:text-white transition-colors duration-200">
      {/* Theme Toggle Button */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-5 right-5 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
        title="Ganti tema visual"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-600" />}
      </button>

      {modalContent}
    </div>
  );
};
