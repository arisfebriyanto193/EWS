'use client';

import React from 'react';
import { useTrap } from '@/context/TrapContext';
import { PestTrapDashboard } from '@/components/PestTrapDashboard';

export default function HomePage() {
  const {
    pestTraps,
    currentUser,
    selectedTrapId,
    setSelectedTrapId,
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
      selectedTrapId={selectedTrapId}
      onSelectTrap={setSelectedTrapId}
      onUpdateTrap={handleUpdateTrap}
      onAddTrap={handleAddTrap}
      onDeleteTrap={handleDeleteTrap}
      onRequestFastTelemetry={handleRequestFastTelemetry}
      onRequireLogin={openLoginModal}
    />
  );
}
