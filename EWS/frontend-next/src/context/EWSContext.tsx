'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  EWSNode,
  AlarmLog,
  UserAccount,
  TelegramConfig,
  TelkomselConfig,
  PestTrapNode,
} from '../types';
import {
  INITIAL_EWS_NODES,
  INITIAL_ALARM_LOGS,
  INITIAL_PEST_TRAPS,
} from '../mockData';
import { api } from '../services/api';
import { wsClient } from '../services/websocket';

interface EWSContextType {
  currentUser: UserAccount | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<UserAccount | null>>;
  ewsNodes: EWSNode[];
  setEwsNodes: React.Dispatch<React.SetStateAction<EWSNode[]>>;
  alarmLogs: AlarmLog[];
  setAlarmLogs: React.Dispatch<React.SetStateAction<AlarmLog[]>>;
  pestTraps: PestTrapNode[];
  setPestTraps: React.Dispatch<React.SetStateAction<PestTrapNode[]>>;
  wsStatus: 'connected' | 'connecting' | 'disconnected';
  globalMute: boolean;
  setGlobalMute: React.Dispatch<React.SetStateAction<boolean>>;
  isDocsOpen: boolean;
  setIsDocsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isAddEWSOpen: boolean;
  setIsAddEWSOpen: React.Dispatch<React.SetStateAction<boolean>>;
  editingTelegramEws: EWSNode | null;
  setEditingTelegramEws: React.Dispatch<React.SetStateAction<EWSNode | null>>;
  editingTelkomselEws: EWSNode | null;
  setEditingTelkomselEws: React.Dispatch<React.SetStateAction<EWSNode | null>>;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isLoginModalOpen: boolean;
  loginNotice: string;
  openLoginModal: (notice?: string) => void;
  closeLoginModal: () => void;
  requireAuth: (action: () => void, notice?: string) => void;
  handleLogin: (user: UserAccount, token: string) => void;
  handleLogout: () => void;
  refreshBackendData: () => void;
  handleUpdateEws: (updated: EWSNode) => void;
  handleTriggerAlarm: (ewsId: string, type: 'siaga' | 'bahaya') => void;
  handleResetAlarm: (ewsId: string) => void;
  handleTriggerScenario: (
    ewsId: string,
    scenario: 'siaga' | 'bahaya' | 'offline' | 'baterai_lemah' | 'reset'
  ) => void;
  handleAcknowledgeLog: (logId: string, note: string, author: string) => void;
  handleAddEws: (newNodeData: Partial<EWSNode>) => Promise<void>;
  handleDeleteEws: (ewsId: string) => Promise<void>;
  handleUpdateTrap: (updated: PestTrapNode) => void;
  handleAddTrap: (newTrapData: Partial<PestTrapNode>) => Promise<any>;
  handleDeleteTrap: (id: string) => Promise<any>;
  handleRequestFastTelemetry: (trapId: string) => void;
  anySirenActive: boolean;
  activeSirenNodes: EWSNode[];
}

const EWSContext = createContext<EWSContextType | undefined>(undefined);

export const EWSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Authentication: starts at null so visitor can monitor without logging in
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);

  // Application Data States
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Login Modal State for Visitors
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginNotice, setLoginNotice] = useState('');

  const openLoginModal = (notice = '') => {
    setLoginNotice(notice);
    setIsLoginModalOpen(true);
  };

  const closeLoginModal = () => {
    setIsLoginModalOpen(false);
    setLoginNotice('');
  };

  const requireAuth = (action: () => void, notice = 'Silakan login terlebih dahulu untuk melakukan konfigurasi.') => {
    if (currentUser) {
      action();
    } else {
      openLoginModal(notice);
    }
  };

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

    api.getPestTraps()
      .then((data) => {
        if (data && data.length > 0) setPestTraps(data);
      })
      .catch((err) => console.warn('Gagal memuat perangkap hama:', err.message));

    api.getAlarmLogs()
      .then((data) => {
        if (data && data.length > 0) setAlarmLogs(data);
      })
      .catch((err) => console.warn('Gagal memuat riwayat alarm:', err.message));
  };

  useEffect(() => {
    refreshBackendData();
  }, []);

  // 3. Hubungkan ke WebSocket Gateway untuk Live Streaming Telemetri
  useEffect(() => {
    wsClient.connect();

    const unsubStatus = wsClient.onStatusChange((status) => {
      setWsStatus(status);
    });

    // Real-time Telemetri Lengkap EWS dari ESP32
    const unsubEws = wsClient.on('ews/+/telemetry', (payload) => {
      if (!payload || !payload.ewsId) return;
      lastReceivedRef.current[payload.ewsId] = Date.now();
      setEwsNodes((prev) =>
        prev.map((e) => {
          if (e.id === payload.ewsId) {
            const incomingReason = payload.alarmReason || payload.sensorData?.alarmReason || e.alarmReason;
            return {
              ...e,
              status: payload.status && payload.status !== 'offline' ? payload.status : (e.status === 'offline' ? 'aman' : e.status),
              alarmReason: incomingReason,
              sirenActive: payload.sirenActive !== undefined ? payload.sirenActive : e.sirenActive,
              stroboActive: payload.stroboActive !== undefined ? payload.stroboActive : e.stroboActive,
              thresholds: payload.thresholds ? { ...e.thresholds, ...payload.thresholds } : e.thresholds,
              sensorData: {
                ...e.sensorData,
                ...(payload.sensorData || {}),
                alarmReason: incomingReason,
                gsmStatus: 'online',
                lastUpdated: 'Live via WS (Baru saja)',
              },
            };
          }
          return e;
        })
      );
    });

    // Real-time Telemetri Per-Data / Per-Topik Sensor
    const unsubSensorUpdate = wsClient.on('ews/sensor_update', (eventData: any) => {
      if (!eventData || !eventData.ewsId || !eventData.sensorKey) return;
      const { ewsId, sensorKey, payload } = eventData;

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
        ip: 'ipAddress',
        wifi_ssid: 'wifiSsid',
        wifi_rssi: 'wifiRssi',
        uptime: 'uptimeHours',
      };

      const targetProp = keyPropMap[sensorKey.toLowerCase()];

      setEwsNodes((prev) =>
        prev.map((e) => {
          if (e.id === ewsId) {
            const updated = { ...e.sensorData };

            if (typeof payload === 'object' && payload !== null) {
              if (payload.sensorData) {
                Object.assign(updated, payload.sensorData);
              }
              if (targetProp && 'rawValue' in payload) {
                (updated as any)[targetProp] = payload.rawValue;
              }
            } else {
              if (targetProp === 'ipAddress' || targetProp === 'wifiSsid') {
                (updated as any)[targetProp] = String(payload);
              } else {
                const numVal = parseFloat(payload);
                if (targetProp && !isNaN(numVal)) {
                  (updated as any)[targetProp] = numVal;
                }
              }
            }
            updated.gsmStatus = 'online';
            updated.lastUpdated = 'Live WS (Baru saja)';

            const incomingReason = (typeof payload === 'object' && (payload?.alarmReason || payload?.sensorData?.alarmReason)) || e.alarmReason;
            if (incomingReason) {
              updated.alarmReason = incomingReason;
            }

            let updatedStatus = e.status;
            if (typeof payload === 'object' && payload?.status && payload.status !== 'offline') {
              if (payload.status !== 'aman' || (e.status !== 'bahaya' && e.status !== 'siaga' && e.status !== 'baterai_lemah')) {
                updatedStatus = payload.status;
              }
            } else if (e.status === 'offline') {
              updatedStatus = 'aman';
            }

            return {
              ...e,
              status: updatedStatus,
              alarmReason: incomingReason,
              sirenActive: typeof payload === 'object' && payload?.sirenActive !== undefined ? payload.sirenActive : e.sirenActive,
              stroboActive: typeof payload === 'object' && payload?.stroboActive !== undefined ? payload.stroboActive : e.stroboActive,
              sensorData: updated,
            };
          }
          return e;
        })
      );
    });

    // Real-time Status Aktuator EWS
    const unsubEwsStatus = wsClient.on('ews/+/status', (payload) => {
      if (!payload || !payload.ewsId) return;
      if (payload.status !== 'offline') {
        lastReceivedRef.current[payload.ewsId] = Date.now();
      }
      setEwsNodes((prev) =>
        prev.map((e) => {
          if (e.id === payload.ewsId) {
            const isOffline = payload.status === 'offline';
            const updatedThresholds = { ...e.thresholds };
            if (payload.safePitch !== undefined) updatedThresholds.safeTiltPitch = payload.safePitch;
            if (payload.safeRoll !== undefined) updatedThresholds.safeTiltRoll = payload.safeRoll;
            if (payload.safeSoil !== undefined) updatedThresholds.safeSoilMoisture = payload.safeSoil;
            if (payload.thresholds) Object.assign(updatedThresholds, payload.thresholds);

            return {
              ...e,
              status: payload.status !== undefined ? payload.status : e.status,
              sirenActive: payload.sirenActive !== undefined ? payload.sirenActive : e.sirenActive,
              stroboActive: payload.stroboActive !== undefined ? payload.stroboActive : e.stroboActive,
              muted: payload.muted !== undefined ? payload.muted : e.muted,
              thresholds: updatedThresholds,
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

    // Real-time Pemicuan & Konfirmasi Alarm
    const unsubAlarm = wsClient.on('alarms', (payload) => {
      if (payload && payload.event === 'ALARM_ACTIVE') {
        api.getAlarmLogs().then((logs) => setAlarmLogs(logs)).catch(() => {});
      } else if (payload && payload.event === 'ALARM_ACKNOWLEDGED' && payload.data) {
        setAlarmLogs((prev) =>
          prev.map((l) => (l.id === payload.data.id ? { ...l, ...payload.data } : l))
        );
      }
    });

    // Real-time Registrasi & Hapus Titik EWS
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

    // Real-time Telegram Update
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

    // Real-time Telemetri Perangkap Hama
    const unsubTrapTelemetry = wsClient.on('traps/+/telemetry', (payload: any) => {
      if (payload && payload.trapId && payload.payload) {
        const data = payload.payload;
        setPestTraps((prev) =>
          prev.map((t) => {
            if (t.id === payload.trapId) {
              return {
                ...t,
                ...data,
                lastSeenAt: new Date().toISOString(),
              };
            }
            return t;
          })
        );
      }
    });

    const unsubTrapCreated = wsClient.on('traps/node/created', (payload: any) => {
      if (payload && payload.trap) {
        setPestTraps((prev) => {
          if (prev.some((t) => t.id === payload.trap.id)) return prev;
          return [...prev, payload.trap];
        });
      }
    });

    const unsubTrapDeleted = wsClient.on('traps/node/deleted', (payload: any) => {
      if (payload && payload.trapId) {
        setPestTraps((prev) => prev.filter((t) => t.id !== payload.trapId));
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
      unsubTrapTelemetry();
      unsubTrapCreated();
      unsubTrapDeleted();
    };
  }, []);

  // Heartbeat ke ESP32
  useEffect(() => {
    if (wsStatus !== 'connected') return;

    const pingActiveNodes = () => {
      const activeIds = ewsNodes.length > 0 ? ewsNodes.map((n) => n.id) : ['EWS-01'];
      activeIds.forEach((nodeId) => {
        wsClient.publish(`ews/${nodeId}/command`, {
          command: 'CLIENT_HEARTBEAT',
          ewsId: nodeId,
          timestamp: Date.now(),
        });
      });
    };

    pingActiveNodes();
    const heartbeatTimer = setInterval(pingActiveNodes, 10000);
    return () => clearInterval(heartbeatTimer);
  }, [wsStatus, ewsNodes.length]);

  // Deteksi Otomatis Node Offline
  useEffect(() => {
    const OFFLINE_THRESHOLD_MS = 360000;

    const timer = setInterval(() => {
      const now = Date.now();

      setEwsNodes((prev) => {
        let hasChanges = false;
        const updated = prev.map((node) => {
          const lastSeen = lastReceivedRef.current[node.id];

          if (lastSeen && now - lastSeen > OFFLINE_THRESHOLD_MS) {
            if (node.status !== 'offline') {
              hasChanges = true;
              return {
                ...node,
                status: 'offline' as const,
                sirenActive: false,
                sensorData: {
                  ...node.sensorData,
                  gsmStatus: 'offline' as const,
                  lastUpdated: 'Terputus (Offline)',
                },
              };
            }
          }
          return node;
        });

        return hasChanges ? updated : prev;
      });
    }, 15000);

    return () => clearInterval(timer);
  }, []);

  // Auth Handlers
  const handleLogin = (user: UserAccount, token: string) => {
    setCurrentUser(user);
    closeLoginModal();
  };

  const handleLogout = () => {
    localStorage.removeItem('ews_token');
    localStorage.removeItem('ews_user');
    setCurrentUser(null);
  };

  // EWS Handlers
  const handleUpdateEws = (updated: EWSNode) => {
    setEwsNodes((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    api.updateEwsThresholds(updated.id, updated.thresholds).catch((err) => {
      console.warn('Gagal sinkron threshold ke backend:', err.message);
    });
  };

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
    api.controlEws(ewsId, { command: 'TRIGGER_ALARM', type }).catch((err) => {
      console.warn('Gagal kirim instruksi alarm ke backend:', err.message);
    });
  };

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
    api.controlEws(ewsId, { command: 'RESET_ALARM' }).catch((err) => {
      console.warn('Gagal kirim instruksi reset alarm:', err.message);
    });
  };

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

  const handleDeleteEws = async (ewsId: string) => {
    if (!window.confirm(`Yakin ingin menghapus titik pantau ${ewsId}? Seluruh data telemetri, konfigurasi bot Telegram, dan log sensor terkait akan dihapus secara permanen.`)) {
      return;
    }
    try {
      await api.deleteEws(ewsId);
      setEwsNodes((prev) => prev.filter((e) => e.id !== ewsId));
    } catch (err: any) {
      alert(`Gagal menghapus EWS: ${err.message}`);
    }
  };

  const handleUpdateTrap = (updated: PestTrapNode) => {
    setPestTraps((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    api.controlTrap(updated.id, {
      uvLedStatus: updated.uvLedStatus,
      blowerStatus: updated.blowerStatus,
      mode: updated.mode,
      activePreset: updated.activePreset,
      startTime: updated.startTime,
      endTime: updated.endTime,
      ledRotationInterval: updated.ledRotationInterval,
      manualIntervalMin: updated.manualIntervalMin,
      manualDurationSec: updated.manualDurationSec,
      ledColor: updated.ledColor,
      blowerMode: updated.blowerMode,
      ledRunning: updated.ledRunning,
      presets: updated.presets,
    }).catch((err: any) => {
      console.warn('Gagal sinkron kendali perangkap hama:', err?.message || err);
    });
  };

  const handleAddTrap = async (newTrapData: Partial<PestTrapNode>) => {
    try {
      const created = await api.createTrap(newTrapData);
      setPestTraps((prev) => {
        if (prev.some((t) => t.id === created.id)) return prev;
        return [...prev, created];
      });
      return created;
    } catch (err: any) {
      alert(`Gagal menambah perangkat perangkap: ${err?.message || err}`);
      throw err;
    }
  };

  const handleDeleteTrap = async (id: string) => {
    try {
      await api.deleteTrap(id);
      setPestTraps((prev) => prev.filter((t) => t.id !== id));
    } catch (err: any) {
      alert(`Gagal menghapus perangkat perangkap: ${err?.message || err}`);
      throw err;
    }
  };

  const handleRequestFastTelemetry = (trapId: string) => {
    wsClient.publish(`traps/${trapId}/command`, {
      command: 'FAST_TELEMETRY',
      trapId,
      timestamp: Date.now(),
    });
    api.controlTrap(trapId, { command: 'FAST_TELEMETRY' }).catch(() => {});
  };

  // Siren sounds
  const anySirenActive = ewsNodes.some((e) => e.sirenActive && !e.muted && !globalMute);
  const activeSirenNodes = ewsNodes.filter((e) => e.sirenActive);

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

  return (
    <EWSContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        ewsNodes,
        setEwsNodes,
        alarmLogs,
        setAlarmLogs,
        pestTraps,
        setPestTraps,
        wsStatus,
        globalMute,
        setGlobalMute,
        isDocsOpen,
        setIsDocsOpen,
        isAddEWSOpen,
        setIsAddEWSOpen,
        editingTelegramEws,
        setEditingTelegramEws,
        editingTelkomselEws,
        setEditingTelkomselEws,
        mobileSidebarOpen,
        setMobileSidebarOpen,
        isLoginModalOpen,
        loginNotice,
        openLoginModal,
        closeLoginModal,
        requireAuth,
        handleLogin,
        handleLogout,
        refreshBackendData,
        handleUpdateEws,
        handleTriggerAlarm,
        handleResetAlarm,
        handleTriggerScenario,
        handleAcknowledgeLog,
        handleAddEws,
        handleDeleteEws,
        handleUpdateTrap,
        handleAddTrap,
        handleDeleteTrap,
        handleRequestFastTelemetry,
        anySirenActive,
        activeSirenNodes,
      }}
    >
      {children}
    </EWSContext.Provider>
  );
};

export const useEWS = () => {
  const context = useContext(EWSContext);
  if (!context) {
    throw new Error('useEWS must be used within an EWSProvider');
  }
  return context;
};
