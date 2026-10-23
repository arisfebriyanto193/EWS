'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTrap } from '../context/TrapContext';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { LoginModal } from './LoginModal';

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();

  const {
    currentUser,
    pestTraps,
    wsStatus,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    isLoginModalOpen,
    loginNotice,
    openLoginModal,
    closeLoginModal,
    handleLogin,
    handleLogout,
  } = useTrap();

  // Hitung activeTab dari pathname URL
  let activeTab = 'pest-traps';
  if (pathname === '/settings') {
    activeTab = 'account-settings';
  }

  const handleSelectTab = (tab: string) => {
    if (tab === 'account-settings') {
      router.push('/settings');
    } else {
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f19] text-slate-800 dark:text-slate-100 flex font-sans selection:bg-blue-600 selection:text-white transition-colors duration-150">
      {/* Sidebar Navigasi Samping Kiri */}
      <Sidebar
        currentUser={currentUser}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onLogout={handleLogout}
        pestTraps={pestTraps}
        wsStatus={wsStatus}
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
          wsStatus={wsStatus}
          onOpenMobileMenu={() => setMobileSidebarOpen(true)}
          onRequireLogin={openLoginModal}
        />

        {/* Main Content Container */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] py-5 text-xs text-slate-500 dark:text-slate-400 transition-colors mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Sistem Monitoring &amp; Kendali Fototaksis Perangkap Hama IoT
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Otomatisasi Blower &amp; LED Spektrum UV &bull; Manajemen Energi Panel Surya &bull; Logging Telemetri Waktu Nyata
              </p>
            </div>

            <div className="flex items-center gap-4 text-[11px]">
              <span className="font-mono text-slate-600 dark:text-slate-300">
                Gateway: WebSocket /ws &bull; Port 5001
              </span>
            </div>
          </div>
        </footer>
      </div>

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
