import React from 'react';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function UnsupportedWebPage() {
  return <View style={styles.page}>
    <Text style={styles.title}>CebSpot Admin</Text>
    <Text>Customers and venue owners use the CebSpot Android app.</Text>
    <Link href="/admin">Open admin sign-in</Link>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '700' },
});
