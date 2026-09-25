import React, { useState } from 'react';
import { AlarmLog, UserAccount } from '../types';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  FileSpreadsheet,
  Filter,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <span>Riwayat Alarm & Log Acknowledgement</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Merekam riwayat pemicu sensor, notifikasi Telegram, konfirmasi operator lapangan, dan durasi kejadian mitigasi.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="px-4 py-2.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-950/40"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <span>Ekspor Riwayat CSV</span>
        </button>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 p-4 rounded-2xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari titik, kode pemicu, atau log..."
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500"
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-medium">
              <tr>
                <th className="py-3 px-4">ID & WAKTU</th>
                <th className="py-3 px-4">TITIK EWS</th>
                <th className="py-3 px-4">JENIS ALARM</th>
                <th className="py-3 px-4">PENYEBAB & NILAI PEMICU</th>
                <th className="py-3 px-4">DURASI</th>
                <th className="py-3 px-4">ACKNOWLEDGEMENT</th>
                <th className="py-3 px-4 text-right">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Tidak ada riwayat kejadian alarm yang cocok.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono">
                      <span className="font-bold text-cyan-400 block">{log.id}</span>
                      <span className="text-[11px] text-slate-400">{log.timestamp}</span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-white block">{log.ewsName}</span>
                      <span className="text-[11px] font-mono text-slate-400">{log.ewsId}</span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          log.type === 'bahaya'
                            ? 'bg-red-950 text-red-300 border border-red-800'
                            : log.type === 'siaga'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {log.type}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-medium text-slate-200 block">{log.triggerCause}</span>
                      <span className="text-[11px] font-mono text-cyan-400">{log.triggerValue}</span>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {log.durationMinutes} menit
                    </td>

                    <td className="py-3.5 px-4">
                      {log.acknowledged ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Dikonfirmasi
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Oleh: {log.acknowledgedBy}
                          </span>
                          {log.acknowledgeNote && (
                            <span className="text-[10px] text-slate-500 italic block truncate max-w-xs mt-0.5">
                              "{log.acknowledgeNote}"
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Menunggu Konfirmasi
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {!log.acknowledged ? (
                        <button
                          onClick={() => setSelectedLogForAck(log)}
                          className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-medium transition-colors cursor-pointer shadow"
                        >
                          Konfirmasi
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500">Selesai</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-cyan-400" />
                <span>Konfirmasi Tindak Lanjut Kejadian</span>
              </h3>
            </div>

            <div className="space-y-2 text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <p><strong>Titik:</strong> {selectedLogForAck.ewsName} ({selectedLogForAck.ewsId})</p>
              <p><strong>Pemicu:</strong> {selectedLogForAck.triggerCause}</p>
              <p><strong>Nilai:</strong> {selectedLogForAck.triggerValue}</p>
              <p><strong>Petugas yang Mengkonfirmasi:</strong> {currentUser.fullName}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Catatan Hasil Pengecekan Lapangan / Tindakan:
              </label>
              <textarea
                value={ackNoteInput}
                onChange={(e) => setAckNoteInput(e.target.value)}
                placeholder="Contoh: Sudah diperiksa visual ke lereng, retakan minor telah dipasang patok pantau..."
                rows={3}
                className="w-full p-3 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedLogForAck(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmAck}
                disabled={!ackNoteInput.trim()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-xs text-white font-medium rounded-xl shadow cursor-pointer"
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
