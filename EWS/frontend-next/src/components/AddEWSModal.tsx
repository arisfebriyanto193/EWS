'use client';
import React, { useState } from 'react';
import { EWSNode } from '../types';
import { PRESET_EWS_NODES } from '../mockData';
import {
  AlertCircle,
  Bot,
  Compass,
  Droplets,
  Layers,
  MapPin,
  Plus,
  Radio,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';

interface AddEWSModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEws: (newNode: Partial<EWSNode>) => Promise<void>;
  existingIds: string[];
}

export const AddEWSModal: React.FC<AddEWSModalProps> = ({
  isOpen,
  onClose,
  onAddEws,
  existingIds,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [id, setId] = useState('EWS-01');
  const [name, setName] = useState('EWS 01 - Lereng Pasir Madu');
  const [location, setLocation] = useState('Sektor Lereng Utara (KM 14.2)');
  const [latitude, setLatitude] = useState('-6.8924');
  const [longitude, setLongitude] = useState('107.6183');

  // Ambang Batas (Thresholds)
  const [tiltWarning, setTiltWarning] = useState('1.5');
  const [tiltDanger, setTiltDanger] = useState('3.0');
  const [rainWarning, setRainWarning] = useState('20.0');
  const [rainDanger, setRainDanger] = useState('50.0');
  const [soilMoistureWarning, setSoilMoistureWarning] = useState('75.0');
  const [vibrationDanger, setVibrationDanger] = useState('0.25');

  // Telegram Config
  const [channelName, setChannelName] = useState('Grup Relawan & Warga Lereng Pasir Madu');
  const [botToken, setBotToken] = useState('6892348121:AAHq_7xL98Kz2w_PasirMaduBot');
  const [chatId, setChatId] = useState('-1001928374650');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Handler memilih preset rekomendasi
  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = PRESET_EWS_NODES.find((p) => p.id === presetId);
    if (!preset) return;

    setId(preset.id);
    setName(preset.name);
    setLocation(preset.location);
    setLatitude(preset.coordinates.lat.toString());
    setLongitude(preset.coordinates.lng.toString());

    setTiltWarning(preset.thresholds.tiltWarning.toString());
    setTiltDanger(preset.thresholds.tiltDanger.toString());
    setRainWarning(preset.thresholds.rainWarning.toString());
    setRainDanger(preset.thresholds.rainDanger.toString());
    setSoilMoistureWarning(preset.thresholds.soilMoistureWarning.toString());
    setVibrationDanger(preset.thresholds.vibrationDanger.toString());

    setChannelName(preset.telegramConfig.channelName);
    setBotToken(preset.telegramConfig.botToken);
    setChatId(preset.telegramConfig.chatId);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanId = id.trim().toUpperCase();
    if (!cleanId) {
      setError('ID EWS wajib diisi (contoh: EWS-01)');
      return;
    }

    if (existingIds.includes(cleanId)) {
      setError(`ID "${cleanId}" sudah terdaftar dalam sistem. Gunakan ID lain.`);
      return;
    }

    if (!name.trim()) {
      setError('Nama perangkat EWS wajib diisi');
      return;
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    if (isNaN(latNum) || isNaN(lngNum)) {
      setError('Format koordinat Latitude / Longitude tidak valid');
      return;
    }

    const payload: Partial<EWSNode> = {
      id: cleanId,
      name: name.trim(),
      location: location.trim(),
      coordinates: { lat: latNum, lng: lngNum },
      thresholds: {
        tiltWarning: parseFloat(tiltWarning) || 1.5,
        tiltDanger: parseFloat(tiltDanger) || 3.0,
        rainWarning: parseFloat(rainWarning) || 20.0,
        rainDanger: parseFloat(rainDanger) || 50.0,
        soilMoistureWarning: parseFloat(soilMoistureWarning) || 75.0,
        vibrationDanger: parseFloat(vibrationDanger) || 0.25,
        batteryLowVoltage: 11.8,
      },
      telegramConfig: {
        ewsId: cleanId,
        botToken: botToken.trim(),
        chatId: chatId.trim(),
        channelName: channelName.trim() || `Grup Pantau ${cleanId}`,
        enabled: true,
        notifySiaga: true,
        notifyBahaya: true,
        notifyOffline: true,
        notifyBateraiLemah: true,
        notifySensorGagal: true,
        notifyNormalKembali: true,
        dailyReport: true,
        lastTestStatus: 'idle',
        lastTestTime: '-',
      },
    };

    try {
      setIsLoading(true);
      await onAddEws(payload);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Gagal menambahkan EWS ke sistem backend');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8 transition-colors">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Tambah Stasiun EWS Baru
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Daftarkan titik sensor telemetri tanah longsor ke backend sistem
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Preset Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Pilihan Cepat / Preset Template Lapangan:</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESET_EWS_NODES.map((preset) => {
                const isAlreadyAdded = existingIds.includes(preset.id);
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    type="button"
                    key={preset.id}
                    disabled={isAlreadyAdded}
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all text-xs cursor-pointer ${
                      isAlreadyAdded
                        ? 'opacity-40 bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 cursor-not-allowed'
                        : isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-700 dark:text-blue-300 font-semibold shadow-xs'
                        : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>{preset.id}</span>
                      {isAlreadyAdded && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                          Sudah ada
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {preset.name.replace(/^EWS \d+ - /, '')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-4">
            {/* Primary Identifiers */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  ID Stasiun EWS *
                </label>
                <input
                  type="text"
                  required
                  placeholder="EWS-01"
                  value={id}
                  onChange={(e) => setId(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-bold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Nama Titik Stasiun *
                </label>
                <input
                  type="text"
                  required
                  placeholder="EWS 01 - Lereng Pasir Madu"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Location & Coordinates */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  <span>Lokasi Sektor</span>
                </label>
                <input
                  type="text"
                  placeholder="Sektor Lereng Utara (KM 14.2)"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Latitude
                </label>
                <input
                  type="text"
                  placeholder="-6.8924"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Longitude
                </label>
                <input
                  type="text"
                  placeholder="107.6183"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Thresholds Settings */}
            <div>
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-2">
                <Sliders className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Pengaturan Ambang Batas Alarm (Thresholds):</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-slate-50 dark:bg-slate-950/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                    Kemiringan Waspada (°)
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={tiltWarning}
                    onChange={(e) => setTiltWarning(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                    Kemiringan Bahaya (°)
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={tiltDanger}
                    onChange={(e) => setTiltDanger(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                    Curah Hujan Waspada (mm)
                  </span>
                  <input
                    type="number"
                    step="1"
                    value={rainWarning}
                    onChange={(e) => setRainWarning(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                    Curah Hujan Bahaya (mm)
                  </span>
                  <input
                    type="number"
                    step="1"
                    value={rainDanger}
                    onChange={(e) => setRainDanger(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                    Kel. Tanah Waspada (%)
                  </span>
                  <input
                    type="number"
                    step="1"
                    value={soilMoistureWarning}
                    onChange={(e) => setSoilMoistureWarning(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                    Getaran Bahaya (g)
                  </span>
                  <input
                    type="number"
                    step="0.05"
                    value={vibrationDanger}
                    onChange={(e) => setVibrationDanger(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Telegram Channel Info */}
            <div>
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-2">
                <Bot className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Konfigurasi Bot Telegram Otomatis:</span>
              </label>
              <div className="space-y-2 bg-slate-50 dark:bg-slate-950/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                    Nama Saluran / Grup Telegram
                  </span>
                  <input
                    type="text"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                      Telegram Bot Token
                    </span>
                    <input
                      type="text"
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder="123456:ABC-DEF1234..."
                      className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                      Chat ID / Target Channel
                    </span>
                    <input
                      type="text"
                      value={chatId}
                      onChange={(e) => setChatId(e.target.value)}
                      placeholder="-100123456789"
                      className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{isLoading ? 'Mendaftarkan...' : 'Tambah & Pasang EWS'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
