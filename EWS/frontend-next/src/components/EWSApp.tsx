'use client';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  EWSNode,
  AlarmLog,
  UserAccount,
  TelegramConfig,
  TelkomselConfig,
  PestTrapNode,
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_EWS_NODES,
  INITIAL_ALARM_LOGS,
  INITIAL_PEST_TRAPS,
} from '../mockData';
import { api } from '../services/api';
import { wsClient } from '../services/websocket';
import { LoginModal } from './LoginModal';
import { Navbar } from './Navbar';
import { OverviewAllEWS } from './OverviewAllEWS';
import { EWSDashboardSingle } from './EWSDashboardSingle';
import { AlarmHistoryView } from './AlarmHistoryView';
import { PestTrapDashboard } from './PestTrapDashboard';
import { EngineeringDocsModal } from './EngineeringDocsModal';
import { TelegramConfigModal } from './TelegramConfigModal';
import { TelkomselConfigModal } from './TelkomselConfigModal';
import { AddEWSModal } from './AddEWSModal';
import { Volume2, VolumeX, ShieldAlert } from 'lucide-react';

export default function App() {
  // Authentication: starts at null so login page is displayed before dashboard
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  
  // Navigation tab: 'overview', 'EWS-01', 'EWS-02', 'EWS-03', 'EWS-04', 'alarm-history'
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Application Data States (diambil dari MySQL Backend, fallback ke INITIAL_*)
  const [ewsNodes, setEwsNodes] = useState<EWSNode[]>(INITIAL_EWS_NODES);
  const [alarmLogs, setAlarmLogs] = useState<AlarmLog[]>(INITIAL_ALARM_LOGS);
  const [pestTraps, setPestTraps] = useState<PestTrapNode[]>(INITIAL_PEST_TRAPS);

  // WebSocket Live Connection Status
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');

  // Modals & UI States
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isAddEWSOpen, setIsAddEWSOpen] = useState(false);
  const [editingTelegramEws, setEditingTelegramEws] = useState<EWSNode | null>(null);
  const [editingTelkomselEws, setEditingTelkomselEws] = useState<EWSNode | null>(null);
  const [globalMute, setGlobalMute] = useState(false);

  // Audio synthesizer ref for simulated local 12V 110dB siren
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Timestamp penerimaan data terakhir per node untuk deteksi offline otomatis
  const lastReceivedRef = useRef<Record<string, number>>({});

  // 1. Cek Sesi Login Tersimpan di LocalStorage saat Pertama Buka
  useEffect(() => {
    const token = localStorage.getItem('ews_token');
    const savedUser = localStorage.getItem('ews_user');

    if (token && savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch {
        // fallback
      }

      // Verifikasi token ke backend
      api.getMe()
        .then((res) => {
          if (res.user) {
            setCurrentUser(res.user);
            localStorage.setItem('ews_user', JSON.stringify(res.user));
          }
        })
        .catch(() => {
          localStorage.removeItem('ews_token');
          localStorage.removeItem('ews_user');
          setCurrentUser(null);
        });
    }
  }, []);

  // 2. Data EWS, Perangkap Hama & Riwayat Alarm dari Backend REST API
  const refreshBackendData = () => {
    // Ambil daftar perangkat EWS dari backend
    api.getEwsNodes()
      .then((data) => {
        if (data) {
          setEwsNodes(data);
          const now = Date.now();
          data.forEach((node) => {
            if (node.sensorData?.lastSeenAt) {
              lastReceivedRef.current[node.id] = new Date(node.sensorData.lastSeenAt).getTime();
            } else if (node.status !== 'offline') {
              lastReceivedRef.current[node.id] = now;
            }
          });
        }
      })
      .catch((err) => console.warn('Gagal memuat daftar EWS dari backend:', err.message));

    // Ambil data perangkap hama
    api.getPestTraps()
      .then((data) => {
        if (data && data.length > 0) setPestTraps(data);
      })
      .catch((err) => console.warn('Gagal memuat perangkap hama:', err.message));

    // Ambil riwayat alarm
    api.getAlarmLogs()
      .then((data) => {
        if (data && data.length > 0) setAlarmLogs(data);
      })
      .catch((err) => console.warn('Gagal memuat riwayat alarm:', err.message));
  };

  useEffect(() => {
    refreshBackendData();
  }, []);

  // 3. Hubungkan ke WebSocket Gateway (Port 3440) untuk Live Streaming Telemetri
  useEffect(() => {
    wsClient.connect();

    const unsubStatus = wsClient.onStatusChange((status) => {
      setWsStatus(status);
    });

    // A. Real-time Telemetri Lengkap EWS dari ESP32 (topik: ews/{id}/telemetry)
    const unsubEws = wsClient.on('ews/+/telemetry', (payload) => {
      if (!payload || !payload.ewsId) return;
      lastReceivedRef.current[payload.ewsId] = Date.now();
      setEwsNodes((prev) =>
        prev.map((e) => {
          if (e.id === payload.ewsId) {
            return {
              ...e,
              status: payload.status && payload.status !== 'offline' ? payload.status : (e.status === 'offline' ? 'aman' : e.status),
              sirenActive: payload.sirenActive !== undefined ? payload.sirenActive : e.sirenActive,
              stroboActive: payload.stroboActive !== undefined ? payload.stroboActive : e.stroboActive,
              sensorData: {
                ...e.sensorData,
                ...(payload.sensorData || {}),
                gsmStatus: 'online',
                lastUpdated: 'Live via WS (Baru saja)',
              },
            };
          }
          return e;
        })
      );
    });

    // B. Real-time Telemetri Per-Data / Per-Topik Sensor (topik: ews/{id}/pitch, ews/{id}/rainfall_rate, dll.)
    const unsubSensorUpdate = wsClient.on('ews/sensor_update', (eventData: any) => {
      if (!eventData || !eventData.ewsId || !eventData.sensorKey) return;
      const { ewsId, sensorKey, payload } = eventData;

      // Abaikan topik internal command atau status yang sudah punya handler tersendiri
      if (sensorKey === 'command' || sensorKey === 'status' || sensorKey === 'telemetry') return;

      lastReceivedRef.current[ewsId] = Date.now();

      const keyPropMap: Record<string, keyof EWSNode['sensorData']> = {
        pitch: 'pitchAngle',
        pitch_angle: 'pitchAngle',
        roll: 'rollAngle',
        roll_angle: 'rollAngle',
        soil_moisture: 'soilMoisture',
        soil_temp: 'soilTemperature',
        soil_temperature: 'soilTemperature',
        rainfall_rate: 'rainfallRate',
        rain: 'rainfallRate',
        rain_rate: 'rainfallRate',
        rainfall_cumulative: 'rainfallCumulative',
        vibration: 'vibrationLevel',
        vibration_level: 'vibrationLevel',
        battery: 'batteryVoltage',
        battery_voltage: 'batteryVoltage',
        battery_current: 'batteryCurrent',
        solar: 'solarCurrent',
        solar_current: 'solarCurrent',
        gsm: 'gsmSignalDbm',
        gsm_signal: 'gsmSignalDbm',
        uptime: 'uptimeHours',
      };

      const targetProp = keyPropMap[sensorKey.toLowerCase()];

      setEwsNodes((prev) =>
        prev.map((e) => {
          if (e.id === ewsId) {
            const updated = { ...e.sensorData };

            // Jika payload adalah objek processed dari backend
            if (typeof payload === 'object' && payload !== null) {
              if (payload.sensorData) {
                Object.assign(updated, payload.sensorData);
              }
              if (targetProp && 'rawValue' in payload) {
                (updated as any)[targetProp] = payload.rawValue;
              }
            } else {
              // Jika payload langsung angka/string raw
              const numVal = parseFloat(payload);
              if (targetProp && !isNaN(numVal)) {
                (updated as any)[targetProp] = numVal;
              }
            }
            updated.gsmStatus = 'online';
            updated.lastUpdated = 'Live WS (Baru saja)';

            return {
              ...e,
              status: typeof payload === 'object' && payload?.status ? payload.status : (e.status === 'offline' ? 'aman' : e.status),
              sirenActive: typeof payload === 'object' && payload?.sirenActive !== undefined ? payload.sirenActive : e.sirenActive,
              stroboActive: typeof payload === 'object' && payload?.stroboActive !== undefined ? payload.stroboActive : e.stroboActive,
              sensorData: updated,
            };
          }
          return e;
        })
      );
    });

    // C. Real-time Status Aktuator EWS (Sirine/Strobo/Mute/Offline)
    const unsubEwsStatus = wsClient.on('ews/+/status', (payload) => {
      if (!payload || !payload.ewsId) return;
      if (payload.status !== 'offline') {
        lastReceivedRef.current[payload.ewsId] = Date.now();
      }
      setEwsNodes((prev) =>
        prev.map((e) => {
          if (e.id === payload.ewsId) {
            const isOffline = payload.status === 'offline';
            return {
              ...e,
              status: payload.status !== undefined ? payload.status : e.status,
              sirenActive: payload.sirenActive !== undefined ? payload.sirenActive : e.sirenActive,
              stroboActive: payload.stroboActive !== undefined ? payload.stroboActive : e.stroboActive,
              muted: payload.muted !== undefined ? payload.muted : e.muted,
              sensorData: {
                ...e.sensorData,
                gsmStatus: payload.gsmStatus || (isOffline ? 'offline' : e.sensorData.gsmStatus),
                lastUpdated: isOffline ? 'Terputus (Offline)' : e.sensorData.lastUpdated,
              },
            };
          }
          return e;
        })
      );
    });

    // D. Real-time Pemicuan & Konfirmasi Alarm
    const unsubAlarm = wsClient.on('alarms', (payload) => {
      if (payload && payload.event === 'ALARM_ACTIVE') {
        api.getAlarmLogs().then((logs) => setAlarmLogs(logs)).catch(() => {});
      } else if (payload && payload.event === 'ALARM_ACKNOWLEDGED' && payload.data) {
        setAlarmLogs((prev) =>
          prev.map((l) => (l.id === payload.data.id ? { ...l, ...payload.data } : l))
        );
      }
    });

    // E. Real-time Registrasi & Penghapusan Titik EWS
    const unsubNodeCreated = wsClient.on('ews/node/created', (payload) => {
      if (payload && payload.node) {
        setEwsNodes((prev) => {
          if (prev.some((e) => e.id === payload.node.id)) return prev;
          return [...prev, payload.node];
        });
      }
    });

    const unsubNodeDeleted = wsClient.on('ews/node/deleted', (payload) => {
      if (payload && payload.ewsId) {
        setEwsNodes((prev) => prev.filter((e) => e.id !== payload.ewsId));
      }
    });

    // F. Real-time Pembaruan Konfigurasi Telegram Bot
    const unsubTelegramUpdated = wsClient.on('ews/telegram/updated', (payload) => {
      if (payload && payload.ewsId && payload.telegramConfig) {
        setEwsNodes((prev) =>
          prev.map((e) =>
            e.id === payload.ewsId
              ? { ...e, telegramConfig: { ...e.telegramConfig, ...payload.telegramConfig } }
              : e
          )
        );
      }
    });

    return () => {
      unsubStatus();
      unsubEws();
      unsubSensorUpdate();
      unsubEwsStatus();
      unsubAlarm();
      unsubNodeCreated();
      unsubNodeDeleted();
      unsubTelegramUpdated();
    };
  }, []);

  // 4. Deteksi Otomatis Perangkat Offline di Sisi Web (Jika tidak ada data masuk > 25 detik)
  useEffect(() => {
    const OFFLINE_THRESHOLD_MS = 25000; // 25 detik (ESP32 mengirim setiap 5 detik)

    const timer = setInterval(() => {
      const now = Date.now();

      setEwsNodes((prev) => {
        let hasChanges = false;
        const updated = prev.map((node) => {
          const lastSeen = lastReceivedRef.current[node.id];

          // Jika node belum offline dan data terakhir melewati batas threshold
          if (lastSeen && now - lastSeen > OFFLINE_THRESHOLD_MS) {
            if (node.status !== 'offline') {
              hasChanges = true;
              const elapsedSec = Math.round((now - lastSeen) / 1000);
              return {
                ...node,
                status: 'offline' as const,
                sirenActive: false,
                stroboActive: false,
                sensorData: {
                  ...node.sensorData,
                  gsmStatus: 'offline' as const,
                  lastUpdated: `Terputus (${elapsedSec}d lalu)`,
                },
              };
            }
          }
          return node;
        });

        return hasChanges ? updated : prev;
      });
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  // Handle Login
  const handleLogin = (user: UserAccount) => {
    setCurrentUser(user);
    if (user.role.startsWith('operator_') && user.assignedEwsId) {
      setActiveTab(user.assignedEwsId);
    } else {
      setActiveTab('overview');
    }
    refreshBackendData();
  };

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem('ews_token');
    localStorage.removeItem('ews_user');
    setCurrentUser(null);
    setActiveTab('overview');
  };

  // Update specific EWS (Thresholds / Telegram / Status)
  const handleUpdateEws = (updated: EWSNode) => {
    setEwsNodes((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));

    // Simpan ambang batas ke MySQL backend
    api.updateEwsThresholds(updated.id, updated.thresholds).catch((err) => {
      console.warn('Gagal sinkron threshold ke backend:', err.message);
    });
  };

  // Trigger Local Siren / Alarm
  const handleTriggerAlarm = (ewsId: string, type: 'siaga' | 'bahaya') => {
    setEwsNodes((prev) =>
      prev.map((e) => {
        if (e.id === ewsId) {
          return {
            ...e,
            status: type,
            sirenActive: type === 'bahaya',
            stroboActive: true,
          };
        }
        return e;
      })
    );

    // Kirim ke backend (akan di-broadcast ke ESP32 dan dicatat di database)
    api.controlEws(ewsId, { command: 'TRIGGER_ALARM', type }).catch((err) => {
      console.warn('Gagal kirim instruksi alarm ke backend:', err.message);
    });
  };

  // Reset Alarm
  const handleResetAlarm = (ewsId: string) => {
    setEwsNodes((prev) =>
      prev.map((e) => {
        if (e.id === ewsId) {
          return {
            ...e,
            status: 'aman',
            sirenActive: false,
            stroboActive: false,
            muted: false,
            sensorData: {
              ...e.sensorData,
              pitchAngle: 0.15,
              rollAngle: -0.05,
              rainfallRate: 0.0,
            },
          };
        }
        return e;
      })
    );

    // Kirim perintah reset ke backend & mikrokontroler ESP32
    api.controlEws(ewsId, { command: 'RESET_ALARM' }).catch((err) => {
      console.warn('Gagal kirim instruksi reset alarm:', err.message);
    });
  };

  // Simulation Scenarios
  const handleTriggerScenario = (
    ewsId: string,
    scenario: 'siaga' | 'bahaya' | 'offline' | 'baterai_lemah' | 'reset'
  ) => {
    setEwsNodes((prev) =>
      prev.map((e) => {
        if (e.id !== ewsId) return e;

        if (scenario === 'bahaya') {
          const newLog: AlarmLog = {
            id: `ALM-${Date.now().toString().slice(-4)}`,
            ewsId: e.id,
            ewsName: e.name,
            timestamp: new Date().toLocaleString('id-ID') + ' WIB',
            type: 'bahaya',
            triggerCause: 'Kemiringan Tanah Ekstrem (Inclinometer) & Getaran ADXL345',
            triggerValue: `Pitch: 3.42° (Ambang: ${e.thresholds.tiltDanger}°) | Getaran: 0.38g`,
            durationMinutes: 1,
            acknowledged: false,
          };
          setAlarmLogs((oldLogs) => [newLog, ...oldLogs]);

          api.controlEws(ewsId, { command: 'TRIGGER_ALARM', type: 'bahaya' }).catch(() => {});

          return {
            ...e,
            status: 'bahaya',
            sirenActive: true,
            stroboActive: true,
            sensorData: {
              ...e.sensorData,
              pitchAngle: 3.42,
              rollAngle: 1.88,
              rainfallRate: 58.2,
              soilMoisture: 84.5,
              vibrationLevel: 0.38,
            },
          };
        } else if (scenario === 'siaga') {
          const newLog: AlarmLog = {
            id: `ALM-${Date.now().toString().slice(-4)}`,
            ewsId: e.id,
            ewsName: e.name,
            timestamp: new Date().toLocaleString('id-ID') + ' WIB',
            type: 'siaga',
            triggerCause: 'Curah Hujan Tinggi & Pergeseran Sudut Awal',
            triggerValue: `Hujan: 32.4 mm/jam | Pitch: 1.65°`,
            durationMinutes: 1,
            acknowledged: false,
          };
          setAlarmLogs((oldLogs) => [newLog, ...oldLogs]);

          api.controlEws(ewsId, { command: 'TRIGGER_ALARM', type: 'siaga' }).catch(() => {});

          return {
            ...e,
            status: 'siaga',
            sirenActive: false,
            stroboActive: true,
            sensorData: {
              ...e.sensorData,
              pitchAngle: 1.65,
              rainfallRate: 32.4,
              soilMoisture: 76.0,
            },
          };
        } else if (scenario === 'offline') {
          return {
            ...e,
            status: 'offline',
            sensorData: {
              ...e.sensorData,
              gsmStatus: 'offline',
              gsmSignalDbm: -115,
            },
          };
        } else if (scenario === 'baterai_lemah') {
          return {
            ...e,
            status: 'baterai_lemah',
            sensorData: {
              ...e.sensorData,
              batteryVoltage: 11.2,
              solarCurrent: 120,
            },
          };
        } else {
          // Reset
          api.controlEws(ewsId, { command: 'RESET_ALARM' }).catch(() => {});
          return {
            ...e,
            status: 'aman',
            sirenActive: false,
            stroboActive: false,
            muted: false,
            sensorData: {
              ...e.sensorData,
              pitchAngle: 0.12,
              rollAngle: -0.06,
              soilMoisture: 42.0,
              rainfallRate: 0.0,
              vibrationLevel: 0.02,
              batteryVoltage: 12.8,
              gsmStatus: 'online',
              gsmSignalDbm: -68,
            },
          };
        }
      })
    );
  };

  // Acknowledge Alarm Log (Tersimpan ke MySQL via API)
  const handleAcknowledgeLog = (logId: string, note: string, author: string) => {
    api.acknowledgeAlarm(logId, note, author)
      .then((updatedLog) => {
        setAlarmLogs((prev) =>
          prev.map((log) => (log.id === logId ? { ...log, ...updatedLog } : log))
        );
      })
      .catch((err) => {
        console.warn('Gagal acknowledge alarm via API, update lokal:', err.message);
        setAlarmLogs((prev) =>
          prev.map((log) => {
            if (log.id === logId) {
              return {
                ...log,
                acknowledged: true,
                acknowledgedBy: author,
                acknowledgeNote: note,
                acknowledgedAt: new Date().toLocaleString('id-ID') + ' WIB',
              };
            }
            return log;
          })
        );
      });
  };

  // Menambahkan Titik EWS Baru ke Backend MySQL & WebSocket
  const handleAddEws = async (newNodeData: Partial<EWSNode>) => {
    try {
      const created = await api.createEws(newNodeData);
      setEwsNodes((prev) => {
        const exists = prev.find((e) => e.id === created.id);
        if (exists) {
          return prev.map((e) => (e.id === created.id ? created : e));
        }
        return [...prev, created];
      });
      setIsAddEWSOpen(false);
    } catch (err: any) {
      console.error('Gagal menambahkan EWS ke server:', err);
      throw err;
    }
  };

  // Menghapus Titik EWS dari Backend MySQL & WebSocket
  const handleDeleteEws = async (ewsId: string) => {
    if (!window.confirm(`Yakin ingin menghapus titik pantau ${ewsId}? Seluruh data telemetri, konfigurasi bot Telegram, dan log sensor terkait akan dihapus secara permanen.`)) {
      return;
    }
    try {
      await api.deleteEws(ewsId);
      setEwsNodes((prev) => prev.filter((e) => e.id !== ewsId));
      if (activeTab === ewsId) {
        setActiveTab('overview');
      }
    } catch (err: any) {
      alert(`Gagal menghapus EWS: ${err.message}`);
    }
  };

  // Mengontrol Aktuator Perangkap Hama
  const handleUpdateTrap = (updated: PestTrapNode) => {
    setPestTraps((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    api.controlPestTrap(updated.id, {
      uvLedStatus: updated.uvLedStatus,
      blowerStatus: updated.blowerStatus,
    }).catch((err: any) => {
      console.warn('Gagal sinkron kendali perangkap hama:', err?.message || err);
    });
  };

  // Check if any siren is currently blaring
  const anySirenActive = ewsNodes.some((e) => e.sirenActive && !e.muted && !globalMute);
  const activeSirenNodes = ewsNodes.filter((e) => e.sirenActive);

  // Sound effect trigger for 12V 110dB siren simulation
  useEffect(() => {
    if (!anySirenActive) {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1400, ctx.currentTime + 0.3);
      osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.6);

      // Low volume for safety
      gain.gain.setValueAtTime(0.08, ctx.currentTime);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      const timer = setInterval(() => {
        if (ctx.state === 'running') {
          osc.frequency.setValueAtTime(800, ctx.currentTime);
          osc.frequency.linearRampToValueAtTime(1400, ctx.currentTime + 0.3);
          osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.6);
        }
      }, 600);

      return () => {
        clearInterval(timer);
        osc.stop();
        ctx.close().catch(() => {});
      };
    } catch {
      // Audio context might be restricted before user gesture
    }
  }, [anySirenActive]);

  // Selected EWS for single dashboard view
  const currentEws = ewsNodes.find((e) => e.id === activeTab);

  if (!currentUser) {
    return <LoginModal onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white transition-colors duration-150">
      {/* Navbar dengan Live WebSocket Status */}
      <Navbar
            currentUser={currentUser}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onLogout={handleLogout}
            onOpenDocs={() => setIsDocsOpen(true)}
            ewsNodes={ewsNodes}
            wsStatus={wsStatus}
            onAddEwsClick={() => setIsAddEWSOpen(true)}
          />

          {/* Active Siren Banner (Page 3 & 6 of Document) */}
          {activeSirenNodes.length > 0 && (
            <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-between shadow-xl animate-pulse sticky top-16 z-30">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <div className="text-xs sm:text-sm font-bold">
                  PERINGATAN BAHAYA: Sirine Lokal 12V 110dB &amp; Lampu Strobo Aktif di{' '}
                  {activeSirenNodes.map((e) => e.name).join(', ')}!
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setGlobalMute(!globalMute)}
                  className="px-3 py-1 bg-red-950/80 hover:bg-red-900 border border-red-300/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {globalMute ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  <span>{globalMute ? 'Unmute Audio' : 'Mute Sirine Audio'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Main Content Container */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

            {/* View Switching */}
            {activeTab === 'overview' && (
              <OverviewAllEWS
                ewsNodes={ewsNodes}
                onSelectEws={(ewsId) => setActiveTab(ewsId)}
                onOpenTelegramConfig={(ews) => setEditingTelegramEws(ews)}
                onOpenTelkomselConfig={(ews) => setEditingTelkomselEws(ews)}
                onAddEwsClick={() => setIsAddEWSOpen(true)}
                onDeleteEws={handleDeleteEws}
              />
            )}

            {currentEws && (
              <EWSDashboardSingle
                key={currentEws.id}
                ews={currentEws}
                currentUser={currentUser}
                onUpdateEws={handleUpdateEws}
                onTriggerAlarm={handleTriggerAlarm}
                onResetAlarm={handleResetAlarm}
              />
            )}

            {activeTab === 'pest-traps' && (
              <PestTrapDashboard
                traps={pestTraps}
                onUpdateTrap={handleUpdateTrap}
              />
            )}

            {activeTab === 'alarm-history' && (
              <AlarmHistoryView
                logs={alarmLogs}
                currentUser={currentUser}
                onAcknowledgeLog={handleAcknowledgeLog}
              />
            )}
          </main>

          {/* Footer */}
          <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-6 text-xs text-slate-600 dark:text-slate-400 transition-colors">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  Sistem Web Monitoring 4 Titik Landslide Early Warning System (EWS)
                </p>
                <p className="text-[11px] text-slate-500">
                  Standar IP65 &bull; Bertenaga Surya Mandiri 30Wp &bull; Transmisi Seluler SIMCom 4G LTE &amp; Bot Telegram
                </p>
              </div>

              <div className="flex items-center gap-4 text-[11px]">
                <button
                  onClick={() => setIsDocsOpen(true)}
                  className="hover:text-blue-600 dark:hover:text-blue-400 underline cursor-pointer"
                >
                  Spesifikasi Teknis &amp; Fabrikasi 3D
                </button>
                <span>&bull;</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  Gateway: WebSocket /ws | REST Port 5000
                </span>
              </div>
            </div>
          </footer>

          {/* Engineering 3D CAD Docs Modal */}
          <EngineeringDocsModal
            isOpen={isDocsOpen}
            onClose={() => setIsDocsOpen(false)}
          />

          {/* Individual Telegram Modal from Overview */}
          {editingTelegramEws && (
            <TelegramConfigModal
              ews={editingTelegramEws}
              isOpen={true}
              onClose={() => setEditingTelegramEws(null)}
              onSave={(newCfg: TelegramConfig) => {
                const updated = {
                  ...editingTelegramEws,
                  telegramConfig: newCfg,
                };
                handleUpdateEws(updated);
                api.updateTelegramConfig(editingTelegramEws.id, newCfg).catch((err) => {
                  console.warn('Gagal menyimpan Telegram config ke backend:', err.message);
                });
                setEditingTelegramEws(null);
              }}
            />
          )}

          {/* Individual Telkomsel Modal from Overview */}
          {editingTelkomselEws && (
            <TelkomselConfigModal
              ews={editingTelkomselEws}
              isOpen={true}
              onClose={() => setEditingTelkomselEws(null)}
              onSave={(newCfg: TelkomselConfig) => {
                const updated = {
                  ...editingTelkomselEws,
                  telkomselConfig: newCfg,
                };
                handleUpdateEws(updated);
                setEditingTelkomselEws(null);
              }}
            />
          )}

          {/* Modal Registrasi Titik EWS Baru */}
          <AddEWSModal
            isOpen={isAddEWSOpen}
            onClose={() => setIsAddEWSOpen(false)}
            onAddEws={handleAddEws}
            existingIds={ewsNodes.map((e) => e.id)}
          />
    </div>
  );
}
