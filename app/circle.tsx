import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { Navigation, QrCode, UserPlus, Users } from 'lucide-react-native';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { lightTileUrl, mapAttribution } from '../src/constants/mapTiles';
import { sampleCircles } from '../src/constants/sampleData';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { circleService } from '../src/services/circleService';
import type { Circle } from '../src/types';

const friends = [
  {
    id: 'friend-1',
    name: 'Mika Reyes',
    status: 'At Neon Brew',
    active: true,
    latitude: 10.3298,
    longitude: 123.9054,
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200',
  },
  {
    id: 'friend-2',
    name: 'Andre Lim',
    status: '12 min away',
    active: true,
    latitude: 10.3175,
    longitude: 123.9051,
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200',
  },
  {
    id: 'friend-3',
    name: 'Sofia Tan',
    status: 'Offline',
    active: false,
    latitude: 10.3117,
    longitude: 123.8931,
    image: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200',
  },
];

export default function CircleScreen() {
  const { appColors } = useTheme();
  const { profile } = useAuth();
  const [circles, setCircles] = useState<Circle[]>(sampleCircles);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        if (profile?.id) {
          setCircles(await circleService.getUserCircles(profile.id));
        } else {
          setCircles(sampleCircles);
        }
      } catch (error) {
        console.error('Unable to load circles:', error);
        setCircles(sampleCircles);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [profile?.id]);

  return (
    <ScreenContainer appColors={appColors} showBottomNav scroll>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: appColors.onSurface }]}>Circle</Text>
          <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>
            {friends.filter((friend) => friend.active).length} friends active now
          </Text>
        </View>
        <Pressable style={styles.invite}>
          <UserPlus size={16} color={colors.white} />
          <Text style={styles.inviteText}>Invite</Text>
        </Pressable>
      </View>

      <View style={styles.mapCard}>
        <MapView
          style={styles.map}
          mapType={Platform.OS === 'android' ? 'none' : 'standard'}
          initialRegion={{
            latitude: 10.321,
            longitude: 123.901,
            latitudeDelta: 0.045,
            longitudeDelta: 0.045,
          }}
        >
          <UrlTile urlTemplate={lightTileUrl} maximumZ={19} tileSize={256} />
          {friends.map((friend) => (
            <Marker
              key={friend.id}
              coordinate={{ latitude: friend.latitude, longitude: friend.longitude }}
              title={friend.name}
              description={friend.status}
              pinColor={friend.active ? colors.primary : colors.outline}
            />
          ))}
        </MapView>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live Grid</Text>
        </View>
        <Text style={styles.attribution}>{mapAttribution}</Text>
      </View>

      <View style={styles.friendList}>
        {friends.map((friend) => (
          <View key={friend.id} style={[styles.friendCard, { backgroundColor: appColors.surfaceLow }]}>
            <Image source={{ uri: friend.image }} style={[styles.avatar, !friend.active && styles.inactive]} />
            <View style={styles.friendCopy}>
              <Text style={[styles.friendName, { color: appColors.onSurface }]}>{friend.name}</Text>
              <View style={styles.friendStatusRow}>
                {friend.active ? <Navigation size={12} color={colors.primary} /> : null}
                <Text style={[styles.friendStatus, { color: appColors.onSurfaceVariant }]}>{friend.status}</Text>
              </View>
            </View>
            <Text style={[styles.friendMode, { color: friend.active ? colors.primary : appColors.onSurfaceVariant }]}>
              {friend.active ? 'Active' : 'Away'}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.quickGrid}>
        <Pressable style={[styles.quickCard, { backgroundColor: colors.primary + '10' }]}>
          <QrCode size={24} color={colors.primary} />
          <View>
            <Text style={[styles.quickTitle, { color: appColors.onSurface }]}>My Code</Text>
            <Text style={[styles.quickCopy, { color: appColors.onSurfaceVariant }]}>Share your profile instantly</Text>
          </View>
        </Pressable>
        <Pressable style={[styles.quickCard, { backgroundColor: appColors.surfaceLow }]}>
          <Users size={24} color={colors.secondary} />
          <View>
            <Text style={[styles.quickTitle, { color: appColors.onSurface }]}>New Circle</Text>
            <Text style={[styles.quickCopy, { color: appColors.onSurfaceVariant }]}>Create a private squad</Text>
          </View>
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>My Circles</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        circles.map((circle) => (
          <View key={circle.id} style={[styles.circleCard, { backgroundColor: appColors.surfaceLow }]}>
            <Text style={[styles.circleName, { color: appColors.onSurface }]}>{circle.name}</Text>
            <Text style={[styles.circleMembers, { color: appColors.onSurfaceVariant }]}>
              {circle.members.length} members
            </Text>
          </View>
        ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: '900',
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...shadow.card,
  },
  inviteText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mapCard: {
    height: 310,
    borderRadius: radius.xxl,
    overflow: 'hidden',
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    ...shadow.card,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  liveBadge: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  attribution: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.86)',
    color: colors.onSurfaceVariant,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: '800',
    overflow: 'hidden',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  liveText: {
    color: colors.onSurface,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  friendList: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  friendCard: {
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
  },
  inactive: {
    opacity: 0.55,
  },
  friendCopy: {
    flex: 1,
  },
  friendName: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  friendStatus: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  friendStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 3,
  },
  friendMode: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  quickCard: {
    flex: 1,
    minHeight: 130,
    borderRadius: radius.xl,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  quickTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  quickCopy: {
    fontSize: fontSize.xs,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  circleCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  circleName: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  circleMembers: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
});
