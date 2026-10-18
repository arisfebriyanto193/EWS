'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useEWS } from '../context/EWSContext';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { EngineeringDocsModal } from './EngineeringDocsModal';
import { TelegramConfigModal } from './TelegramConfigModal';
import { TelkomselConfigModal } from './TelkomselConfigModal';
import { AddEWSModal } from './AddEWSModal';
import { LoginModal } from './LoginModal';
import { api } from '../services/api';
import { TelegramConfig, TelkomselConfig } from '../types';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();

  const {
    currentUser,
    ewsNodes,
    alarmLogs,
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
    handleLogin,
    handleLogout,
    handleUpdateEws,
    handleAddEws,
    anySirenActive,
    activeSirenNodes,
  } = useEWS();

  // Hitung activeTab dari pathname URL
  let activeTab = 'overview';
  if (pathname === '/trap' || pathname === '/traps') {
    activeTab = 'pest-traps';
  } else if (pathname === '/alarms' || pathname === '/alarm') {
    activeTab = 'alarm-history';
  } else if (pathname === '/settings') {
    activeTab = 'account-settings';
  } else if (pathname.startsWith('/ews/')) {
    activeTab = pathname.replace('/ews/', '');
  } else if (pathname === '/ews') {
    activeTab = ewsNodes[0]?.id || 'EWS-01';
  } else if (pathname === '/' || pathname === '/overview') {
    activeTab = 'overview';
  }

  const handleSelectTab = (tab: string) => {
    if (tab === 'overview') {
      router.push('/');
    } else if (tab === 'pest-traps') {
      router.push('/trap');
    } else if (tab === 'alarm-history') {
      router.push('/alarms');
    } else if (tab === 'account-settings') {
      router.push('/settings');
    } else if (tab.startsWith('EWS-')) {
      router.push(`/ews/${tab}`);
    } else {
      router.push('/');
    }
  };

  const currentEws = ewsNodes.find((e) => e.id === activeTab);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0c0a15] text-slate-800 dark:text-slate-100 flex font-sans selection:bg-purple-700 selection:text-white transition-colors duration-150">
      {/* Sidebar Navigasi Samping Kiri */}
      <Sidebar
        currentUser={currentUser}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onLogout={handleLogout}
        onOpenDocs={() => setIsDocsOpen(true)}
        ewsNodes={ewsNodes}
        alarmLogs={alarmLogs}
        wsStatus={wsStatus}
        onAddEwsClick={() => {
          if (!currentUser) {
            openLoginModal('Silakan login sebagai Superadmin untuk menambah titik pantau EWS baru.');
          } else {
            setIsAddEWSOpen(true);
          }
        }}
        isOpenMobile={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onRequireLogin={openLoginModal}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72 min-h-screen">
        {/* Top Header Bar */}
        <Header
          currentUser={currentUser}
          activeTab={activeTab}
          activeEws={currentEws}
          onOpenMobileMenu={() => setMobileSidebarOpen(true)}
          anySirenActive={anySirenActive}
          activeSirenNodes={activeSirenNodes}
          globalMute={globalMute}
          onToggleMute={() => setGlobalMute(!globalMute)}
          onAddEwsClick={() => {
            if (!currentUser) {
              openLoginModal('Silakan login sebagai Superadmin untuk mendaftarkan titik pantau EWS baru.');
            } else {
              setIsAddEWSOpen(true);
            }
          }}
          onRequireLogin={openLoginModal}
        />

        {/* Main Content Container (Isi Route Berdasarkan Halaman URL) */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {children}
        </main>

        {/* Clean Academic Footer */}
        <footer className="border-t border-slate-200 dark:border-purple-950/40 bg-white dark:bg-[#110e1f] py-5 text-xs text-slate-500 dark:text-purple-300/70 transition-colors mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Pusat Kendali Riset Geoteknik &amp; Landslide Early Warning System (EWS)
              </p>
              <p className="text-[11px] text-slate-500 dark:text-purple-300/60">
                Multi-Node Telemetry &bull; Standar SNI 8460:2017 &bull; Sirine Lokal 12V 110dB &bull; Bot Telegram &amp; Kuota Telkomsel
              </p>
            </div>

            <div className="flex items-center gap-4 text-[11px]">
              <button
                type="button"
                onClick={() => setIsDocsOpen(true)}
                className="hover:text-purple-700 dark:hover:text-purple-300 underline font-medium cursor-pointer transition-colors"
              >
                Spesifikasi Teknis &amp; CAD
              </button>
              <span>&bull;</span>
              <span className="font-mono text-slate-600 dark:text-purple-300/80">
                Gateway: WebSocket /ws &bull; Port 5000
              </span>
            </div>
          </div>
        </footer>
      </div>

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

      {/* Login Modal for Guest when triggering configuration */}
      {isLoginModalOpen && (
        <LoginModal
          onLogin={handleLogin}
          onClose={closeLoginModal}
          notice={loginNotice}
          isOverlay={true}
        />
      )}
    </div>
  );
};
