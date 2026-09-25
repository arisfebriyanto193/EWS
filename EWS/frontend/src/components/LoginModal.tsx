import React, { useState } from 'react';
import { UserAccount } from '../types';
import { api } from '../services/api';
import { ShieldAlert, ShieldCheck, Lock, User, Radio, KeyRound, Loader2, Sparkles } from 'lucide-react';

interface LoginModalProps {
  onLogin: (user: UserAccount, token: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLogin }) => {
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
        // Simpan sesi ke localStorage
        localStorage.setItem('ews_token', response.token);
        localStorage.setItem('ews_user', JSON.stringify(response.user));
        onLogin(response.user, response.token);
      } else {
        setError(response.message || 'Login gagal');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal terhubung ke server backend');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-cyan-950/50 overflow-hidden grid grid-cols-1 md:grid-cols-12 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Left hero / branding panel */}
        <div className="md:col-span-5 bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-950 p-6 sm:p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-700/80 relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-56 h-56 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold text-xl">
                <Radio className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
                  Portal Sistem Terpadu
                </span>
                <h1 className="text-base font-bold text-white leading-tight">
                  Pusat Monitoring Landslide EWS
                </h1>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              Pusat monitoring telemetri 4 Titik Landslide Early Warning System (EWS) secara terpusat, presisi, dan real-time berbasis IoT WebSocket.
            </p>

            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/60">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Autentikasi Terenkripsi JWT</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/60">
                <Radio className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>WebSocket Live Streaming (Port 3440)</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/60">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Database MySQL Relasional</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 mt-6 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Standar IP65 / VRLA 12V</span>
            <span className="font-mono text-cyan-400">Firmware v2.4.1</span>
          </div>
        </div>

        {/* Right login form panel */}
        <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white">Masuk Administrator</h2>
                <p className="text-xs text-slate-400">
                  Gunakan kredensial akun untuk mengakses pusat kendali
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                API Online
              </span>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-700/60 rounded-xl text-red-200 text-xs flex items-center gap-2 animate-in fade-in">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  ID Pengguna (Username)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin_bpbd"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 flex justify-between">
                  <span>Kata Sandi (Password)</span>
                  <span className="text-[11px] text-cyan-400 font-mono">Default: ews123</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="p-3 bg-cyan-950/40 border border-cyan-800/40 rounded-xl text-[11px] text-cyan-200 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  Akun Administrator terintegrasi dengan database MySQL. Cukup klik tombol di bawah untuk langsung masuk.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-cyan-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memverifikasi Akun...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Masuk ke Dashboard</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="mt-6 pt-3 border-t border-slate-800 text-[11px] text-slate-400 text-center">
            Pusat Data Mitigasi Bencana Tanah Longsor &bull; Terhubung ke WebSocket Port 3440
          </div>
        </div>
      </div>
    </div>
  );
};
