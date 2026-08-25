import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  ArrowLeft,
  ArrowUpCircle,
  Bell,
  CalendarCheck2,
  MapPin,
  MessageCircle,
  MoreVertical,
  PlayCircle,
  Send,
  User,
  Users,
  X,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { activityService } from '../src/services/activityService';
import { localUpdateService } from '../src/services/localUpdateService';
import type { Activity, LocalUpdate, LocalUpdateComment } from '../src/types';

function formatUpdateTime(createdAt: string) {
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return `${Math.floor(elapsedHours / 24)}d ago`;
}

function formatNotificationDate(createdAt: string) {
  return new Date(createdAt).toLocaleString('en-PH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getReadStorageKey(userId?: string) {
  return `cebspot:read-notifications:${userId ?? 'guest'}`;
}

function getNotificationTitle(item: Activity) {
  if (item.type === 'reservation_approved') return 'Reservation approved';
  if (item.type.includes('reservation')) return 'Reservation update';
  if (item.type.includes('circle')) return 'Circle activity';
  if (item.spot_name || item.type.includes('spot') || item.type === 'discovery') return 'Spot update';
  return item.target_name ?? 'CebSpot notification';
}

function getNotificationBody(item: Activity) {
  if (item.content) return item.content;

  const target = item.target_name || item.spot_name || 'your reservation';
  const action = item.action || 'updated';
  return `${item.user_name} ${action} ${target}.`;
}

function getNotificationContext(item: Activity) {
  if (item.type.includes('reservation')) return item.spot_name || item.target_name || 'Reservation';
  if (item.type.includes('circle')) return item.target_name || 'Circle';
  return item.spot_name || item.target_name || 'CebSpot';
}

function getNotificationA11yLabel(item: Activity) {
  return `${getNotificationTitle(item)}. ${getNotificationBody(item)} ${formatUpdateTime(item.created_at)}.`;
}

function isVideoUrl(url: string) {
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url);
}

function getPreviewMedia(item?: LocalUpdate | null) {
  if (!item) return [];
  const media = [...(Array.isArray(item.media_urls) ? item.media_urls : []), item.image_url]
    .map((url) => (typeof url === 'string' ? url.trim() : ''))
    .filter((url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index);
  return media;
}

function NotificationTypeIcon({ item, color }: { item: Activity; color: string }) {
  if (item.type.includes('reservation')) return <CalendarCheck2 size={21} color={color} />;
  if (item.type.includes('circle')) return <Users size={21} color={color} />;
  if (item.spot_name || item.type.includes('spot') || item.type === 'discovery') {
    return <MapPin size={21} color={color} />;
  }
  return <Bell size={21} color={color} />;
}

export default function ActivityScreen() {
  const router = useRouter();
  const { appColors } = useTheme();
  const { user, profile, isSignedIn } = useAuth();
  const { width: viewportWidth } = useWindowDimensions();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [localUpdates, setLocalUpdates] = useState<LocalUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [failedImageIds, setFailedImageIds] = useState<string[]>([]);
  const [failedAvatarIds, setFailedAvatarIds] = useState<string[]>([]);
  const [votedSubmissionIds, setVotedSubmissionIds] = useState<string[]>([]);
  const [votingUpdateIds, setVotingUpdateIds] = useState<string[]>([]);
  const [commentThreadUpdateId, setCommentThreadUpdateId] = useState<string | null>(null);
  const [comments, setComments] = useState<LocalUpdateComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [failedCommentAvatarIds, setFailedCommentAvatarIds] = useState<string[]>([]);
  const [postMediaUrls, setPostMediaUrls] = useState<string[]>([]);
  const [postMediaLoading, setPostMediaLoading] = useState(false);
  const [activePostMediaIndex, setActivePostMediaIndex] = useState(0);
  const [failedPostMediaUrls, setFailedPostMediaUrls] = useState<string[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [readActivityIds, setReadActivityIds] = useState<string[]>([]);
  const [readStateReady, setReadStateReady] = useState(false);
  const postMediaWidth = Math.min(680, Math.max(260, viewportWidth - spacing.lg * 2));

  const unreadCount = useMemo(
    () => (readStateReady ? activities.filter((item) => !readActivityIds.includes(item.id)).length : 0),
    [activities, readActivityIds, readStateReady]
  );
  const selectedCommentUpdate = useMemo(
    () => localUpdates.find((item) => item.id === commentThreadUpdateId) ?? null,
    [commentThreadUpdateId, localUpdates]
  );
  const visiblePostMedia = postMediaUrls.filter((url) => !failedPostMediaUrls.includes(url));

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    async function loadLocalUpdates() {
      try {
        const updates = await localUpdateService.getLocalUpdates();
        setLocalUpdates(updates);
        unsubscribe = localUpdateService.subscribeToLocalUpdates(setLocalUpdates);
      } finally {
        setLoading(false);
      }
    }

    loadLocalUpdates();
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    async function loadActivities() {
      if (!user?.id) {
        setActivities([]);
        return;
      }

      try {
        const recentActivities = await activityService.getRecentActivities(20, user.id);
        if (mounted) setActivities(recentActivities);
        unsubscribe = activityService.subscribeToActivities((nextActivities) => {
          if (mounted) setActivities(nextActivities);
        }, user.id);
      } catch (error) {
        console.error('Unable to load activity notifications:', error);
        if (mounted) setActivities([]);
      }
    }

    loadActivities();
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;
    setReadStateReady(false);

    AsyncStorage.getItem(getReadStorageKey(user?.id))
      .then((savedIds) => {
        if (!mounted) return;
        const parsedIds = savedIds ? JSON.parse(savedIds) : [];
        setReadActivityIds(Array.isArray(parsedIds) ? parsedIds.filter((id) => typeof id === 'string') : []);
      })
      .catch((error) => {
        console.warn('Unable to restore notification read state:', error);
        if (mounted) setReadActivityIds([]);
      })
      .finally(() => {
        if (mounted) setReadStateReady(true);
      });

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    async function loadVotes() {
      if (!user?.id) {
        setVotedSubmissionIds([]);
        return;
      }

      const votedIds = await localUpdateService.getVotedSubmissionIds(user.id);
      if (mounted) setVotedSubmissionIds(votedIds);
      unsubscribe = localUpdateService.subscribeToVotes(user.id, (nextVotedIds) => {
        if (mounted) setVotedSubmissionIds(nextVotedIds);
      });
    }

    void loadVotes();
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!commentThreadUpdateId) {
      setComments([]);
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    async function loadComments() {
      try {
        setCommentsLoading(true);
        const nextComments = await localUpdateService.getComments(commentThreadUpdateId!);
        if (!mounted) return;
        setComments(nextComments);
        unsubscribe = localUpdateService.subscribeToComments(commentThreadUpdateId!, (liveComments) => {
          if (mounted) setComments(liveComments);
        });
      } catch (error) {
        console.error('Unable to load local update comments:', error);
        if (mounted) setComments([]);
      } finally {
        if (mounted) setCommentsLoading(false);
      }
    }

    void loadComments();
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [commentThreadUpdateId]);

  useEffect(() => {
    let mounted = true;

    async function loadPostMedia() {
      if (!selectedCommentUpdate) {
        setPostMediaUrls([]);
        setActivePostMediaIndex(0);
        setFailedPostMediaUrls([]);
        return;
      }

      setPostMediaLoading(true);
      setActivePostMediaIndex(0);
      setFailedPostMediaUrls([]);
      setPostMediaUrls(getPreviewMedia(selectedCommentUpdate));

      try {
        const nextMedia = await localUpdateService.getPostMedia(selectedCommentUpdate);
        if (mounted) setPostMediaUrls(nextMedia);
      } catch (error) {
        console.error('Unable to load post media:', error);
      } finally {
        if (mounted) setPostMediaLoading(false);
      }
    }

    void loadPostMedia();
    return () => {
      mounted = false;
    };
  }, [selectedCommentUpdate]);

  async function voteForUpdate(item: LocalUpdate) {
    if (item.source_type !== 'spot_submission' || !item.source_id) {
      return;
    }

    if (!isSignedIn) {
      Alert.alert('Sign in required', 'Please sign in to vote for new spots.');
      return;
    }

    if (votingUpdateIds.includes(item.id)) return;

    try {
      setVotingUpdateIds((current) => [...current, item.id]);
      const result = await localUpdateService.toggleSpotSubmissionVote(item.source_id);
      setVotedSubmissionIds((current) => {
        if (result.voted) return current.includes(item.source_id!) ? current : [...current, item.source_id!];
        return current.filter((id) => id !== item.source_id);
      });
      setLocalUpdates((current) =>
        current.map((update) => (update.id === item.id ? { ...update, spot_count: result.vote_count } : update))
      );
    } catch (error: any) {
      console.error('Unable to vote for spot submission:', error);
      Alert.alert('Vote failed', error.message ?? 'Please try again.');
    } finally {
      setVotingUpdateIds((current) => current.filter((id) => id !== item.id));
    }
  }

  function openPost(item: LocalUpdate) {
    setCommentBody('');
    setCommentThreadUpdateId(item.id);
  }

  function closeComments() {
    if (sendingComment) return;
    setCommentThreadUpdateId(null);
    setCommentBody('');
  }

  function handlePostMediaScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / postMediaWidth);
    setActivePostMediaIndex(Math.max(0, Math.min(nextIndex, visiblePostMedia.length - 1)));
  }

  async function sendComment() {
    if (!commentThreadUpdateId || sendingComment) return;
    if (!isSignedIn || !user?.id) {
      Alert.alert('Sign in required', 'Please sign in to comment on local updates.');
      return;
    }

    const normalizedBody = commentBody.trim();
    if (!normalizedBody) return;

    try {
      setSendingComment(true);
      const createdComment = await localUpdateService.addComment(commentThreadUpdateId, normalizedBody, {
        id: user.id,
        name:
          profile?.display_name ??
          (user.user_metadata?.display_name as string | undefined) ??
          user.email?.split('@')[0] ??
          'CebSpot user',
        photoUrl:
          profile?.photo_url ??
          (user.user_metadata?.avatar_url as string | undefined) ??
          null,
      });
      setComments((current) =>
        current.some((comment) => comment.id === createdComment.id) ? current : [...current, createdComment]
      );
      setLocalUpdates((current) =>
        current.map((update) =>
          update.id === commentThreadUpdateId
            ? { ...update, comments_count: Math.max(update.comments_count, comments.length + 1) }
            : update
        )
      );
      setCommentBody('');
    } catch (error: any) {
      console.error('Unable to post local update comment:', error);
      Alert.alert('Comment failed', error.message ?? 'Please try again.');
    } finally {
      setSendingComment(false);
    }
  }

  function saveReadActivityIds(nextIds: string[]) {
    setReadActivityIds(nextIds);
    if (!readStateReady) return;

    AsyncStorage.setItem(getReadStorageKey(user?.id), JSON.stringify(nextIds)).catch((error) => {
      console.warn('Unable to save notification read state:', error);
    });
  }

  function markNotificationRead(item: Activity) {
    if (readActivityIds.includes(item.id)) return;
    saveReadActivityIds([...readActivityIds, item.id]);
  }

  function markAllNotificationsRead() {
    if (!unreadCount) return;
    saveReadActivityIds([...new Set([...readActivityIds, ...activities.map((item) => item.id)])]);
  }

  if (showNotifications) {
    return (
      <ScreenContainer appColors={appColors} scroll padded={false}>
        <View style={[styles.notificationsHeader, { borderBottomColor: appColors.outlineVariant }]}>
          <Pressable
            accessible
            accessibilityRole="button"
            accessibilityLabel="Back to activity"
            style={styles.backButton}
            onPress={() => setShowNotifications(false)}
          >
            <ArrowLeft size={24} color={appColors.onSurface} />
          </Pressable>
          <Text style={[styles.notificationsTitle, { color: appColors.onSurface }]}>Notifications</Text>
          <View style={styles.headerBalance} />
        </View>

        {!isSignedIn ? (
          <View style={styles.emptyNotificationState}>
            <Bell size={22} color={colors.primary} />
            <Text style={[styles.emptyNotificationTitle, { color: appColors.onSurface }]}>Sign in to see notifications</Text>
            <Text style={[styles.emptyNotificationText, { color: appColors.onSurfaceVariant }]}>
              Reservation approvals, alerts, circle activity, and spot updates will appear here.
            </Text>
          </View>
        ) : activities.length ? (
          <View style={styles.notificationFeed}>
            <View style={[styles.notificationSectionBar, { backgroundColor: appColors.surfaceContainer }]}>
              <Text style={[styles.notificationSectionTitle, { color: appColors.onSurfaceVariant }]}>Recent updates</Text>
              <Pressable
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Mark all ${unreadCount} unread notifications as read`}
                disabled={!unreadCount}
                hitSlop={8}
                onPress={markAllNotificationsRead}
              >
                <Text style={[styles.readAllText, !unreadCount && styles.readAllTextDisabled]}>
                  Read all{unreadCount ? ` (${unreadCount})` : ''}
                </Text>
              </Pressable>
            </View>

            {activities.map((item) => {
              const isReservationNotification = item.type.includes('reservation');
              const isUnread = !readActivityIds.includes(item.id);
              const title = getNotificationTitle(item);
              const body = getNotificationBody(item);
              const context = getNotificationContext(item);

              return (
                <Pressable
                  key={item.id}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={getNotificationA11yLabel(item)}
                  accessibilityHint={
                    isReservationNotification
                      ? 'Marks this notification as read and opens reservations.'
                      : 'Marks this notification as read.'
                  }
                  style={({ pressed }) => [
                    styles.notificationRow,
                    { backgroundColor: isUnread ? colors.primary + '0D' : appColors.surface },
                    { borderBottomColor: appColors.outlineVariant },
                    pressed && styles.pressedCard,
                  ]}
                  onPress={() => {
                    markNotificationRead(item);
                    if (isReservationNotification) router.push('/reservations');
                  }}
                >
                  <View
                    style={[
                      styles.notificationIcon,
                      { backgroundColor: isUnread ? colors.primary + '18' : appColors.surfaceLow },
                    ]}
                  >
                    <NotificationTypeIcon item={item} color={isUnread ? colors.primary : appColors.onSurfaceVariant} />
                  </View>
                  <View style={styles.notificationCopy}>
                    <View style={styles.notificationTitleRow}>
                      <Text
                        style={[
                          styles.notificationTitle,
                          { color: appColors.onSurface },
                          !isUnread && styles.readNotificationTitle,
                        ]}
                      >
                        {title}
                      </Text>
                      {isUnread ? <View style={styles.unreadDot} /> : null}
                    </View>
                    <Text
                      style={[
                        styles.notificationContext,
                        { color: isUnread ? colors.primary : appColors.onSurfaceVariant },
                      ]}
                    >
                      {context}
                    </Text>
                    <Text style={[styles.notificationText, { color: appColors.onSurfaceVariant }]}>{body}</Text>
                    {isReservationNotification ? (
                      <Text style={styles.notificationActionText}>View reservation</Text>
                    ) : null}
                    <Text style={[styles.notificationTime, { color: appColors.onSurfaceVariant }]}>
                      {formatNotificationDate(item.created_at)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyNotificationState}>
            <Bell size={22} color={colors.primary} />
            <Text style={[styles.emptyNotificationTitle, { color: appColors.onSurface }]}>No notifications yet</Text>
            <Text style={[styles.emptyNotificationText, { color: appColors.onSurfaceVariant }]}>
              Reservation approvals, alerts, circle activity, and spot updates will show up here.
            </Text>
          </View>
        )}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer appColors={appColors} showBottomNav scroll>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: appColors.onSurface }]}>Activity</Text>
          <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>Notifications and local updates</Text>
        </View>
        <Pressable
          accessible
          accessibilityRole="button"
          accessibilityLabel={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications, no unread notifications'}
          accessibilityHint="Opens notifications."
          style={({ pressed }) => [styles.notificationButton, pressed && styles.pressedButton]}
          onPress={() => setShowNotifications(true)}
        >
          <Bell size={22} color={appColors.onSurface} />
          {unreadCount ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Local Updates</Text>
        <View style={styles.liveDot} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" style={styles.loader} />
      ) : (
        <View style={styles.feed}>
          {localUpdates.map((item) => {
            const canVote = item.source_type === 'spot_submission' && !!item.source_id;
            const voted = !!item.source_id && votedSubmissionIds.includes(item.source_id);
            const voting = votingUpdateIds.includes(item.id);

            return (
            <View key={item.id} style={[styles.updateCard, { backgroundColor: appColors.surfaceLow }]}>
              <View style={styles.updateHeader}>
                {item.user_photo_url && !failedAvatarIds.includes(item.id) ? (
                  <Image
                    source={{ uri: item.user_photo_url }}
                    style={styles.avatarImage}
                    onError={() => setFailedAvatarIds((current) => [...new Set([...current, item.id])])}
                  />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: appColors.surfaceHighest }]}>
                    <User size={20} color={appColors.onSurfaceVariant} />
                  </View>
                )}
                <View style={styles.authorBlock}>
                  <Text style={[styles.authorName, { color: appColors.onSurface }]} numberOfLines={1}>
                    {item.user_name}
                  </Text>
                  <Text style={[styles.updateTime, { color: appColors.onSurfaceVariant }]}>
                    {formatUpdateTime(item.created_at)}
                  </Text>
                </View>
                <Pressable style={styles.moreButton}>
                  <MoreVertical size={18} color={appColors.onSurfaceVariant} />
                </Pressable>
              </View>

              <Pressable
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Open post ${item.title}`}
                accessibilityHint="Shows the full post and comments."
                style={({ pressed }) => [styles.updateCopy, pressed && styles.pressedCard]}
                onPress={() => openPost(item)}
              >
                <Text style={styles.updateTitle}>{item.title}</Text>
                <Text style={[styles.updateBody, { color: appColors.onSurfaceVariant }]}>{item.body}</Text>
                <View style={styles.locationRow}>
                  <MapPin size={12} color={appColors.onSurfaceVariant} fill={appColors.onSurfaceVariant} />
                  <Text style={[styles.locationText, { color: appColors.onSurfaceVariant }]}>{item.location_name}</Text>
                </View>
              </Pressable>

              {item.image_url && !failedImageIds.includes(item.id) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open post media for ${item.title}`}
                  onPress={() => openPost(item)}
                >
                  <Image
                    source={{ uri: item.image_url }}
                    style={styles.updateImage}
                    resizeMode="cover"
                    onError={() => setFailedImageIds((current) => [...new Set([...current, item.id])])}
                  />
                </Pressable>
              ) : null}

              <View style={styles.updateActions}>
                <Pressable
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={voted ? `Remove vote from ${item.title}` : `Vote for ${item.title}`}
                  disabled={!canVote || voting}
                  style={[styles.urgencyButton, !canVote && styles.disabledAction, voting && styles.disabledAction]}
                  onPress={() => voteForUpdate(item)}
                >
                  {voting ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                  ) : (
                    <ArrowUpCircle
                      size={25}
                      color={canVote ? colors.primary : appColors.onSurfaceVariant}
                      fill={voted ? colors.primary : 'transparent'}
                    />
                  )}
                  <Text style={[styles.actionText, { color: canVote ? appColors.onSurface : appColors.onSurfaceVariant }]}>
                    +{item.spot_count} Spot
                  </Text>
                </Pressable>
                <View style={styles.actionSpacer} />
                <Pressable
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.comments_count} comments on ${item.title}`}
                  style={styles.discussButton}
                  onPress={() => openPost(item)}
                >
                  <MessageCircle size={22} color={appColors.onSurfaceVariant} />
                  <Text style={[styles.actionText, { color: appColors.onSurfaceVariant }]}>
                    {item.comments_count} Comments
                  </Text>
                </Pressable>
              </View>
            </View>
            );
          })}
        </View>
      )}

      <Modal
        visible={Boolean(commentThreadUpdateId)}
        transparent
        animationType="slide"
        onRequestClose={closeComments}
      >
        <KeyboardAvoidingView
          style={styles.commentModalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close comments"
            style={styles.commentBackdrop}
            onPress={closeComments}
          />
          <View style={[styles.commentSheet, { backgroundColor: appColors.surface }]}>
            <View style={[styles.commentHeader, { borderBottomColor: appColors.outlineVariant }]}>
              <View style={styles.commentHeaderCopy}>
                <Text style={[styles.commentTitle, { color: appColors.onSurface }]}>Post</Text>
                <Text style={[styles.commentUpdateTitle, { color: appColors.onSurfaceVariant }]} numberOfLines={1}>
                  {selectedCommentUpdate?.title ?? 'Local update'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close comments"
                style={[styles.commentCloseButton, { backgroundColor: appColors.surfaceContainer }]}
                onPress={closeComments}
              >
                <X size={19} color={appColors.onSurfaceVariant} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.commentScroll}
              contentContainerStyle={styles.commentList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {selectedCommentUpdate ? (
                <View style={styles.postDetailBlock}>
                  <View style={styles.postDetailHeader}>
                    {selectedCommentUpdate.user_photo_url && !failedAvatarIds.includes(`post-${selectedCommentUpdate.id}`) ? (
                      <Image
                        source={{ uri: selectedCommentUpdate.user_photo_url }}
                        style={styles.postAuthorAvatar}
                        onError={() =>
                          setFailedAvatarIds((current) => [...new Set([...current, `post-${selectedCommentUpdate.id}`])])
                        }
                      />
                    ) : (
                      <View style={[styles.postAuthorAvatarFallback, { backgroundColor: appColors.surfaceContainer }]}>
                        <User size={18} color={appColors.onSurfaceVariant} />
                      </View>
                    )}
                    <View style={styles.postAuthorCopy}>
                      <Text style={[styles.postAuthorName, { color: appColors.onSurface }]} numberOfLines={1}>
                        {selectedCommentUpdate.user_name}
                      </Text>
                      <Text style={[styles.postDetailTime, { color: appColors.onSurfaceVariant }]}>
                        {formatUpdateTime(selectedCommentUpdate.created_at)}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.postDetailTitle, { color: appColors.onSurface }]}>
                    {selectedCommentUpdate.title}
                  </Text>
                  {!!selectedCommentUpdate.body && (
                    <Text style={[styles.postDetailBody, { color: appColors.onSurfaceVariant }]}>
                      {selectedCommentUpdate.body}
                    </Text>
                  )}
                  <View style={styles.postLocationRow}>
                    <MapPin size={14} color={colors.primary} fill={colors.primary} />
                    <Text style={[styles.postLocationText, { color: appColors.onSurfaceVariant }]}>
                      {selectedCommentUpdate.location_name}
                    </Text>
                  </View>

                  {postMediaLoading ? (
                    <View style={[styles.postMediaLoading, { backgroundColor: appColors.surfaceLow }]}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : visiblePostMedia.length ? (
                    <View style={styles.postMediaBlock}>
                      <ScrollView
                        horizontal
                        pagingEnabled
                        nestedScrollEnabled
                        showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={handlePostMediaScroll}
                      >
                        {visiblePostMedia.map((mediaUrl, index) => {
                          const isVideo = isVideoUrl(mediaUrl);
                          return (
                            <View key={`${mediaUrl}-${index}`} style={[styles.postMediaPage, { width: postMediaWidth }]}>
                              {isVideo ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="Open attached video"
                                  style={[styles.postVideoPreview, { backgroundColor: appColors.surfaceLow }]}
                                  onPress={() => Linking.openURL(mediaUrl)}
                                >
                                  <PlayCircle size={44} color={colors.primary} />
                                  <Text style={[styles.postVideoText, { color: appColors.onSurfaceVariant }]}>
                                    Video attached
                                  </Text>
                                </Pressable>
                              ) : (
                                <Image
                                  source={{ uri: mediaUrl }}
                                  style={styles.postMediaImage}
                                  resizeMode="cover"
                                  onError={() =>
                                    setFailedPostMediaUrls((current) => [...new Set([...current, mediaUrl])])
                                  }
                                />
                              )}
                            </View>
                          );
                        })}
                      </ScrollView>
                      {visiblePostMedia.length > 1 ? (
                        <View style={styles.postMediaDots}>
                          {visiblePostMedia.map((mediaUrl, index) => (
                            <View
                              key={`dot-${mediaUrl}-${index}`}
                              style={[
                                styles.postMediaDot,
                                index === activePostMediaIndex && styles.postMediaDotActive,
                              ]}
                            />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  <View style={[styles.postStatsRow, { borderTopColor: appColors.outlineVariant }]}>
                    <Text style={[styles.postStatText, { color: appColors.onSurfaceVariant }]}>
                      +{selectedCommentUpdate.spot_count} Spot
                    </Text>
                    <Text style={[styles.postStatText, { color: appColors.onSurfaceVariant }]}>
                      {comments.length || selectedCommentUpdate.comments_count} Comments
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={[styles.threadDivider, { borderTopColor: appColors.outlineVariant }]}>
                <Text style={[styles.threadDividerText, { color: appColors.onSurface }]}>Comments</Text>
              </View>

              {commentsLoading ? (
                <View style={styles.commentLoadingState}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : comments.length === 0 ? (
                <View style={styles.commentEmptyState}>
                  <MessageCircle size={24} color={appColors.onSurfaceVariant} />
                  <Text style={[styles.commentEmptyTitle, { color: appColors.onSurface }]}>No comments yet</Text>
                  <Text style={[styles.commentEmptyText, { color: appColors.onSurfaceVariant }]}>Start the conversation.</Text>
                </View>
              ) : (
                comments.map((comment) => {
                  const showAvatar = Boolean(
                    comment.user_photo_url && !failedCommentAvatarIds.includes(comment.id)
                  );
                  return (
                    <View key={comment.id} style={styles.commentRow}>
                      {showAvatar ? (
                        <Image
                          source={{ uri: comment.user_photo_url! }}
                          style={styles.commentAvatar}
                          onError={() =>
                            setFailedCommentAvatarIds((current) => [...new Set([...current, comment.id])])
                          }
                        />
                      ) : (
                        <View style={[styles.commentAvatarFallback, { backgroundColor: appColors.surfaceContainer }]}>
                          <User size={17} color={appColors.onSurfaceVariant} />
                        </View>
                      )}
                      <View style={styles.commentCopy}>
                        <View style={styles.commentMetaRow}>
                          <Text style={[styles.commentAuthor, { color: appColors.onSurface }]} numberOfLines={1}>
                            {comment.user_name}
                          </Text>
                          <Text style={[styles.commentTime, { color: appColors.onSurfaceVariant }]}>
                            {formatUpdateTime(comment.created_at)}
                          </Text>
                        </View>
                        <Text style={[styles.commentBody, { color: appColors.onSurfaceVariant }]}>{comment.body}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={[styles.commentComposer, { borderTopColor: appColors.outlineVariant }]}>
              <TextInput
                multiline
                editable={isSignedIn && !sendingComment}
                maxLength={500}
                value={commentBody}
                placeholder={isSignedIn ? 'Write a comment' : 'Sign in to comment'}
                placeholderTextColor={appColors.onSurfaceVariant + '88'}
                style={[
                  styles.commentInput,
                  {
                    color: appColors.onSurface,
                    backgroundColor: appColors.surfaceLow,
                    borderColor: appColors.outlineVariant,
                  },
                ]}
                onChangeText={setCommentBody}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send comment"
                disabled={sendingComment || !commentBody.trim()}
                style={[styles.sendCommentButton, (sendingComment || !commentBody.trim()) && styles.disabledAction]}
                onPress={sendComment}
              >
                {sendingComment ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Send size={18} color={colors.white} />
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  notificationsHeader: {
    minHeight: 68,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  notificationsTitle: {
    flex: 1,
    fontSize: fontSize.xxl,
    fontWeight: '800',
  },
  headerBalance: {
    width: 42,
    height: 42,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationButton: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pressedButton: {
    opacity: 0.62,
  },
  unreadBadge: {
    position: 'absolute',
    top: 0,
    right: -3,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white,
  },
  unreadBadgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '900',
  },
  notificationFeed: {
    marginBottom: spacing.xl,
  },
  notificationSectionBar: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notificationSectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  readAllText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  readAllTextDisabled: {
    opacity: 0.42,
  },
  notificationRow: {
    minHeight: 124,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressedCard: {
    opacity: 0.68,
  },
  notificationIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationCopy: {
    flex: 1,
    minWidth: 0,
  },
  notificationTitle: {
    fontSize: fontSize.lg,
    fontWeight: '900',
    flex: 1,
    minWidth: 0,
  },
  readNotificationTitle: {
    fontWeight: '700',
  },
  notificationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  notificationContext: {
    marginTop: spacing.xs,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  notificationText: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    lineHeight: 20,
    fontWeight: '800',
  },
  notificationTime: {
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  notificationActionText: {
    color: colors.primary,
    marginTop: spacing.sm,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  emptyNotificationState: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 72,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyNotificationTitle: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  emptyNotificationText: {
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  loader: {
    marginVertical: spacing.xxl,
  },
  feed: {
    gap: spacing.md,
  },
  updateCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.card,
  },
  updateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorBlock: {
    flex: 1,
    minWidth: 0,
  },
  authorName: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  updateTime: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  moreButton: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateCopy: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  updateTitle: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  updateBody: {
    marginTop: spacing.xs,
    fontSize: fontSize.md,
    lineHeight: 22,
    fontWeight: '800',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  locationText: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  updateImage: {
    width: '100%',
    height: 250,
  },
  updateActions: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.black + '10',
  },
  urgencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  disabledAction: {
    opacity: 0.55,
  },
  actionSpacer: {
    flex: 1,
  },
  discussButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionText: {
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  commentModalRoot: {
    flex: 1,
    justifyContent: 'center',
  },
  commentBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.black + '72',
  },
  commentSheet: {
    width: '100%',
    height: '100%',
    maxHeight: '100%',
    paddingTop: Platform.OS === 'ios' ? spacing.xl : spacing.md,
    overflow: 'hidden',
    ...shadow.lifted,
  },
  commentHeader: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  commentTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  commentUpdateTitle: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  commentCloseButton: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentScroll: {
    flex: 1,
  },
  commentList: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  postDetailBlock: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  postDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  postAuthorAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  postAuthorAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAuthorCopy: {
    flex: 1,
    minWidth: 0,
  },
  postAuthorName: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  postDetailTime: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  postDetailTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '900',
    lineHeight: 30,
  },
  postDetailBody: {
    fontSize: fontSize.md,
    lineHeight: 23,
    fontWeight: '800',
  },
  postLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  postLocationText: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  postMediaLoading: {
    height: 230,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postMediaBlock: {
    gap: spacing.sm,
  },
  postMediaPage: {
    height: 270,
    paddingRight: spacing.sm,
  },
  postMediaImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.lg,
    backgroundColor: colors.black + '08',
  },
  postVideoPreview: {
    width: '100%',
    height: '100%',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  postVideoText: {
    fontSize: fontSize.sm,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  postMediaDots: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: spacing.xs,
  },
  postMediaDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.black + '18',
  },
  postMediaDotActive: {
    width: 18,
    backgroundColor: colors.primary,
  },
  postStatsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  postStatText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  threadDivider: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  threadDividerText: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  commentLoadingState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentEmptyState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  commentEmptyTitle: {
    marginTop: spacing.xs,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  commentEmptyText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  commentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  commentAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentCopy: {
    flex: 1,
    minWidth: 0,
  },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  commentAuthor: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  commentTime: {
    fontSize: 10,
    fontWeight: '700',
  },
  commentBody: {
    marginTop: 3,
    fontSize: fontSize.sm,
    lineHeight: 20,
    fontWeight: '700',
  },
  commentComposer: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 112,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  sendCommentButton: {
    width: 46,
    height: 46,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
});
