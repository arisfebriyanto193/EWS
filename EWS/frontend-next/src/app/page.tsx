'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useEWS } from '@/context/EWSContext';
import { OverviewAllEWS } from '@/components/OverviewAllEWS';
import { EWSNode } from '@/types';

export default function HomePage() {
  const router = useRouter();
  const {
    ewsNodes,
    currentUser,
    setEditingTelegramEws,
    setEditingTelkomselEws,
    setEditingConfigEws,
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
      onOpenTelegramConfig={(ews: EWSNode) => setEditingTelegramEws(ews)}
      onOpenTelkomselConfig={(ews: EWSNode) => setEditingTelkomselEws(ews)}
      onOpenEditConfig={(ews: EWSNode) => setEditingConfigEws(ews)}
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
