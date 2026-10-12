import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { getAppRole, getRoleHome } from '../src/constants/authRoles';

export default function MissingPage() {
  const router = useRouter();
  const { profile, isSignedIn } = useAuth();
  const { appColors } = useTheme();
  return <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: appColors.surface }}>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={[styles.title, { color: appColors.onSurface }]}>Page unavailable</Text>
      <Text style={{ color: appColors.onSurfaceVariant }}>This link may have expired or moved. Return to CebSpot to continue.</Text>
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => router.replace(isSignedIn ? getRoleHome(getAppRole(profile)) : '/login')}>
        <Text style={{ color: appColors.onSurface }}>Return to CebSpot</Text>
      </Pressable>
    </View>
  </ScrollView>;
}
const styles = StyleSheet.create({ content: { flexGrow: 1, justifyContent: 'center', padding: 24 }, card: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 20 }, title: { fontSize: 24, fontWeight: '700', flexShrink: 1 }, button: { minHeight: 48, padding: 12, borderWidth: 1, borderRadius: 12, justifyContent: 'center', alignItems: 'center' } });
