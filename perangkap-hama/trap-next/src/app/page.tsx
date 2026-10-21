'use client';

import React from 'react';
import { useTrap } from '@/context/TrapContext';
import { PestTrapDashboard } from '@/components/PestTrapDashboard';

export default function HomePage() {
  const {
    pestTraps,
    currentUser,
    handleUpdateTrap,
    handleAddTrap,
    handleDeleteTrap,
    handleRequestFastTelemetry,
    openLoginModal,
  } = useTrap();

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
