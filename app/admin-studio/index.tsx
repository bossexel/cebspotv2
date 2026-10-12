import React from 'react';
import { Redirect } from 'expo-router';
import { AdminStudioLanding } from '../../src/components/admin-studio/AdminStudioScreens';

export default function AdminStudioLandingRoute() {
  if (!__DEV__) return <Redirect href="/admin" />;
  return <AdminStudioLanding />;
}
