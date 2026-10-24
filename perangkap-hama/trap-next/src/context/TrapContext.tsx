'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { PestTrapNode, UserAccount } from '../types';
import { INITIAL_PEST_TRAPS } from '../mockData';
import { api } from '../services/api';
import { wsClient } from '../services/websocket';

export interface TrapContextType {
  currentUser: UserAccount | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<UserAccount | null>>;
  pestTraps: PestTrapNode[];
  setPestTraps: React.Dispatch<React.SetStateAction<PestTrapNode[]>>;
  wsStatus: 'connected' | 'connecting' | 'disconnected';
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
  handleUpdateTrap: (updated: PestTrapNode) => void;
  handleAddTrap: (newTrapData: Partial<PestTrapNode>) => Promise<any>;
  handleDeleteTrap: (id: string) => Promise<any>;
  handleRequestFastTelemetry: (trapId: string) => void;
}

const TrapContext = createContext<TrapContextType | undefined>(undefined);

export const TrapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [pestTraps, setPestTraps] = useState<PestTrapNode[]>(INITIAL_PEST_TRAPS);
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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

  const requireAuth = (action: () => void, notice = 'Silakan masuk dengan akun terverifikasi.') => {
    if (!currentUser) {
      openLoginModal(notice);
      return;
    }
    action();
  };

  const handleLogin = (user: UserAccount, token: string) => {
    setCurrentUser(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem('trap_token', token);
      localStorage.setItem('trap_user', JSON.stringify(user));
    }
    closeLoginModal();
  };

  const handleLogout = () => {
    setCurrentUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('trap_token');
      localStorage.removeItem('trap_user');
      localStorage.removeItem('ews_token');
      localStorage.removeItem('ews_user');
    }
  };

  // Verifikasi Sesi Token saat Mount
  useEffect(() => {
    const savedToken = typeof window !== 'undefined' ? (localStorage.getItem('trap_token') || localStorage.getItem('ews_token')) : null;
    if (savedToken) {
      api.getMe()
        .then((res) => {
          if (res.success && res.user) {
            setCurrentUser(res.user);
          }
        })
        .catch(() => {
          handleLogout();
        });
    }
  }, []);

  // Sinkronisasi data awal dari backend REST API
  const refreshBackendData = () => {
    api.getPestTraps()
      .then((traps) => {
        if (Array.isArray(traps) && traps.length > 0) {
          setPestTraps(traps);
        }
      })
      .catch((err) => {
        console.warn('Backend REST belum merespons, menggunakan fallback lokal:', err?.message || err);
      });
  };

  useEffect(() => {
    refreshBackendData();
  }, []);

  // Hubungkan WebSocket dan tangani pembaruan telemetri
  useEffect(() => {
    wsClient.connect();

    const unsubStatus = wsClient.onStatusChange((status) => {
      setWsStatus(status);
    });

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
      unsubTrapTelemetry();
      unsubTrapCreated();
      unsubTrapDeleted();
    };
  }, []);

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
      sensorCooldownSec: updated.sensorCooldownSec,
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
  };

  return (
    <TrapContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        pestTraps,
        setPestTraps,
        wsStatus,
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
        handleUpdateTrap,
        handleAddTrap,
        handleDeleteTrap,
        handleRequestFastTelemetry,
      }}
    >
      {children}
    </TrapContext.Provider>
  );
};

export const useTrap = () => {
  const context = useContext(TrapContext);
  if (!context) {
    throw new Error('useTrap must be used within a TrapProvider');
  }
  return context;
};

// Alias to maintain 1:1 backwards compatibility with existing components
export const useEWS = useTrap;
export const EWSProvider = TrapProvider;
