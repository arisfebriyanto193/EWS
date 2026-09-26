import React, { useState, useEffect } from 'react';
import { EWSNode, TelegramConfig } from '../types';
import { api } from '../services/api';
import {
  AlertCircle,
  Bell,
  Bot,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Radio,
  Send,
  Shield,
  X,
} from 'lucide-react';

interface TelegramConfigModalProps {
  ews: EWSNode;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedConfig: TelegramConfig) => void;
}

export const TelegramConfigModal: React.FC<TelegramConfigModalProps> = ({
  ews,
  isOpen,
  onClose,
  onSave,
}) => {
  const [config, setConfig] = useState<TelegramConfig>({ ...ews.telegramConfig });
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testLog, setTestLog] = useState<{ status: 'idle' | 'success' | 'failed'; message: string; payload?: string }>({
    status: 'idle',
    message: '',
  });

  // Sinkronisasi data ketika modal dibuka atau data EWS diperbarui dari backend
  useEffect(() => {
    if (isOpen && ews?.telegramConfig) {
      setConfig({ ...ews.telegramConfig });
      setTestLog({ status: 'idle', message: '' });
      setSaveError(null);
      setSaveSuccess(false);
      setIsSaving(false);
    }
  }, [isOpen, ews.id, ews.telegramConfig]);

  if (!isOpen) return null;

  const handleToggle = (key: keyof TelegramConfig) => {
    setConfig((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleTestNotification = async () => {
    const trimmedToken = config.botToken ? config.botToken.trim() : '';
    const trimmedChatId = config.chatId ? config.chatId.trim() : '';

    setIsTesting(true);
    setTestLog({ status: 'idle', message: 'Menghubungkan ke API Telegram Bot & mengirim pesan...' });

    try {
      const payload: { botToken?: string; chatId?: string } = {};
      if (trimmedToken) payload.botToken = trimmedToken;
      if (trimmedChatId) payload.chatId = trimmedChatId;

      const res = await api.testTelegramConfig(ews.id, payload);

      setIsTesting(false);
      setTestLog({
        status: 'success',
        message: res.message || `Berhasil terkirim ke Telegram! Periksa obrolan bot Anda.`,
      });

      const updatedTime = res.lastTestTime || new Date().toLocaleTimeString('id-ID');
      setConfig((prev) => ({
        ...prev,
        lastTestStatus: 'success',
        lastTestTime: updatedTime,
      }));
    } catch (err: any) {
      setIsTesting(false);
      setTestLog({
        status: 'failed',
        message: err.message || 'Gagal mengirim pesan uji ke Telegram Bot',
      });
      setConfig((prev) => ({
        ...prev,
        lastTestStatus: 'failed',
      }));
    }
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(false);

    const cleanConfig: TelegramConfig = {
      ...config,
      ewsId: ews.id,
      botToken: config.botToken ? config.botToken.trim() : '',
      chatId: config.chatId ? config.chatId.trim() : '',
      channelName: config.channelName ? config.channelName.trim() : `Saluran ${ews.name}`,
    };

    setIsSaving(true);
    try {
      // 1. Simpan langsung ke endpoint database MySQL backend
      await api.updateTelegramConfig(ews.id, cleanConfig);

      // 2. Kirim update ke state parent (React)
      onSave(cleanConfig);

      // 3. Tampilkan feedback sukses
      setSaveSuccess(true);
      setIsSaving(false);

      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err: any) {
      setIsSaving(false);
      setSaveError(err.message || 'Gagal menyimpan konfigurasi Telegram ke database backend');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-colors">
        
        {/* Header */}
        <div className="p-5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Konfigurasi Bot Telegram Mandiri - {ews.id}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {ews.name}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Setiap titik EWS memiliki bot dan saluran grup Telegram independen untuk notifikasi real-time.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-sm">
          
          {/* Main Credentials */}
          <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-slate-800 dark:text-white font-semibold text-xs uppercase tracking-wider">
                <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Kredensial &amp; Saluran Bot</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-slate-500 dark:text-slate-400">Status Notifikasi:</span>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={() => handleToggle('enabled')}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 relative"></div>
                <span className={`text-xs font-semibold ${config.enabled ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
                  {config.enabled ? 'AKTIF' : 'NONAKTIF'}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Telegram Bot Token ({ews.id})
                </label>
                <input
                  type="text"
                  value={config.botToken}
                  onChange={(e) => setConfig({ ...config, botToken: e.target.value })}
                  placeholder="Contoh: 123456789:ABCdefGhIJKlmnoPQRstuv..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Dibuat via @BotFather khusus titik ini</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Target Chat ID / Group ID
                </label>
                <input
                  type="text"
                  value={config.chatId}
                  onChange={(e) => setConfig({ ...config, chatId: e.target.value })}
                  placeholder="Contoh: -1001928374650 atau @GrupWargaEWS"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">ID grup relawan posko atau saluran broadcast</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Nama Saluran / Label Pos Pemantauan
              </label>
              <input
                type="text"
                value={config.channelName}
                onChange={(e) => setConfig({ ...config, channelName: e.target.value })}
                placeholder="Contoh: Saluran Warga Rawan Longsor Zona Pasir Madu"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Trigger Alert Checkboxes */}
          <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-slate-800 dark:text-white font-semibold text-xs uppercase tracking-wider pb-2 border-b border-slate-200 dark:border-slate-800">
              <Bell className="w-4 h-4 text-amber-500" />
              <span>Parameter Notifikasi Otomatis</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notifySiaga}
                  onChange={() => handleToggle('notifySiaga')}
                  className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">Status SIAGA</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Peringatan pergerakan tanah awal / curah hujan tinggi</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notifyBahaya}
                  onChange={() => handleToggle('notifyBahaya')}
                  className="mt-0.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <div>
                  <span className="font-semibold text-red-600 dark:text-red-400">Status BAHAYA (Kritis)</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Sirine lokal 12V berbunyi, pergerakan tanah ekstrem</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notifyOffline}
                  onChange={() => handleToggle('notifyOffline')}
                  className="mt-0.5 rounded border-slate-300 text-slate-600 focus:ring-slate-500"
                />
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Perangkat OFFLINE</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Hilang kontak &gt; 15 menit via SIMCom 4G LTE</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notifyBateraiLemah}
                  onChange={() => handleToggle('notifyBateraiLemah')}
                  className="mt-0.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                />
                <div>
                  <span className="font-semibold text-orange-600 dark:text-orange-400">Baterai Lemah (&lt; 11.8 V)</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Daya solar 30Wp / aki VRLA 12V kritis</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notifySensorGagal}
                  onChange={() => handleToggle('notifySensorGagal')}
                  className="mt-0.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="font-semibold text-purple-600 dark:text-purple-400">Gangguan Sensor RS485</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Modbus timeout pada Inclinometer / Soil probe</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.dailyReport}
                  onChange={() => handleToggle('dailyReport')}
                  className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Laporan Berkala Harian</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Ringkasan kondisi 24 jam setiap jam 07:00 WIB</p>
                </div>
              </label>
            </div>
          </div>

          {/* Test Notification Section */}
          <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-semibold text-xs text-slate-800 dark:text-white uppercase tracking-wider">
                  Pengujian Integrasi Bot
                </span>
              </div>
              <button
                type="button"
                onClick={handleTestNotification}
                disabled={isTesting || !config.enabled}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isTesting ? (
                  <>
                    <Radio className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengirim...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Kirim Uji Notifikasi</span>
                  </>
                )}
              </button>
            </div>

            {testLog.status === 'success' && (
              <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{testLog.message}</span>
                </div>
              </div>
            )}

            {testLog.status === 'failed' && (
              <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-lg space-y-2">
                <div className="flex items-start gap-2 text-rose-700 dark:text-rose-400 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span>{testLog.message}</span>
                    <p className="text-[11px] font-normal text-rose-600 dark:text-rose-300">
                      💡 <b>Panduan Mengatasi:</b><br />
                      1. Pastikan Bot Token diambil dari <b>@BotFather</b> secara lengkap.<br />
                      2. Pastikan Anda sudah membuka bot tersebut di Telegram dan menekan tombol <b>/start</b>.<br />
                      3. Jika mengirim ke Grup, pastikan Bot sudah diundang ke dalam grup tersebut dan diatur sebagai Admin.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span>Uji terakhir:</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">{config.lastTestTime || 'Belum pernah'}</span>
            {saveError && (
              <span className="text-rose-600 dark:text-rose-400 font-medium ml-2">⚠️ {saveError}</span>
            )}
            {saveSuccess && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium ml-2 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Tersimpan!
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 self-end">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-xs font-medium text-white rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Konfigurasi</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
