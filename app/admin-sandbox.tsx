import React from 'react';
import { Redirect } from 'expo-router';
import { AdminSandboxScreen } from '../src/components/admin-sandbox/AdminSandboxScreen';

export default function AdminSandboxRoute() {
  if (!__DEV__) return <Redirect href="/admin" />;
  return <AdminSandboxScreen />;
}
