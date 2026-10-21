import { PestTrapNode, UserAccount } from '../types';

// Konfigurasi Base URL API
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

function getAuthHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('trap_token') || localStorage.getItem('ews_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  // 1. Auth: Login akun administrator
  async login(username: string, password: string): Promise<{ success: boolean; token: string; user: UserAccount; message?: string }> {
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

  // Perbarui profil pengguna
  async updateProfile(payload: { fullName: string; department?: string }): Promise<{ success: boolean; message: string; user: UserAccount }> {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal memperbarui profil');
    }
    return data;
  },

  // Ganti kata sandi
  async changePassword(payload: { oldPassword: string; newPassword: string }): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal mengubah kata sandi');
    }
    return data;
  },

  // 2. Pest Traps Endpoints
  async getPestTraps(): Promise<PestTrapNode[]> {
    const res = await fetch(`${API_BASE}/traps`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal mengambil data perangkap hama');
    }
    return data.data;
  },

  async createTrap(trapData: Partial<PestTrapNode>): Promise<PestTrapNode> {
    const res = await fetch(`${API_BASE}/traps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(trapData),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal menambahkan perangkap hama');
    }
    return data.data;
  },

  async updateTrap(id: string, trapData: Partial<PestTrapNode>): Promise<PestTrapNode> {
    const res = await fetch(`${API_BASE}/traps/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(trapData),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal memperbarui perangkap hama');
    }
    return data.data;
  },

  async deleteTrap(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/traps/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal menghapus perangkap hama');
    }
  },

  async controlTrap(
    id: string,
    payload: {
      mode?: string;
      uvLedStatus?: boolean;
      blowerStatus?: boolean;
      status?: string;
      activePreset?: number;
      startTime?: string;
      endTime?: string;
      ledRotationInterval?: number;
      manualIntervalMin?: number;
      manualDurationSec?: number;
      blowerMode?: 'sensor' | 'time';
      ledRunning?: boolean;
      ledColor?: string;
      presets?: any[];
      command?: string;
    }
  ): Promise<PestTrapNode> {
    const res = await fetch(`${API_BASE}/traps/${id}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Gagal mengirim kontrol ke perangkap hama');
    }
    return data.data;
  },

  async controlPestTrap(
    id: string,
    payload: {
      mode?: string;
      uvLedStatus?: boolean;
      blowerStatus?: boolean;
      status?: string;
      activePreset?: number;
      startTime?: string;
      endTime?: string;
      ledRotationInterval?: number;
      manualIntervalMin?: number;
      manualDurationSec?: number;
      ledColor?: string;
      presets?: any[];
      command?: string;
    }
  ): Promise<PestTrapNode> {
    return this.controlTrap(id, payload);
  },

  // 3. Battery History (Grafik Tegangan Baterai per Trap)
  async getBatteryHistory(
    id: string,
    options?: { hours?: number; days?: number }
  ): Promise<{ voltage: number; solarCurrent: number; timestamp: string }[]> {
    const q = new URLSearchParams();
    if (options?.hours) q.append('hours', options.hours.toString());
    if (options?.days) q.append('days', options.days.toString());
    const res = await fetch(`${API_BASE}/traps/${id}/battery-history?${q.toString()}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      return [];
    }
    return data.data || [];
  },

  // 4. Trap Logs & CSV Export
  async getTrapLogs(trapId?: string, limit = 50): Promise<any[]> {
    try {
      const q = new URLSearchParams();
      if (trapId) q.append('trapId', trapId);
      q.append('limit', limit.toString());
      const res = await fetch(`${API_BASE}/logs/traps?${q.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        return [];
      }
      return data.data || [];
    } catch {
      return [];
    }
  },

  getExportCsvUrl(trapId?: string): string {
    const q = trapId ? `?trapId=${encodeURIComponent(trapId)}` : '';
    return `${API_BASE}/logs/traps/export/csv${q}`;
  },
};
