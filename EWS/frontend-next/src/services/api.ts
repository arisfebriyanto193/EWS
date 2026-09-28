import { EWSNode, PestTrapNode, AlarmLog, UserAccount, TelegramConfig } from '../types';

// Konfigurasi Base URL API
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('ews_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  // 1. Auth: Login dengan 1 akun administrator
  async login(username: string, password: string):Promise<{ success: boolean; token: string; user: UserAccount; message?: string }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Gagal masuk ke sistem');
    }
    return data;
  },

  // Verifikasi sesi login yang tersimpan
  async getMe(): Promise<{ success: boolean; user: UserAccount }> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { ...getAuthHeader() },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Sesi telah kedaluwarsa');
    }
    return data;
  },

  // 2. EWS Nodes
  async getEwsNodes(): Promise<EWSNode[]> {
    const res = await fetch(`${API_BASE}/ews`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal mengambil data titik EWS');
    }
    return data.data;
  },

  async createEws(payload: Partial<EWSNode>): Promise<EWSNode> {
    const res = await fetch(`${API_BASE}/ews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal menambahkan stasiun EWS baru');
    }
    return data.data;
  },

  async deleteEws(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/ews/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal menghapus stasiun EWS');
    }
  },

  async controlEws(id: string, payload: { command: string; type?: string; siren?: boolean; strobo?: boolean; mute?: boolean }): Promise<void> {
    const res = await fetch(`${API_BASE}/ews/${id}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal mengirim instruksi ke titik EWS');
    }
  },

  async updateEwsThresholds(id: string, thresholds: EWSNode['thresholds']): Promise<void> {
    const res = await fetch(`${API_BASE}/ews/${id}/thresholds`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(thresholds),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal memperbarui ambang batas');
    }
  },

  async updateTelegramConfig(id: string, config: TelegramConfig): Promise<void> {
    const res = await fetch(`${API_BASE}/ews/${id}/telegram`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal memperbarui konfigurasi Telegram');
    }
  },

  async testTelegramConfig(
    id: string,
    payload: { botToken?: string; chatId?: string; message?: string }
  ): Promise<{ success: boolean; message: string; lastTestTime?: string }> {
    const res = await fetch(`${API_BASE}/ews/${id}/telegram/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal mengirim pesan uji ke Telegram');
    }
    return data;
  },

  // 3. Pest Traps
  async getPestTraps(): Promise<PestTrapNode[]> {
    const res = await fetch(`${API_BASE}/traps`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal mengambil data perangkap hama');
    }
    return data.data;
  },

  async controlTrap(id: string, payload: { mode?: string; uvLedStatus?: boolean; blowerStatus?: boolean; status?: string }): Promise<void> {
    const res = await fetch(`${API_BASE}/traps/${id}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal mengirim kontrol ke perangkap hama');
    }
  },

  async controlPestTrap(id: string, payload: { mode?: string; uvLedStatus?: boolean; blowerStatus?: boolean; status?: string }): Promise<void> {
    return this.controlTrap(id, payload);
  },

  // 4. Alarm History
  async getAlarmLogs(): Promise<AlarmLog[]> {
    const res = await fetch(`${API_BASE}/alarms?limit=50`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal mengambil riwayat alarm');
    }
    return data.data;
  },

  async acknowledgeAlarm(id: string, note: string, author: string): Promise<AlarmLog> {
    const res = await fetch(`${API_BASE}/alarms/${id}/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ note, author }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal mengonfirmasi alarm');
    }
    return data.data;
  },

  // 5. Sensor Telemetry Logs
  async getSensorLogs(ewsId?: string, limit = 50): Promise<any[]> {
    try {
      const q = new URLSearchParams();
      if (ewsId) q.append('ewsId', ewsId);
      q.append('limit', limit.toString());
      const res = await fetch(`${API_BASE}/logs/sensor?${q.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        return [];
      }
      return data.data || [];
    } catch {
      return [];
    }
  },
};
