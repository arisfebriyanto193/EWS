'use client';

import React from 'react';
import { useEWS } from '@/context/EWSContext';
import { PestTrapDashboard } from '@/components/PestTrapDashboard';

export default function TrapPage() {
  const {
    pestTraps,
    currentUser,
    handleUpdateTrap,
    handleAddTrap,
    handleDeleteTrap,
    handleRequestFastTelemetry,
    openLoginModal,
  } = useEWS();

  return (
    <PestTrapDashboard
      traps={pestTraps}
      currentUser={currentUser}
      onUpdateTrap={handleUpdateTrap}
      onAddTrap={handleAddTrap}
      onDeleteTrap={handleDeleteTrap}
      onRequestFastTelemetry={handleRequestFastTelemetry}
      onRequireLogin={openLoginModal}
    />
  );
}
