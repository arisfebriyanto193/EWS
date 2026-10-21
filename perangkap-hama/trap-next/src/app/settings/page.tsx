'use client';

import React from 'react';
import { useEWS } from '@/context/EWSContext';
import { AccountSettingsView } from '@/components/AccountSettingsView';

export default function SettingsPage() {
  const {
    currentUser,
    setCurrentUser,
    openLoginModal,
  } = useEWS();

  return (
    <AccountSettingsView
      currentUser={currentUser}
      onUpdateUser={(updatedUser) => {
        setCurrentUser(updatedUser);
        localStorage.setItem('trap_user', JSON.stringify(updatedUser));
        localStorage.setItem('ews_user', JSON.stringify(updatedUser));
      }}
      onRequireLogin={openLoginModal}
    />
  );
}
