'use client';

import React from 'react';
import { useEWS } from '@/context/EWSContext';
import { AlarmHistoryView } from '@/components/AlarmHistoryView';

export default function AlarmsPage() {
  const {
    alarmLogs,
    currentUser,
    handleAcknowledgeLog,
    openLoginModal,
  } = useEWS();

  return (
    <AlarmHistoryView
      logs={alarmLogs}
      currentUser={currentUser}
      onAcknowledgeLog={handleAcknowledgeLog}
      onRequireLogin={openLoginModal}
    />
  );
}
