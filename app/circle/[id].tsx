import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Crown, LocateFixed, Navigation, RefreshCw, Share2, UserPlus, UserRound, Users, X } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { TileMap } from '../../src/components/TileMap';
import { colors } from '../../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../../src/constants/design';
import { useAuth } from '../../src/hooks/useAuth';
import { useLocation } from '../../src/hooks/useLocation';
import { useTheme } from '../../src/hooks/useTheme';
import { circleService } from '../../src/services/circleService';
import { profileService } from '../../src/services/profileService';
import type { Circle, CircleInvite, CircleMember } from '../../src/types';

const defaultMapCenter = { latitude: 10.321, longitude: 123.901 };
const activeLocationWindowMs = 15 * 60 * 1000;

function getMemberCoordinate(member: CircleMember) {
  const latitude = Number(member.location?.lat);
  const longitude = Number(member.location?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function hasRecentLocation(member: CircleMember) {
  if (!member.last_location_update || !getMemberCoordinate(member)) return false;
  return Date.now() - new Date(member.last_location_update).getTime() <= activeLocationWindowMs;
}

function formatInviteExpiry(value: string) {
  return new Date(value).toLocaleString('en-PH', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CircleDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { appColors } = useTheme();
  const { user, profile } = useAuth();
  const {
    location,
    error: locationError,
    loading: locationLoading,
    getCurrentLocation,
  } = useLocation();
  const requestedLocationRef = useRef(false);
  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingMembers, setRefreshingMembers] = useState(false);
  const [mapCenter, setMapCenter] = useState(defaultMapCenter);
  const [mapInteracting, setMapInteracting] = useState(false);
  const [failedPhotoIds, setFailedPhotoIds] = useState<string[]>([]);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [invite, setInvite] = useState<CircleInvite | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  const profilePhotoUrl =
    profile?.photo_url ??
    (user?.user_metadata?.avatar_url as string | undefined) ??
    (user?.user_metadata?.photo_url as string | undefined) ??
    null;

  const loadMembers = useCallback(async (showSpinner = false) => {
    if (!id) return;
    if (showSpinner) setRefreshingMembers(true);
    try {
      setMembers(await circleService.getCircleMembers(id));
    } catch (error) {
      console.error('Unable to load circle members:', error);
      if (showSpinner) Alert.alert('Unable to refresh', 'Circle members could not be refreshed.');
    } finally {
      if (showSpinner) setRefreshingMembers(false);
    }
  }, [id]);

  useEffect(() => {
    let mounted = true;

    async function loadCircle() {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const nextCircle = await circleService.getCircleById(id);
        if (!mounted) return;
        setCircle(nextCircle);
        if (nextCircle) {
          const nextMembers = await circleService.getCircleMembers(id);
          if (mounted) setMembers(nextMembers);
        }
      } catch (error) {
        console.error('Unable to load circle:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadCircle();
    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id || !circle) return;
    const refreshTimer = setInterval(() => void loadMembers(), 30000);
    return () => clearInterval(refreshTimer);
  }, [circle, id, loadMembers]);

  const visibleMembers = useMemo(() => {
    const memberMap = new Map(members.map((member) => [member.id, member]));
    const currentUserBelongs = Boolean(
      user?.id && circle && (circle.owner_id === user.id || circle.members.includes(user.id))
    );

    if (user?.id && currentUserBelongs) {
      const existing = memberMap.get(user.id);
      memberMap.set(user.id, {
        id: user.id,
        display_name:
          profile?.display_name ??
          existing?.display_name ??
          (user.user_metadata?.display_name as string | undefined) ??
          user.email?.split('@')[0] ??
          'You',
        photo_url: profilePhotoUrl ?? existing?.photo_url ?? null,
        location: location
          ? { lat: location.latitude, lng: location.longitude }
          : existing?.location ?? null,
        last_location_update: location
          ? new Date(location.timestamp).toISOString()
          : existing?.last_location_update ?? null,
        is_owner: circle?.owner_id === user.id,
      });
    }

    return Array.from(memberMap.values()).sort((first, second) => {
      if (first.id === user?.id) return -1;
      if (second.id === user?.id) return 1;
      if (first.is_owner !== second.is_owner) return first.is_owner ? -1 : 1;
      return (first.display_name ?? '').localeCompare(second.display_name ?? '');
    });
  }, [circle, location, members, profile?.display_name, profilePhotoUrl, user]);

  const mapMarkers = useMemo(
    () =>
      visibleMembers.flatMap((member) => {
        const coordinate = getMemberCoordinate(member);
        if (!coordinate) return [];
        const isCurrentUser = member.id === user?.id;
        return [
          {
            id: member.id,
            ...coordinate,
            color: hasRecentLocation(member) || isCurrentUser ? colors.primary : colors.outline,
            selected: isCurrentUser,
            category: 'friend',
            label: isCurrentUser ? 'You' : member.display_name ?? 'Circle member',
            imageUrl: member.photo_url ?? undefined,
            variant: 'pin' as const,
          },
        ];
      }),
    [user?.id, visibleMembers]
  );

  useEffect(() => {
    if (location) {
      setMapCenter({ latitude: location.latitude, longitude: location.longitude });
      return;
    }
    const firstCoordinate = visibleMembers.map(getMemberCoordinate).find(Boolean);
    if (firstCoordinate) setMapCenter(firstCoordinate);
  }, [location, visibleMembers]);

  const refreshUserLocation = useCallback(async (showError = true) => {
    const nextLocation = await getCurrentLocation();
    if (!nextLocation) {
      if (showError) Alert.alert('Location unavailable', 'Enable location access to show your position in this circle.');
      return;
    }

    setMapCenter({ latitude: nextLocation.latitude, longitude: nextLocation.longitude });
    if (user?.id) {
      try {
        await profileService.updateProfile(user.id, {
          location: { lat: nextLocation.latitude, lng: nextLocation.longitude },
          last_location_update: new Date(nextLocation.timestamp).toISOString(),
        });
        await loadMembers();
      } catch (error) {
        console.warn('Unable to publish Circle location:', error);
      }
    }
  }, [getCurrentLocation, loadMembers, user?.id]);

  useEffect(() => {
    if (requestedLocationRef.current || !circle) return;
    requestedLocationRef.current = true;
    void refreshUserLocation(false);
  }, [circle, refreshUserLocation]);

  const openInvite = useCallback(async () => {
    if (!id) return;
    setInviteVisible(true);
    setInviteLoading(true);
    try {
      setInvite(await circleService.getOrCreateInviteCode(id));
    } catch (error: any) {
      console.error('Unable to load circle invitation:', error);
      setInviteVisible(false);
      Alert.alert('Invitation unavailable', error.message ?? 'Please try again.');
    } finally {
      setInviteLoading(false);
    }
  }, [id]);

  const shareInvite = useCallback(async () => {
    if (!circle || !invite) return;
    try {
      await Share.share({
        title: `Join ${circle.name}`,
        message: `Join my ${circle.name} circle on CebSpot using ${invite.code}. The code expires ${formatInviteExpiry(invite.expires_at)}.`,
      });
    } catch (error) {
      console.error('Unable to share circle invitation:', error);
      Alert.alert('Sharing unavailable', 'Please try again.');
    }
  }, [circle, invite]);

  if (loading) {
    return (
      <ScreenContainer appColors={appColors}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!circle) {
    return (
      <ScreenContainer appColors={appColors}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Circle" style={styles.iconButton} onPress={() => router.back()}>
            <ArrowLeft size={23} color={appColors.onSurface} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: appColors.onSurface }]}>Circle</Text>
        </View>
        <View style={styles.centerState}>
          <Users size={26} color={appColors.onSurfaceVariant} />
          <Text style={[styles.emptyText, { color: appColors.onSurfaceVariant }]}>Circle unavailable</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer appColors={appColors} scroll scrollEnabled={!mapInteracting}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Circle" style={styles.iconButton} onPress={() => router.back()}>
          <ArrowLeft size={23} color={appColors.onSurface} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: appColors.onSurface }]} numberOfLines={1}>{circle.name}</Text>
          <Text style={[styles.headerSubtitle, { color: appColors.onSurfaceVariant }]}>
            {visibleMembers.length} {visibleMembers.length === 1 ? 'member' : 'members'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Invite someone to ${circle.name}`}
          style={({ pressed }) => [styles.inviteButton, pressed && styles.pressed]}
          onPress={openInvite}
        >
          <UserPlus size={16} color={colors.white} />
          <Text style={styles.inviteButtonText}>Invite</Text>
        </Pressable>
      </View>

      <View style={styles.mapFrame}>
        <TileMap
          style={styles.map}
          center={mapCenter}
          zoom={14}
          markers={mapMarkers}
          onInteractionStart={() => setMapInteracting(true)}
          onInteractionEnd={() => setMapInteracting(false)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Center map on my current location"
          disabled={locationLoading}
          style={({ pressed }) => [
            styles.locateButton,
            { backgroundColor: appColors.surface },
            pressed && styles.pressed,
          ]}
          onPress={() => refreshUserLocation(true)}
        >
          {locationLoading ? <ActivityIndicator size="small" color={colors.primary} /> : <LocateFixed size={20} color={colors.primary} />}
        </Pressable>
        {locationError ? (
          <View style={[styles.locationError, { backgroundColor: appColors.surface }]}>
            <Text style={[styles.locationErrorText, { color: appColors.onSurfaceVariant }]} numberOfLines={2}>{locationError}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Friends</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh circle members"
          disabled={refreshingMembers}
          style={styles.refreshButton}
          onPress={() => loadMembers(true)}
        >
          {refreshingMembers ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <RefreshCw size={19} color={colors.primary} />
          )}
        </Pressable>
      </View>

      <View style={styles.memberList}>
        {visibleMembers.map((member) => {
          const isCurrentUser = member.id === user?.id;
          const active = isCurrentUser || hasRecentLocation(member);
          const memberName = member.display_name || (isCurrentUser ? 'You' : 'Circle member');
          const showPhoto = Boolean(member.photo_url && !failedPhotoIds.includes(member.id));

          return (
            <View key={member.id} style={[styles.memberRow, { borderBottomColor: appColors.outlineVariant }]}>
              {showPhoto ? (
                <Image
                  source={{ uri: member.photo_url! }}
                  style={[styles.avatar, !active && styles.inactiveAvatar]}
                  onError={() => setFailedPhotoIds((current) => [...new Set([...current, member.id])])}
                />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: appColors.surfaceContainer }]}>
                  <UserRound size={22} color={appColors.onSurfaceVariant} />
                </View>
              )}
              <View style={styles.memberCopy}>
                <Text style={[styles.memberName, { color: appColors.onSurface }]} numberOfLines={1}>{memberName}</Text>
                <View style={styles.memberMeta}>
                  {active ? <Navigation size={12} color={colors.primary} /> : null}
                  <Text style={[styles.memberStatus, { color: appColors.onSurfaceVariant }]}>
                    {isCurrentUser ? 'You' : active ? 'Location active' : 'Location unavailable'}
                  </Text>
                  {member.is_owner ? (
                    <View style={styles.ownerLabel}>
                      <Crown size={12} color={colors.primary} />
                      <Text style={styles.ownerLabelText}>Owner</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <Modal visible={inviteVisible} transparent animationType="fade" onRequestClose={() => setInviteVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setInviteVisible(false)}>
          <Pressable
            accessibilityViewIsModal
            style={[styles.modalSheet, { backgroundColor: appColors.surface }]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: appColors.onSurface }]} numberOfLines={2}>Invite to {circle.name}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close invitation"
                style={[styles.closeButton, { backgroundColor: appColors.surfaceContainer }]}
                onPress={() => setInviteVisible(false)}
              >
                <X size={18} color={appColors.onSurfaceVariant} />
              </Pressable>
            </View>
            <View style={[styles.codePanel, { backgroundColor: colors.primary + '10' }]}>
              {inviteLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text selectable style={styles.codeText}>{invite?.code}</Text>
              )}
            </View>
            {invite ? (
              <Text style={[styles.expiryText, { color: appColors.onSurfaceVariant }]}>Expires {formatInviteExpiry(invite.expires_at)}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={inviteLoading || !invite}
              style={[styles.shareButton, (inviteLoading || !invite) && styles.disabled]}
              onPress={shareInvite}
            >
              <Share2 size={17} color={colors.white} />
              <Text style={styles.shareButtonText}>Share Invite</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  inviteButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
    ...shadow.card,
  },
  inviteButtonText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  mapFrame: {
    height: 310,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  locateButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '66',
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  locationError: {
    position: 'absolute',
    left: spacing.md,
    right: 68,
    bottom: spacing.md,
    minHeight: 36,
    borderRadius: radius.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  locationErrorText: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    lineHeight: 16,
  },
  sectionHeader: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  refreshButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberList: {
    marginBottom: spacing.xl,
  },
  memberRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  inactiveAvatar: {
    opacity: 0.55,
  },
  avatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberCopy: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  memberMeta: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 3,
  },
  memberStatus: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  ownerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: spacing.xs,
  },
  ownerLabelText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  centerState: {
    flex: 1,
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.black + '80',
  },
  modalSheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.sm,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.lifted,
  },
  modalHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  modalTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codePanel: {
    minHeight: 112,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  codeText: {
    color: colors.primary,
    fontSize: fontSize.display,
    fontWeight: '900',
    letterSpacing: 0,
  },
  expiryText: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  shareButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  shareButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.48,
  },
});
