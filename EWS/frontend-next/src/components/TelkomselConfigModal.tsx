'use client';
import React, { useState } from 'react';
import { EWSNode, TelkomselConfig } from '../types';
import { api } from '../services/api';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Globe,
  Loader2,
  MapPin,
  PieChart,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Trash2,
  Wifi,
  X,
  Zap,
} from 'lucide-react';

interface TelkomselConfigModalProps {
  ews: EWSNode;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedConfig: TelkomselConfig) => void;
}

export const TelkomselConfigModal: React.FC<TelkomselConfigModalProps> = ({
  ews,
  isOpen,
  onClose,
  onSave,
}) => {
  const currentConfig: TelkomselConfig = ews.telkomselConfig || {
    ewsId: ews.id,
    phoneNumber: '',
    msisdn: '',
    balance: 0,
    balanceUnit: 'IDR',
    expiredDate: null,
    subscriptionType: 'PraBayar',
    quotaData: null,
    lastSyncedAt: null,
    isConnected: false,
  };

  const [config, setConfig] = useState<TelkomselConfig>(currentConfig);
  const [phoneNumberInput, setPhoneNumberInput] = useState(currentConfig.phoneNumber || '');
  const [otpInput, setOtpInput] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>(
    currentConfig.isConnected ? 'phone' : 'phone'
  );

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Sync state when ews changes
  React.useEffect(() => {
    if (ews.telkomselConfig) {
      setConfig(ews.telkomselConfig);
      setPhoneNumberInput(ews.telkomselConfig.phoneNumber || '');
    }
  }, [ews]);

  if (!isOpen) return null;

  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanNumber = phoneNumberInput.trim().replace(/[-\s]/g, '');
    if (!cleanNumber) {
      setMessage({ type: 'error', text: 'Nomor HP Telkomsel wajib diisi.' });
      return;
    }

    setIsLoading(true);
    setMessage(null);
    try {
      const res = await api.requestTelkomselOtp(ews.id, cleanNumber);
      setMessage({
        type: 'success',
        text: res.message || `Kode OTP berhasil dikirimkan via SMS ke ${cleanNumber}. Silakan periksa SMS masuk.`,
      });
      setStep('otp');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Gagal mengirimkan kode OTP.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanNumber = phoneNumberInput.trim().replace(/[-\s]/g, '');
    const cleanOtp = otpInput.trim();

    if (!cleanOtp) {
      setMessage({ type: 'error', text: 'Masukkan 6 digit kode OTP.' });
      return;
    }

    setIsLoading(true);
    setMessage(null);
    try {
      const res = await api.verifyTelkomselOtp(ews.id, cleanNumber, cleanOtp);
      setConfig(res.telkomselConfig);
      onSave(res.telkomselConfig);
      setMessage({
        type: 'success',
        text: 'Login Telkomsel berhasil! Kuota dan pulsa langsung tersinkronisasi.',
      });
      setOtpInput('');
      setStep('phone');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Verifikasi OTP gagal.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setMessage(null);
    try {
      const res = await api.refreshTelkomselQuota(ews.id);
      setConfig(res.telkomselConfig);
      onSave(res.telkomselConfig);
      setMessage({
        type: 'success',
        text: 'Informasi kuota & pulsa berhasil disegarkan secara realtime.',
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Gagal menyegarkan kuota dari server Telkomsel.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Yakin ingin memutuskan koneksi kartu Telkomsel untuk ${ews.id}?`)) {
      return;
    }

    setIsDeleting(true);
    setMessage(null);
    try {
      await api.deleteTelkomselConfig(ews.id);
      const emptyConfig: TelkomselConfig = {
        ewsId: ews.id,
        phoneNumber: '',
        msisdn: '',
        balance: 0,
        balanceUnit: 'IDR',
        expiredDate: null,
        subscriptionType: 'PraBayar',
        quotaData: null,
        lastSyncedAt: null,
        isConnected: false,
      };
      setConfig(emptyConfig);
      onSave(emptyConfig);
      setPhoneNumberInput('');
      setStep('phone');
      setMessage({
        type: 'info',
        text: 'Konfigurasi Telkomsel berhasil dihapus.',
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Gagal menghapus konfigurasi Telkomsel.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const quota = config.quotaData;
  const primaryQuota = quota?.primaryQuota || { remaining: '0 GB', total: '0 GB', percent: 0 };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-colors">
        
        {/* Header with Telkomsel Red Accent */}
        <div className="p-5 bg-gradient-to-r from-red-600 to-rose-700 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center text-white shadow-inner">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">
                  Monitoring SIM & Kuota Telkomsel
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/20 text-white font-semibold">
                  {ews.id}
                </span>
              </div>
              <p className="text-xs text-red-100 font-medium">
                Modem 4G LTE SIMCom A7670C &bull; {ews.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`px-5 py-3 text-xs flex items-center gap-2 border-b ${
              message.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : message.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            )}
            <span className="flex-1 font-medium">{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {config.isConnected ? (
            /* ================= STATE 1: SUDAH TERHUBUNG ================= */
            <div className="space-y-6">
              {/* Account Quick Info Card */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center font-bold text-sm">
                    T
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {config.phoneNumber || config.msisdn}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                        {quota?.brand || 'TELKOMSEL'}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {config.subscriptionType || 'PraBayar'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3 mt-1">
                      {quota?.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {quota.location}
                        </span>
                      )}
                      {config.lastSyncedAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          Disinkron: {new Date(config.lastSyncedAt).toLocaleTimeString('id-ID')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-red-600' : ''}`} />
                    <span>{isRefreshing ? 'Menyinkronkan...' : 'Segarkan'}</span>
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900 transition-colors cursor-pointer"
                    title="Putuskan & Hapus Konfigurasi"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Status Metric Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Sisa Pulsa Card */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 dark:border-amber-500/30 flex flex-col justify-between relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Coins className="w-4 h-4" />
                      Sisa Pulsa
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 font-semibold">
                      {config.balanceUnit || 'IDR'}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      Rp {Number(config.balance || 0).toLocaleString('id-ID')}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>
                        Masa aktif s/d:{' '}
                        <strong className="text-slate-700 dark:text-slate-300">
                          {config.expiredDate || '-'}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sisa Kuota Data Card */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-red-600/10 via-red-600/5 to-transparent border border-red-600/20 dark:border-red-600/30 flex flex-col justify-between relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Wifi className="w-4 h-4" />
                      Kuota Internet Utama
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-600/20 text-red-800 dark:text-red-300 font-semibold">
                      {primaryQuota.percent}% Sisa
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      {primaryQuota.remaining}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Total Paket: {primaryQuota.total}</span>
                    </div>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-red-500 to-rose-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, primaryQuota.percent))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Detail Paket & Kuota Breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <PieChart className="w-3.5 h-3.5 text-red-500" />
                  Rincian Paket & Kuota Aktif
                </h4>

                {quota?.quotaGroups && quota.quotaGroups.length > 0 ? (
                  <div className="space-y-2">
                    {quota.quotaGroups.map((group, idx) => {
                      const hasItems = group.items && group.items.length > 0;
                      if (!hasItems && (group.totalRemaining === '0 GB' || group.totalRemaining === '0 Min' || !group.totalRemaining)) return null;

                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 transition-all"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                              <Globe className="w-3.5 h-3.5 text-slate-400" />
                              {group.label}
                            </span>
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {group.totalRemaining} {group.totalQuota ? `/ ${group.totalQuota}` : ''}
                            </span>
                          </div>

                          {hasItems ? (
                            <div className="space-y-1.5 mt-2 border-t border-slate-200 dark:border-slate-800/80 pt-2">
                              {group.items.map((item, itemIdx) => (
                                <div
                                  key={itemIdx}
                                  className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                                >
                                  <div>
                                    <span className="font-medium text-slate-800 dark:text-slate-200">
                                      {item.name}
                                    </span>
                                    {item.expiryDate && (
                                      <p className="text-[10px] text-slate-400">
                                        Berlaku s/d {item.expiryDate}
                                      </p>
                                    )}
                                  </div>
                                  <span className="font-mono font-bold text-red-600 dark:text-red-400">
                                    {item.remaining}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400 italic">Tidak ada paket aktif</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 text-center text-xs text-slate-500">
                    Tidak ada rincian paket data tambahan yang ditemukan.
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ================= STATE 2: BELUM TERHUBUNG / FORM LOGIN ================= */
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 flex items-start gap-3">
                <Zap className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs text-red-900 dark:text-red-200 space-y-1">
                  <p className="font-bold">Hubungkan Nomor Telkomsel Alat Ini</p>
                  <p className="text-red-700 dark:text-red-300">
                    Masukkan nomor kartu SIM Telkomsel yang terpasang pada modul SIMCom A7670C di titik {ews.name}.
                    Sistem akan mengirimkan 6 digit kode OTP via SMS untuk otentikasi resmi ke API Telkomsel.
                  </p>
                </div>
              </div>

              {step === 'phone' ? (
                /* Step 1: Input No HP */
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Nomor HP Telkomsel Kartu IoT / Modem
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-sm font-semibold pointer-events-none">
                        +62
                      </span>
                      <input
                        type="tel"
                        placeholder="82246637292 atau 0822..."
                        value={phoneNumberInput}
                        onChange={(e) => setPhoneNumberInput(e.target.value)}
                        className="w-full pl-12 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                        autoFocus
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Pastikan modem menyala dan dapat menerima pesan SMS kode masuk.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Mengirimkan Kode OTP...</span>
                      </>
                    ) : (
                      <>
                        <span>Kirim Kode OTP via SMS</span>
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Step 2: Input 6-Digit OTP */
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        Kode Verifikasi OTP (6 Digit)
                      </label>
                      <button
                        type="button"
                        onClick={() => setStep('phone')}
                        className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                      >
                        Ubah Nomor
                      </button>
                    </div>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="Contoh: 123456"
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-4 py-3 text-center tracking-widest text-2xl font-mono font-extrabold rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                      autoFocus
                    />
                    <p className="text-[11px] text-slate-400 mt-1 text-center">
                      Kode telah dikirim ke nomor <strong>{phoneNumberInput}</strong> via SMS.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleRequestOtp}
                      disabled={isLoading}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Kirim Ulang OTP</span>
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || otpInput.length < 4}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Verifikasi...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Verifikasi & Simpan</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            Terhubung ke API Resmi MyTelkomsel CIAM & TDW
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
