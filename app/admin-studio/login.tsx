import React from 'react';
import { Redirect } from 'expo-router';
import { AdminStudioAuth } from '../../src/components/admin-studio/AdminStudioScreens';

export default function AdminStudioLoginRoute() {
  if (!__DEV__) return <Redirect href="/admin" />;
  return <AdminStudioAuth />;
}
