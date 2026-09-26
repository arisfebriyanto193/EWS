import React, { useState } from 'react';
import { AlarmLog, UserAccount } from '../types';
import {
  AlertTriangle,
  CheckCircle,
  FileSpreadsheet,
  Filter,
  Search,
  ShieldAlert,
  UserCheck,
  X,
} from 'lucide-react';

interface AlarmHistoryViewProps {
  logs: AlarmLog[];
  currentUser: UserAccount;
  onAcknowledgeLog: (logId: string, note: string, author: string) => void;
}

export const AlarmHistoryView: React.FC<AlarmHistoryViewProps> = ({
  logs,
  currentUser,
  onAcknowledgeLog,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedLogForAck, setSelectedLogForAck] = useState<AlarmLog | null>(null);
  const [ackNoteInput, setAckNoteInput] = useState('');

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.ewsName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.triggerCause.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || log.type === filterType;
    return matchesSearch && matchesType;
  });

  const handleExportCSV = () => {
    const headers = ['ID', 'Titik EWS', 'Waktu', 'Tipe', 'Pemicu', 'Nilai', 'Durasi Menit', 'Status Konfirmasi', 'Petugas', 'Catatan'];
    const rows = filteredLogs.map((l) => [
      l.id,
      `"${l.ewsName}"`,
      `"${l.timestamp}"`,
      l.type,
      `"${l.triggerCause}"`,
      `"${l.triggerValue}"`,
      l.durationMinutes,
      l.acknowledged ? 'Sudah Dikonfirmasi' : 'Belum Dikonfirmasi',
      `"${l.acknowledgedBy || '-'}"`,
      `"${l.acknowledgeNote || '-'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Riwayat_Alarm_EWS_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmAck = () => {
    if (!selectedLogForAck || !ackNoteInput.trim()) return;
    onAcknowledgeLog(selectedLogForAck.id, ackNoteInput, currentUser.fullName);
    setSelectedLogForAck(null);
    setAckNoteInput('');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <span>Riwayat Alarm &amp; Log Konfirmasi Operator</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Merekam riwayat pemicu sensor, notifikasi Telegram, konfirmasi operator lapangan, dan durasi kejadian mitigasi.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Ekspor Riwayat CSV</span>
        </button>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari titik, kode pemicu, atau log..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">Semua Jenis Status</option>
            <option value="siaga">Status Siaga</option>
            <option value="bahaya">Status Bahaya</option>
            <option value="offline">Perangkat Offline</option>
            <option value="baterai_lemah">Baterai Lemah</option>
          </select>
        </div>
      </div>

      {/* Table of Logs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">ID &amp; Waktu</th>
                <th className="py-3 px-4">Titik EWS</th>
                <th className="py-3 px-4">Jenis Alarm</th>
                <th className="py-3 px-4">Pemicu &amp; Nilai</th>
                <th className="py-3 px-4">Durasi</th>
                <th className="py-3 px-4">Status Konfirmasi</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Tidak ada riwayat kejadian alarm yang cocok.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono">
                      <span className="font-bold text-slate-900 dark:text-slate-100 block">{log.id}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{log.timestamp}</span>
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900 dark:text-white block">{log.ewsName}</span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{log.ewsId}</span>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          log.type === 'bahaya'
                            ? 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/70 dark:text-red-300 dark:border-red-900'
                            : log.type === 'siaga'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-900'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {log.type}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-800 dark:text-slate-200 block">{log.triggerCause}</span>
                      <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400">{log.triggerValue}</span>
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                      {log.durationMinutes} menit
                    </td>

                    <td className="py-3 px-4">
                      {log.acknowledged ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Dikonfirmasi
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                            Oleh: {log.acknowledgedBy}
                          </span>
                          {log.acknowledgeNote && (
                            <span className="text-[10px] text-slate-500 italic block truncate max-w-xs mt-0.5">
                              "{log.acknowledgeNote}"
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Menunggu Konfirmasi
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      {!log.acknowledged ? (
                        <button
                          onClick={() => setSelectedLogForAck(log)}
                          className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-medium transition-colors cursor-pointer shadow-xs"
                        >
                          Konfirmasi
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Selesai</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Acknowledge Modal */}
      {selectedLogForAck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span>Konfirmasi Tindak Lanjut Kejadian</span>
              </h3>
              <button
                onClick={() => setSelectedLogForAck(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <p><strong>Titik:</strong> {selectedLogForAck.ewsName} ({selectedLogForAck.ewsId})</p>
              <p><strong>Pemicu:</strong> {selectedLogForAck.triggerCause}</p>
              <p><strong>Nilai:</strong> {selectedLogForAck.triggerValue}</p>
              <p><strong>Petugas yang Mengkonfirmasi:</strong> {currentUser.fullName}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Catatan Hasil Pengecekan Lapangan / Tindakan:
              </label>
              <textarea
                value={ackNoteInput}
                onChange={(e) => setAckNoteInput(e.target.value)}
                placeholder="Contoh: Sudah diperiksa visual ke lereng, retakan minor telah dipasang patok pantau..."
                rows={3}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setSelectedLogForAck(null)}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs text-slate-700 dark:text-slate-300 font-medium rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmAck}
                disabled={!ackNoteInput.trim()}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-xs text-white font-medium rounded-lg shadow-xs cursor-pointer"
              >
                Simpan Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
