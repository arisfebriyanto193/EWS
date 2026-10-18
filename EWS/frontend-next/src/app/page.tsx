'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useEWS } from '@/context/EWSContext';
import { OverviewAllEWS } from '@/components/OverviewAllEWS';

export default function HomePage() {
  const router = useRouter();
  const {
    ewsNodes,
    currentUser,
    setEditingTelegramEws,
    setEditingTelkomselEws,
    setIsAddEWSOpen,
    handleDeleteEws,
    openLoginModal,
    requireAuth,
  } = useEWS();

  return (
    <OverviewAllEWS
      ewsNodes={ewsNodes}
      currentUser={currentUser}
      onSelectEws={(ewsId) => router.push(`/ews/${ewsId}`)}
      onOpenTelegramConfig={(ews) => setEditingTelegramEws(ews)}
      onOpenTelkomselConfig={(ews) => setEditingTelkomselEws(ews)}
      onAddEwsClick={() =>
        requireAuth(
          () => setIsAddEWSOpen(true),
          'Silakan login sebagai Superadmin untuk mendaftarkan stasiun EWS baru.'
        )
      }
      onDeleteEws={handleDeleteEws}
      onRequireLogin={openLoginModal}
    />
  );
}
