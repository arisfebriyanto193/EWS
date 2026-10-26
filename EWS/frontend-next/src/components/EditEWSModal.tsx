'use client';

import React, { useState, useEffect } from 'react';
import { EWSNode } from '../types';
import {
  AlertCircle,
  Bot,
  Compass,
  Droplets,
  Edit3,
  Layers,
  MapPin,
  Save,
  Sliders,
  X,
  Info,
} from 'lucide-react';

interface EditEWSModalProps {
  isOpen: boolean;
  onClose: () => void;
  ews: EWSNode | null;
  onUpdateEws: (oldId: string, updatedPayload: Partial<EWSNode> & { newId?: string }) => Promise<void>;
  existingIds: string[];
}

export const EditEWSModal: React.FC<EditEWSModalProps> = ({
  isOpen,
  onClose,
  ews,
  onUpdateEws,
  existingIds,
}) => {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  // Thresholds
  const [tiltWarning, setTiltWarning] = useState('1.5');
  const [tiltDanger, setTiltDanger] = useState('3.0');
  const [rainWarning, setRainWarning] = useState('20.0');
  const [rainDanger, setRainDanger] = useState('50.0');
  const [soilMoistureWarning, setSoilMoistureWarning] = useState('75.0');
  const [vibrationDanger, setVibrationDanger] = useState('0.25');

  // Telegram Config
  const [channelName, setChannelName] = useState('');
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ews) {
      setId(ews.id || '');
      setName(ews.name || '');
      setLocation(ews.location || '');
      setLatitude(ews.coordinates?.lat?.toString() || '');
      setLongitude(ews.coordinates?.lng?.toString() || '');

      setTiltWarning((ews.thresholds?.tiltWarning ?? 1.5).toString());
      setTiltDanger((ews.thresholds?.tiltDanger ?? 3.0).toString());
      setRainWarning((ews.thresholds?.rainWarning ?? 20.0).toString());
      setRainDanger((ews.thresholds?.rainDanger ?? 50.0).toString());
      setSoilMoistureWarning((ews.thresholds?.soilMoistureWarning ?? 75.0).toString());
      setVibrationDanger((ews.thresholds?.vibrationDanger ?? 0.25).toString());

      setChannelName(ews.telegramConfig?.channelName || '');
      setBotToken(ews.telegramConfig?.botToken || '');
      setChatId(ews.telegramConfig?.chatId || '');
      setError(null);
    }
  }, [ews, isOpen]);

  if (!isOpen || !ews) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanId = id.trim().toUpperCase();
    if (!cleanId) {
      setError('ID EWS wajib diisi (contoh: EWS-01)');
      return;
    }

    if (cleanId !== ews.id && existingIds.includes(cleanId)) {
      setError(`ID "${cleanId}" sudah digunakan oleh stasiun EWS lain. Gunakan ID unik.`);
      return;
    }

    if (!name.trim()) {
      setError('Nama perangkat EWS wajib diisi');
      return;
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    if (isNaN(latNum) || isNaN(lngNum)) {
      setError('Format koordinat Latitude / Longitude tidak valid (angka desimal)');
      return;
    }

    const payload: Partial<EWSNode> & { newId?: string } = {
      newId: cleanId !== ews.id ? cleanId : undefined,
      name: name.trim(),
      location: location.trim(),
      coordinates: { lat: latNum, lng: lngNum },
      thresholds: {
        ...(ews.thresholds || {}),
        safeTiltPitch: ews.thresholds?.safeTiltPitch ?? 0.0,
        safeTiltRoll: ews.thresholds?.safeTiltRoll ?? 0.0,
        tiltTolerance: ews.thresholds?.tiltTolerance ?? 2.0,
        tiltWarning: parseFloat(tiltWarning) || 1.5,
        tiltDanger: parseFloat(tiltDanger) || 3.0,
        rainWarning: parseFloat(rainWarning) || 20.0,
        rainDanger: parseFloat(rainDanger) || 50.0,
        rainCalibPerTip: ews.thresholds?.rainCalibPerTip ?? 0.70,
        safeSoilMoisture: ews.thresholds?.safeSoilMoisture ?? 50.0,
        soilMoistureTolerance: ews.thresholds?.soilMoistureTolerance ?? 15.0,
        soilMoistureWarning: parseFloat(soilMoistureWarning) || 75.0,
        soilAdcDry: ews.thresholds?.soilAdcDry ?? 3300,
        soilAdcWet: ews.thresholds?.soilAdcWet ?? 1200,
        vibrationDanger: parseFloat(vibrationDanger) || 0.25,
        batteryLowVoltage: ews.thresholds?.batteryLowVoltage ?? 11.8,
      },
      telegramConfig: {
        ...(ews.telegramConfig || {
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
        }),
        ewsId: cleanId,
        botToken: botToken.trim(),
        chatId: chatId.trim(),
        channelName: channelName.trim() || `Grup Pantau ${cleanId}`,
      },
    };

    try {
      setIsLoading(true);
      await onUpdateEws(ews.id, payload);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan perubahan konfigurasi stasiun EWS');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden my-8 transition-colors">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0b0f19]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Edit Konfigurasi Stasiun EWS</span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono">
                  {ews.id}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Perbarui identitas titik, nama stasiun, koordinat GPS, ambang batas, dan konfigurasi bot
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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

          {/* Primary Identifiers */}
          <div className="space-y-4">
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
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-600/20 focus:border-blue-600 font-bold"
                />
                {id.trim().toUpperCase() !== ews.id && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                    <Info className="w-3 h-3 shrink-0" />
                    <span>ID diubah: seluruh relasi log & bot akan dimutakhirkan.</span>
                  </p>
                )}
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
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
            </div>

            {/* Location & Coordinates */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                  <MapPin className="w-3 h-3 text-blue-500" />
                  <span>Lokasi Sektor</span>
                </label>
                <input
                  type="text"
                  placeholder="Sektor Lereng Utara (KM 14.2)"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Latitude (WGS84)
                </label>
                <input
                  type="text"
                  placeholder="-6.8924"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Longitude (WGS84)
                </label>
                <input
                  type="text"
                  placeholder="107.6183"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
            </div>

            {/* Thresholds Settings */}
            <div>
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-2">
                <Sliders className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Pengaturan Ambang Batas Alarm (Thresholds):</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                    Kemiringan Waspada (°)
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={tiltWarning}
                    onChange={(e) => setTiltWarning(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
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
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
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
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
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
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
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
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
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
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Telegram Channel Info */}
            <div>
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-2">
                <Bot className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Konfigurasi Bot Telegram Mandiri:</span>
              </label>
              <div className="space-y-2 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                    Nama Saluran / Grup Telegram
                  </span>
                  <input
                    type="text"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
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
                      className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
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
                      className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
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
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 active:scale-[0.98]"
            >
              <Save className="w-4 h-4" />
              <span>{isLoading ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
