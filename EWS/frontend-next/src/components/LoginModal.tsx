'use client';
import React, { useState } from 'react';
import { UserAccount } from '../types';
import { api } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import {
  CheckCircle,
  Database,
  KeyRound,
  Loader2,
  Lock,
  Moon,
  Radio,
  Server,
  Shield,
  ShieldAlert,
  Sun,
  User,
} from 'lucide-react';

interface LoginModalProps {
  onLogin: (user: UserAccount, token: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLogin }) => {
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState('admin_bpbd');
  const [password, setPassword] = useState('ews123');
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
        setError(response.message || 'Login gagal, periksa kredensial Anda');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal terhubung ke server backend');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 transition-colors">
        
        {/* Left Branding / System Panel */}
        <div className="md:col-span-5 bg-slate-100 dark:bg-slate-950 p-6 sm:p-7 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Sistem SCADA BPBD
                  </span>
                  <h1 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    Portal EWS Terpadu
                  </h1>
                </div>
              </div>

              {/* Theme toggle directly on login */}
              <button
                type="button"
                onClick={toggleTheme}
                className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                title="Ganti tema terang/gelap"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-5">
              Pusat pengendalian dan pemantauan telemetri 4 Titik Landslide Early Warning System &amp; 5 Unit Perangkap Hama Mandiri Berbasis IoT.
            </p>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <Radio className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Live Telemetri WebSocket (Port 3440)</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Penyimpanan MySQL Relasional</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <Server className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Standar Industri Box Enclosure IP65</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 mt-6 text-[11px] text-slate-500 flex items-center justify-between font-mono">
            <span>Standar BPBD / BMKG</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold">Build v2.4</span>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="md:col-span-7 p-6 sm:p-7 flex flex-col justify-between bg-white dark:bg-slate-900">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Autentikasi Operator
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Masukkan kredensial untuk mengakses kendali lapangan
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Sistem Siap
              </span>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Pengguna (Username)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin_bpbd"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 font-mono transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Kata Sandi (Password)
                  </label>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    Default: ews123
                  </span>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 font-mono transition-colors"
                    required
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-[11px] text-blue-800 dark:text-blue-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>Akun Administrator otomatis terhubung ke database backend.</span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs sm:text-sm rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memverifikasi Akses...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Masuk ke Pusat Kendali</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 text-center">
            Pusat Pengendali Operasi Bencana Tanah Longsor &bull; Server Aktif
          </div>
        </div>
      </div>
    </div>
  );
};
