import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronRight, Hash, LocateFixed, LogIn, Navigation, Plus, Share2, UserRound, Users, X } from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { TileMap } from '../src/components/TileMap';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useLocation } from '../src/hooks/useLocation';
import { useTheme } from '../src/hooks/useTheme';
import { circleService } from '../src/services/circleService';
import { profileService } from '../src/services/profileService';
import type { Circle, CircleInvite, CircleMember } from '../src/types';

const defaultMapCenter = { latitude: 10.321, longitude: 123.901 };
const activeLocationWindowMs = 15 * 60 * 1000;

function formatInviteInput(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return compact.length > 3 ? `${compact.slice(0, 3)}-${compact.slice(3)}` : compact;
}

function formatInviteExpiry(value: string) {
  return new Date(value).toLocaleString('en-PH', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getMemberCount(circle: Circle) {
  return new Set([circle.owner_id, ...circle.members]).size;
}

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

export default function CircleScreen() {
  const router = useRouter();
  const { appColors } = useTheme();
  const { user, profile, isSignedIn } = useAuth();
  const {
    location,
    error: locationError,
    loading: locationLoading,
    getCurrentLocation,
  } = useLocation();
  const requestedLocationRef = useRef(false);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState(defaultMapCenter);
  const [mapInteracting, setMapInteracting] = useState(false);
  const [failedPhotoIds, setFailedPhotoIds] = useState<string[]>([]);
  const [joinVisible, setJoinVisible] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [codeVisible, setCodeVisible] = useState(false);
  const [circleInvite, setCircleInvite] = useState<CircleInvite | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [newCircleVisible, setNewCircleVisible] = useState(false);
  const [circleName, setCircleName] = useState('');
  const [creatingCircle, setCreatingCircle] = useState(false);

  const previewCircle = circles[0] ?? null;
  const profilePhotoUrl =
    profile?.photo_url ??
    (user?.user_metadata?.avatar_url as string | undefined) ??
    (user?.user_metadata?.photo_url as string | undefined) ??
    null;

  const loadCircles = useCallback(async () => {
    if (!user?.id) {
      setCircles([]);
      setMembers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setCircles(await circleService.getUserCircles(user.id));
    } catch (error) {
      console.error('Unable to load circles:', error);
      setCircles([]);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadCircles();
    }, [loadCircles])
  );

  useEffect(() => {
    let mounted = true;

    async function loadPreviewMembers() {
      if (!previewCircle) {
        setMembers([]);
        return;
      }

      try {
        setMembersLoading(true);
        const nextMembers = await circleService.getCircleMembers(previewCircle.id);
        if (mounted) setMembers(nextMembers);
      } catch (error) {
        console.error('Unable to load Circle preview members:', error);
        if (mounted) setMembers([]);
      } finally {
        if (mounted) setMembersLoading(false);
      }
    }

    void loadPreviewMembers();
    return () => {
      mounted = false;
    };
  }, [previewCircle?.id]);

  const visibleMembers = useMemo(() => {
    const memberMap = new Map(members.map((member) => [member.id, member]));
    const currentUserBelongs = Boolean(
      user?.id &&
      previewCircle &&
      (previewCircle.owner_id === user.id || previewCircle.members.includes(user.id))
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
        is_owner: previewCircle.owner_id === user.id,
      });
    }

    return Array.from(memberMap.values()).sort((first, second) => {
      if (first.id === user?.id) return -1;
      if (second.id === user?.id) return 1;
      if (first.is_owner !== second.is_owner) return first.is_owner ? -1 : 1;
      return (first.display_name ?? '').localeCompare(second.display_name ?? '');
    });
  }, [location, members, previewCircle, profile?.display_name, profilePhotoUrl, user]);

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
      if (showError) Alert.alert('Location unavailable', 'Enable location access to show your position on the Circle map.');
      return;
    }

    setMapCenter({ latitude: nextLocation.latitude, longitude: nextLocation.longitude });
    if (user?.id) {
      try {
        await profileService.updateProfile(user.id, {
          location: { lat: nextLocation.latitude, lng: nextLocation.longitude },
          last_location_update: new Date(nextLocation.timestamp).toISOString(),
        });
      } catch (error) {
        console.warn('Unable to publish Circle location:', error);
      }
    }
  }, [getCurrentLocation, user?.id]);

  useEffect(() => {
    if (requestedLocationRef.current || !previewCircle) return;
    requestedLocationRef.current = true;
    void refreshUserLocation(false);
  }, [previewCircle, refreshUserLocation]);

  const requireSignIn = useCallback(() => {
    Alert.alert('Sign in required', 'Please sign in to join or create a circle.');
  }, []);

  const openJoin = useCallback(() => {
    if (!isSignedIn || !user?.id) {
      requireSignIn();
      return;
    }
    setJoinCode('');
    setJoinVisible(true);
  }, [isSignedIn, requireSignIn, user?.id]);

  const joinCircle = useCallback(async () => {
    if (!user?.id || joining) return;
    if (!/^[A-Z]{3}-\d{3}$/.test(joinCode)) {
      Alert.alert('Invalid code', 'Enter a six-character invitation code such as ABC-123.');
      return;
    }

    try {
      setJoining(true);
      const joinedCircle = await circleService.joinCircleByCode(joinCode, user.id);
      setCircles((current) => [joinedCircle, ...current.filter((circle) => circle.id !== joinedCircle.id)]);
      setJoinVisible(false);
      setJoinCode('');
      router.push(`/circle/${joinedCircle.id}`);
    } catch (error: any) {
      console.error('Unable to join circle:', error);
      Alert.alert('Unable to join', error.message ?? 'The invitation code may be invalid or expired.');
    } finally {
      setJoining(false);
    }
  }, [joinCode, joining, router, user?.id]);

  const openMyCode = useCallback(async () => {
    if (!isSignedIn || !user?.id) {
      requireSignIn();
      return;
    }
    if (!previewCircle) {
      Alert.alert('No circle yet', 'Create or join a circle before sharing an invitation code.');
      return;
    }

    setCodeVisible(true);
    setCodeLoading(true);
    try {
      setCircleInvite(await circleService.getOrCreateInviteCode(previewCircle.id));
    } catch (error: any) {
      console.error('Unable to load circle invitation:', error);
      setCodeVisible(false);
      Alert.alert('Invitation unavailable', error.message ?? 'Please try again.');
    } finally {
      setCodeLoading(false);
    }
  }, [isSignedIn, previewCircle, requireSignIn, user?.id]);

  const shareCircleInvite = useCallback(async () => {
    if (!previewCircle || !circleInvite) return;
    try {
      await Share.share({
        title: `Join ${previewCircle.name}`,
        message: `Join my ${previewCircle.name} circle on CebSpot using ${circleInvite.code}. The code expires ${formatInviteExpiry(circleInvite.expires_at)}.`,
      });
    } catch (error) {
      console.error('Unable to share circle invitation:', error);
      Alert.alert('Sharing unavailable', 'Please try again.');
    }
  }, [circleInvite, previewCircle]);

  const openNewCircle = useCallback(() => {
    if (!isSignedIn || !user?.id) {
      requireSignIn();
      return;
    }
    setCircleName('');
    setNewCircleVisible(true);
  }, [isSignedIn, requireSignIn, user?.id]);

  const createCircle = useCallback(async () => {
    if (!user?.id || creatingCircle) return;
    const normalizedName = circleName.trim();
    if (!normalizedName) {
      Alert.alert('Circle name required', 'Enter a name for the new circle.');
      return;
    }

    try {
      setCreatingCircle(true);
      const createdCircle = await circleService.createCircle(normalizedName, user.id);
      setCircles((current) => [createdCircle, ...current.filter((circle) => circle.id !== createdCircle.id)]);
      setNewCircleVisible(false);
      setCircleName('');
      router.push(`/circle/${createdCircle.id}`);
    } catch (error: any) {
      console.error('Unable to create circle:', error);
      Alert.alert('Circle creation failed', error.message ?? 'Please try again.');
    } finally {
      setCreatingCircle(false);
    }
  }, [circleName, creatingCircle, router, user?.id]);

  const activeFriends = visibleMembers.filter((member) => member.id === user?.id || hasRecentLocation(member)).length;

  return (
    <ScreenContainer appColors={appColors} showBottomNav scroll scrollEnabled={!mapInteracting}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: appColors.onSurface }]}>Circle</Text>
          <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>
            {activeFriends} friends active now
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Join a circle with an invitation code"
          style={({ pressed }) => [styles.joinButton, pressed && styles.pressedCard]}
          onPress={openJoin}
        >
          <LogIn size={16} color={colors.white} />
          <Text style={styles.joinButtonText}>Join</Text>
        </Pressable>
      </View>

      <View style={styles.mapCard}>
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
            pressed && styles.pressedCard,
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

      <View style={styles.friendList}>
        {membersLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          visibleMembers.map((member) => {
            const isCurrentUser = member.id === user?.id;
            const active = isCurrentUser || hasRecentLocation(member);
            const showPhoto = Boolean(member.photo_url && !failedPhotoIds.includes(member.id));
            return (
              <View key={member.id} style={[styles.friendCard, { backgroundColor: appColors.surfaceLow }]}>
                {showPhoto ? (
                  <Image
                    source={{ uri: member.photo_url! }}
                    style={[styles.avatar, !active && styles.inactive]}
                    onError={() => setFailedPhotoIds((current) => [...new Set([...current, member.id])])}
                  />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: appColors.surfaceContainer }]}>
                    <UserRound size={22} color={appColors.onSurfaceVariant} />
                  </View>
                )}
                <View style={styles.friendCopy}>
                  <Text style={[styles.friendName, { color: appColors.onSurface }]} numberOfLines={1}>
                    {member.display_name || (isCurrentUser ? 'You' : 'Circle member')}
                  </Text>
                  <View style={styles.friendStatusRow}>
                    {active ? <Navigation size={12} color={colors.primary} /> : null}
                    <Text style={[styles.friendStatus, { color: appColors.onSurfaceVariant }]}>
                      {isCurrentUser ? 'Your current location' : active ? 'Location active' : 'Location unavailable'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.friendMode, { color: active ? colors.primary : appColors.onSurfaceVariant }]}>
                  {isCurrentUser ? 'You' : active ? 'Active' : 'Away'}
                </Text>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.quickGrid}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open the invitation code for my first circle"
          style={({ pressed }) => [
            styles.quickCard,
            { backgroundColor: colors.primary + '10' },
            pressed && styles.pressedCard,
          ]}
          onPress={openMyCode}
        >
          <Hash size={24} color={colors.primary} />
          <View>
            <Text style={[styles.quickTitle, { color: appColors.onSurface }]}>My Code</Text>
            <Text style={[styles.quickCopy, { color: appColors.onSurfaceVariant }]} numberOfLines={2}>
              {previewCircle ? `Invite to ${previewCircle.name}` : 'Create a circle to invite friends'}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create a new circle"
          style={({ pressed }) => [
            styles.quickCard,
            { backgroundColor: appColors.surfaceLow },
            pressed && styles.pressedCard,
          ]}
          onPress={openNewCircle}
        >
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
      ) : circles.length === 0 ? (
        <View style={[styles.emptyCircles, { borderColor: appColors.outlineVariant }]}>
          <Users size={22} color={appColors.onSurfaceVariant} />
          <Text style={[styles.emptyCircleText, { color: appColors.onSurfaceVariant }]}>No circles yet</Text>
        </View>
      ) : (
        circles.map((circle) => {
          const memberCount = getMemberCount(circle);
          return (
            <Pressable
              key={circle.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${circle.name}, ${memberCount} ${memberCount === 1 ? 'member' : 'members'}`}
              style={({ pressed }) => [
                styles.circleCard,
                { backgroundColor: appColors.surfaceLow },
                pressed && styles.pressedCard,
              ]}
              onPress={() => router.push(`/circle/${circle.id}`)}
            >
              <View style={styles.circleCopy}>
                <Text style={[styles.circleName, { color: appColors.onSurface }]} numberOfLines={1}>{circle.name}</Text>
                <Text style={[styles.circleMembers, { color: appColors.onSurfaceVariant }]}>
                  {memberCount} {memberCount === 1 ? 'member' : 'members'}
                </Text>
              </View>
              <ChevronRight size={20} color={appColors.onSurfaceVariant} />
            </Pressable>
          );
        })
      )}

      <Modal visible={joinVisible} transparent animationType="fade" onRequestClose={() => setJoinVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setJoinVisible(false)}>
          <Pressable accessibilityViewIsModal style={[styles.modalSheet, { backgroundColor: appColors.surface }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: appColors.onSurface }]}>Join Circle</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close join circle form" style={[styles.closeButton, { backgroundColor: appColors.surfaceContainer }]} onPress={() => setJoinVisible(false)}>
                <X size={18} color={appColors.onSurfaceVariant} />
              </Pressable>
            </View>
            <Text style={[styles.inputLabel, { color: appColors.onSurfaceVariant }]}>Invitation code</Text>
            <TextInput
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              value={joinCode}
              maxLength={7}
              placeholder="ABC-123"
              placeholderTextColor={appColors.onSurfaceVariant + '88'}
              returnKeyType="done"
              style={[styles.codeInput, { color: appColors.onSurface, backgroundColor: appColors.surfaceLow, borderColor: appColors.outlineVariant }]}
              onChangeText={(value) => setJoinCode(formatInviteInput(value))}
              onSubmitEditing={joinCircle}
            />
            <Pressable
              accessibilityRole="button"
              disabled={joining || !/^[A-Z]{3}-\d{3}$/.test(joinCode)}
              style={[styles.primaryAction, (joining || !/^[A-Z]{3}-\d{3}$/.test(joinCode)) && styles.disabledAction]}
              onPress={joinCircle}
            >
              {joining ? <ActivityIndicator size="small" color={colors.white} /> : <LogIn size={18} color={colors.white} />}
              <Text style={styles.primaryActionText}>{joining ? 'Joining...' : 'Join Circle'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={codeVisible} transparent animationType="fade" onRequestClose={() => setCodeVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCodeVisible(false)}>
          <Pressable accessibilityViewIsModal style={[styles.modalSheet, { backgroundColor: appColors.surface }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: appColors.onSurface }]} numberOfLines={2}>
                {previewCircle ? `Invite to ${previewCircle.name}` : 'My Code'}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close invitation code" style={[styles.closeButton, { backgroundColor: appColors.surfaceContainer }]} onPress={() => setCodeVisible(false)}>
                <X size={18} color={appColors.onSurfaceVariant} />
              </Pressable>
            </View>
            <View style={[styles.codePanel, { backgroundColor: colors.primary + '10' }]}>
              {codeLoading ? <ActivityIndicator color={colors.primary} /> : <Text selectable style={styles.codeText}>{circleInvite?.code}</Text>}
            </View>
            {circleInvite ? (
              <Text style={[styles.codeExpiry, { color: appColors.onSurfaceVariant }]}>Expires {formatInviteExpiry(circleInvite.expires_at)}</Text>
            ) : null}
            <Pressable accessibilityRole="button" disabled={codeLoading || !circleInvite} style={[styles.primaryAction, (codeLoading || !circleInvite) && styles.disabledAction]} onPress={shareCircleInvite}>
              <Share2 size={17} color={colors.white} />
              <Text style={styles.primaryActionText}>Share Code</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={newCircleVisible} transparent animationType="fade" onRequestClose={() => setNewCircleVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setNewCircleVisible(false)}>
          <Pressable accessibilityViewIsModal style={[styles.modalSheet, { backgroundColor: appColors.surface }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: appColors.onSurface }]}>New Circle</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close new circle form" style={[styles.closeButton, { backgroundColor: appColors.surfaceContainer }]} onPress={() => setNewCircleVisible(false)}>
                <X size={18} color={appColors.onSurfaceVariant} />
              </Pressable>
            </View>
            <TextInput
              autoFocus
              value={circleName}
              maxLength={50}
              placeholder="Circle name"
              placeholderTextColor={appColors.onSurfaceVariant + '88'}
              returnKeyType="done"
              style={[styles.circleNameInput, { color: appColors.onSurface, backgroundColor: appColors.surfaceLow, borderColor: appColors.outlineVariant }]}
              onChangeText={setCircleName}
              onSubmitEditing={createCircle}
            />
            <Pressable accessibilityRole="button" disabled={creatingCircle || !circleName.trim()} style={[styles.primaryAction, (creatingCircle || !circleName.trim()) && styles.disabledAction]} onPress={createCircle}>
              {creatingCircle ? <ActivityIndicator size="small" color={colors.white} /> : <Plus size={18} color={colors.white} />}
              <Text style={styles.primaryActionText}>{creatingCircle ? 'Creating...' : 'Create Circle'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...shadow.card,
  },
  joinButtonText: {
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
  locateButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '66',
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
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactive: {
    opacity: 0.55,
  },
  friendCopy: {
    flex: 1,
    minWidth: 0,
  },
  friendName: {
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  friendStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 3,
  },
  friendStatus: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '700',
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
  pressedCard: {
    opacity: 0.72,
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
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  circleCopy: {
    flex: 1,
    minWidth: 0,
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
  emptyCircles: {
    minHeight: 112,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyCircleText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.black + '80',
  },
  modalSheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.sm,
    padding: spacing.lg,
    gap: spacing.lg,
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
  inputLabel: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  codeInput: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
    fontSize: fontSize.xxl,
    fontWeight: '900',
    letterSpacing: 0,
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
  codeExpiry: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    textAlign: 'center',
  },
  circleNameInput: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  primaryAction: {
    minHeight: 50,
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
  },
  primaryActionText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  disabledAction: {
    opacity: 0.48,
  },
});
