import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import AdminConsoleScreen from '../../admin';
import { hasAdminAccess } from '../../../src/constants/authRoles';
import { useScopedAuth } from '../../../src/hooks/useScopedAuth';
import type { Spot } from '../../../src/types';

// Report inspection stays inside the authenticated admin site. Customer venue
// details, reservations and checkout routes are not part of this route tree.
export default function AdminSpotDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client, profile, loading } = useScopedAuth('admin');
  const isAdmin = hasAdminAccess(profile);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !id) return;
    let mounted = true;
    setSpot(null);
    setError(null);
    client.from('spots').select('*').eq('id', id).maybeSingle().then(({ data, error }) => {
      if (!mounted) return;
      if (error || !data) setError(error?.message ?? 'This spot is unavailable.');
      else setSpot(data as Spot);
    }, () => { if (mounted) setError('Unable to load this spot. Try again from the reports screen.'); });
    return () => { mounted = false; };
  }, [client, id, isAdmin]);

  if (loading || !isAdmin) return <AdminConsoleScreen />;
  return <ScrollView contentContainerStyle={styles.page}>
    <Link href="/admin">Back to admin console</Link>
    <Text style={styles.heading}>Spot details</Text>
    {error ? <Text accessibilityRole="alert">{error}</Text> : !spot ? <ActivityIndicator /> : <View style={styles.details}>
      <Text style={styles.heading}>{spot.name}</Text>
      <Text>{spot.category} · {spot.address}</Text>
      <Text>{spot.description}</Text>
      <Text>Visibility: {spot.is_public ? 'Public' : 'Private'}</Text>
      {(spot.images ?? []).map((uri) => <Image key={uri} source={{ uri }} style={styles.image} resizeMode="contain" />)}
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { padding: 32, gap: 20, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  heading: { fontSize: 26, fontWeight: '700' },
  details: { gap: 16 },
  image: { width: '100%', height: 300 },
});
