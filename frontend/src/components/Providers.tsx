'use client';

import { DashboardProvider } from '@/context/DashboardContext';
import { AuthProvider } from '@/context/AuthContext';
import { RealtimeProvider } from '@/context/RealtimeContext';
import { ReminderProvider } from '@/context/ReminderContext';
import { ActivityRealtimeNotifications } from '@/components/Activity/ActivityRealtimeNotifications';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <ReminderProvider>
          <DashboardProvider>
            {children}
            <ActivityRealtimeNotifications />
          </DashboardProvider>
        </ReminderProvider>
      </RealtimeProvider>
    </AuthProvider>
  );
}
