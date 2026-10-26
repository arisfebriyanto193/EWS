'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { EWSNode } from '../types';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Edit3,
  MapPin,
  Save,
  X,
  Info,
} from 'lucide-react';

// Dynamic import with SSR disabled for Leaflet satellite map
const SatelliteMap = dynamic(() => import('./SatelliteMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-48 rounded-xl bg-slate-100 dark:bg-slate-900/80 animate-pulse flex items-center justify-center text-xs text-slate-400 border border-slate-200 dark:border-slate-800">
      Memuat Citra Satelit...
    </div>
  ),
});

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
      setLatitude(ews.coordinates?.lat !== undefined ? ews.coordinates.lat.toString() : '');
      setLongitude(ews.coordinates?.lng !== undefined ? ews.coordinates.lng.toString() : '');

      setChannelName(ews.telegramConfig?.channelName || '');
      setBotToken(ews.telegramConfig?.botToken || '');
      setChatId(ews.telegramConfig?.chatId || '');
      setError(null);
    }
  }, [ews, isOpen]);

  if (!isOpen || !ews) return null;

  const latNum = parseFloat(latitude);
  const lngNum = parseFloat(longitude);
  const isCoordsValid =
    !isNaN(latNum) &&
    !isNaN(lngNum) &&
    latNum >= -90 &&
    latNum <= 90 &&
    lngNum >= -180 &&
    lngNum <= 180 &&
    !(latNum === 0 && lngNum === 0);

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

    if (isNaN(latNum) || isNaN(lngNum)) {
      setError('Format koordinat Latitude / Longitude tidak valid (angka desimal)');
      return;
    }

    const payload: Partial<EWSNode> & { newId?: string } = {
      newId: cleanId !== ews.id ? cleanId : undefined,
      name: name.trim(),
      location: location.trim(),
      coordinates: { lat: latNum, lng: lngNum },
      // Pertahankan ambang batas yang sudah ada tanpa perubahan di form ini
      thresholds: ews.thresholds,
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
                Perbarui nama stasiun, ID titik, lokasi lereng, koordinat GPS citra satelit, dan konfigurasi bot
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
            <div className="space-y-3">
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
                    Latitude (WGS84) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="-6.8924"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Longitude (WGS84) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="107.6183"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Satellite Map Preview when Coordinates are Valid */}
              {isCoordsValid ? (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Pratinjau Citra Satelit Lokasi:
                    </span>
                    <span className="text-[11px] text-slate-400">
                      💡 Klik pada peta atau geser pin untuk memperbarui koordinat
                    </span>
                  </div>
                  <SatelliteMap
                    latitude={latNum}
                    longitude={lngNum}
                    stationName={name || ews.name}
                    stationId={id || ews.id}
                    stationStatus={ews.status}
                    height="190px"
                    zoom={16}
                    interactive={true}
                    showControls={true}
                    onCoordinatesChange={(newLat, newLng) => {
                      setLatitude(newLat.toString());
                      setLongitude(newLng.toString());
                    }}
                  />
                </div>
              ) : (
                latitude.trim() !== '' &&
                longitude.trim() !== '' && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                    Format koordinat belum valid (-90 s/d 90 untuk Latitude, -180 s/d 180 untuk Longitude).
                  </p>
                )
              )}
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
