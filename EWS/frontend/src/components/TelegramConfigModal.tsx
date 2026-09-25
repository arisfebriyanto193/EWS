import React, { useState } from 'react';
import { EWSNode, TelegramConfig } from '../types';
import { Send, CheckCircle2, AlertTriangle, MessageSquare, Bot, Bell, Shield, X, Radio } from 'lucide-react';

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
  const [testLog, setTestLog] = useState<{ status: 'idle' | 'success' | 'failed'; message: string; payload?: string }>({
    status: 'idle',
    message: '',
  });

  if (!isOpen) return null;

  const handleToggle = (key: keyof TelegramConfig) => {
    setConfig((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleTestNotification = async () => {
    setIsTesting(true);
    setTestLog({ status: 'idle', message: 'Menghubungkan ke API Telegram Bot...' });

    // Simulate sending actual telegram payload conforming to PDF specifications (Page 11-12)
    setTimeout(() => {
      const samplePayload = `🚨 *NOTIFIKASI UJI SISTEM EWS* 🚨\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📍 *Titik:* ${ews.name}\n` +
        `📌 *Lokasi:* ${ews.location}\n` +
        `⏱ *Waktu:* ${new Date().toLocaleTimeString('id-ID')} WIB\n` +
        `📊 *Data Sensor Terkini:*\n` +
        `  • Kemiringan X/Y: ${ews.sensorData.pitchAngle}° / ${ews.sensorData.rollAngle}°\n` +
        `  • Kelembapan Tanah: ${ews.sensorData.soilMoisture}%\n` +
        `  • Curah Hujan: ${ews.sensorData.rainfallRate} mm/jam\n` +
        `  • Baterai VRLA: ${ews.sensorData.batteryVoltage} V (Surya: ${ews.sensorData.solarCurrent} mA)\n` +
        `  • Status Sinyal 4G: ${ews.sensorData.gsmSignalDbm} dBm (Online)\n` +
        `  • Status Sirine Lokal: ${ews.sirenActive ? 'AKTIF 110dB' : 'STANDBY'}\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `✅ *Status:* Konfigurasi Bot Telegram Titik ${ews.id} Terverifikasi dan Aktif!`;

      setIsTesting(false);
      setTestLog({
        status: 'success',
        message: `Berhasil terkirim ke Chat ID: ${config.chatId} via @${config.botToken.slice(0, 14)}...`,
        payload: samplePayload,
      });

      setConfig((prev) => ({
        ...prev,
        lastTestStatus: 'success',
        lastTestTime: 'Baru saja',
      }));
    }, 1200);
  };

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-cyan-950/60 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Konfigurasi Bot Telegram Mandiri - {ews.id}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-sky-950 text-sky-300 border border-sky-700/50">
                  {ews.name}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Setiap titik EWS memiliki bot dan saluran grup Telegram independen sesuai dokumen spesifikasi.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          
          {/* Main Credentials */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-semibold text-xs uppercase tracking-wider">
                <Shield className="w-4 h-4 text-cyan-400" />
                <span>Kredensial & Saluran Bot</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-slate-400">Status Notifikasi:</span>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={() => handleToggle('enabled')}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-500 relative"></div>
                <span className={`text-xs font-semibold ${config.enabled ? 'text-sky-400' : 'text-slate-400'}`}>
                  {config.enabled ? 'AKTIF' : 'NONAKTIF'}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Telegram Bot Token ({ews.id})
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={config.botToken}
                    onChange={(e) => setConfig({ ...config, botToken: e.target.value })}
                    placeholder="Contoh: 123456789:ABCdefGhIJKlmnoPQRstuv..."
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Dibuat via @BotFather khusus untuk titik ini</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Target Chat ID / Group ID
                </label>
                <input
                  type="text"
                  value={config.chatId}
                  onChange={(e) => setConfig({ ...config, chatId: e.target.value })}
                  placeholder="Contoh: -1001928374650 atau @GrupWargaEWS"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">ID grup relawan, posko, atau nomor chat pribadi</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Nama Saluran / Label Pos Pemantauan
              </label>
              <input
                type="text"
                value={config.channelName}
                onChange={(e) => setConfig({ ...config, channelName: e.target.value })}
                placeholder="Contoh: Saluran Warga Rawan Longsor Zona Pasir Madu"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Trigger Alert Checkboxes (Page 11-12 of PDF) */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-white font-semibold text-xs uppercase tracking-wider pb-2 border-b border-slate-800">
              <Bell className="w-4 h-4 text-amber-400" />
              <span>Parameter Notifikasi Otomatis (Standar Dokumen Teknis)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notifySiaga}
                  onChange={() => handleToggle('notifySiaga')}
                  className="mt-0.5 rounded border-slate-700 text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <span className="font-semibold text-amber-300">Status SIAGA</span>
                  <p className="text-[11px] text-slate-400">Peringatan pergerakan tanah awal / curah hujan tinggi</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notifyBahaya}
                  onChange={() => handleToggle('notifyBahaya')}
                  className="mt-0.5 rounded border-slate-700 text-red-600 focus:ring-red-500"
                />
                <div>
                  <span className="font-semibold text-red-400">Status BAHAYA (Kritis)</span>
                  <p className="text-[11px] text-slate-400">Sirine lokal 12V berbunyi, pergerakan tanah ekstrem</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notifyOffline}
                  onChange={() => handleToggle('notifyOffline')}
                  className="mt-0.5 rounded border-slate-700 text-slate-600 focus:ring-slate-500"
                />
                <div>
                  <span className="font-semibold text-slate-300">Perangkat OFFLINE</span>
                  <p className="text-[11px] text-slate-400">Hilang kontak &gt; 15 menit via SIMCom A7670C</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notifyBateraiLemah}
                  onChange={() => handleToggle('notifyBateraiLemah')}
                  className="mt-0.5 rounded border-slate-700 text-orange-600 focus:ring-orange-500"
                />
                <div>
                  <span className="font-semibold text-orange-400">Baterai Lemah (&lt; 11.8 V)</span>
                  <p className="text-[11px] text-slate-400">Daya solar 30Wp / aki VRLA 12V 20Ah kritis</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notifySensorGagal}
                  onChange={() => handleToggle('notifySensorGagal')}
                  className="mt-0.5 rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="font-semibold text-purple-300">Gangguan Sensor RS485</span>
                  <p className="text-[11px] text-slate-400">Modbus timeout pada Inclinometer / Soil sensor</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.dailyReport}
                  onChange={() => handleToggle('dailyReport')}
                  className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="font-semibold text-emerald-400">Laporan Berkala Harian</span>
                  <p className="text-[11px] text-slate-400">Ringkasan kondisi 24 jam setiap jam 07:00 WIB</p>
                </div>
              </label>
            </div>
          </div>

          {/* Test Notification Section */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sky-400" />
                <span className="font-semibold text-xs text-white uppercase tracking-wider">
                  Pengujian Integrasi Bot Telegram
                </span>
              </div>
              <button
                type="button"
                onClick={handleTestNotification}
                disabled={isTesting || !config.enabled}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                {isTesting ? (
                  <>
                    <Radio className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengirim...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Kirim Notifikasi Uji Sekarang</span>
                  </>
                )}
              </button>
            </div>

            {testLog.status === 'success' && (
              <div className="mt-3 p-3 bg-slate-900 border border-emerald-500/40 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{testLog.message}</span>
                </div>
                {testLog.payload && (
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 whitespace-pre-line leading-relaxed">
                    {testLog.payload}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Terakhir diuji: <span className="font-semibold text-slate-300">{config.lastTestTime || 'Belum pernah'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 rounded-xl transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white rounded-xl shadow-lg shadow-sky-600/30 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Simpan Konfigurasi Bot</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
