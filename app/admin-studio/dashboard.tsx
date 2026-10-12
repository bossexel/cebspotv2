import React from 'react';
import { Redirect } from 'expo-router';
import { AdminStudioDashboard } from '../../src/components/admin-studio/AdminStudioScreens';

export default function AdminStudioDashboardRoute() {
  if (!__DEV__) return <Redirect href="/admin" />;
  return <AdminStudioDashboard />;
}
