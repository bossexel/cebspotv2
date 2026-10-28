import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
  Bell,
  CalendarCheck2,
  Check,
  Clock3,
  Flame,
  Heart,
  ListFilter,
  MapPin,
  MessageCircle,
  Megaphone,
  Navigation,
  PlayCircle,
  Send,
  User,
  Users,
  X,
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors, AppColors } from '../src/constants/colors';
import { fontSize, radius, shadow, spacing } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useLocation } from '../src/hooks/useLocation';
import { useTheme } from '../src/hooks/useTheme';
import { activityService } from '../src/services/activityService';
import { localUpdateService, FeedCursor } from '../src/services/localUpdateService';
import type { Activity, LocalUpdate, LocalUpdateComment, SpotVoteType } from '../src/types';
import { userErrorMessage } from '../src/utils/userError';
import { getPublishedAdminUpdates, subscribeToPublishedAdminUpdates, type AdminUpdate } from '../src/services/adminUpdateService';
import { mergeActivityNotifications } from '../src/utils/activityNotifications';

type LocalUpdateSort = 'nearest' | 'newest' | 'popular';

const localUpdateSortOptions: Array<{
  value: LocalUpdateSort;
  label: string;
  description: string;
  icon: typeof Navigation;
}> = [
  {
    value: 'nearest',
    label: 'Nearest',
    description: 'Updates closest to your location',
    icon: Navigation,
  },
  {
    value: 'newest',
    label: 'Newest',
    description: 'Most recently posted updates',
    icon: Clock3,
  },
  {
    value: 'popular',
    label: 'Popular',
    description: 'Most Spot votes and comments',
    icon: Flame,
  },
];

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
  if (item.type === 'admin_update') return 'Admin Updates';
  if (item.type === 'spot_comment') return 'New comment';
  if (item.type === 'spot_liked') return 'New like';
  if (item.type === 'review_comment') return 'Review comment';
  if (item.type === 'review_liked') return 'Review liked';
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

function formatSpotScore(score: number) {
  if (score > 0) return `+${score}`;
  return String(score);
}

function NotificationTypeIcon({ item, color }: { item: Activity; color: string }) {
  if (item.type === 'admin_update') return <Megaphone size={21} color={color} />;
  if (item.type.includes('reservation')) return <CalendarCheck2 size={21} color={color} />;
  if (item.type.includes('circle')) return <Users size={21} color={color} />;
  if (item.type === 'review_liked') return <Heart size={21} color={color} />;
  if (item.type === 'review_comment') return <MessageCircle size={21} color={color} />;
  if (item.spot_name || item.type.includes('spot') || item.type === 'discovery') {
    return <MapPin size={21} color={color} />;
  }
  return <Bell size={21} color={color} />;
}

const ActivityPostCard = React.memo(function ActivityPostCard({ item, appColors, currentVote, voting, onOpen, onOpenSpot, onVote }: {
  item: LocalUpdate; appColors: AppColors; currentVote: SpotVoteType | null; voting: boolean;
  onOpen: (item: LocalUpdate) => void; onVote: (item: LocalUpdate) => void;
  onOpenSpot: (item: LocalUpdate) => void;
}) {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const canVote = item.source_type === 'spot_submission' && !!item.source_id;
  return (<View style={[styles.updateCard, { backgroundColor: appColors.surfaceLow }]}>
              <View style={styles.updateHeader}>
                {item.user_photo_url && failedAvatar !== item.user_photo_url ? (
                  <Image
                    source={{ uri: item.user_photo_url }}
                    style={styles.avatarImage}
                    onError={() => setFailedAvatar(item.user_photo_url ?? null)}
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
              </View>

              <Pressable
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Open post ${item.title}`}
                accessibilityHint="Opens the associated spot, or the post if its place is awaiting approval."
                style={({ pressed }) => [styles.updateCopy, pressed && styles.pressedCard]}
                onPress={() => onOpenSpot(item)}
              >
                <Text numberOfLines={2} style={styles.updateTitle}>{item.title}</Text>
                <Text numberOfLines={3} style={[styles.updateBody, { color: appColors.onSurfaceVariant }]}>{item.body}</Text>
                <View style={styles.locationRow}>
                  <MapPin size={12} color={appColors.onSurfaceVariant} fill={appColors.onSurfaceVariant} />
                  <Text numberOfLines={1} style={[styles.locationText, { color: appColors.onSurfaceVariant }]}>{item.location_name}</Text>
                </View>
              </Pressable>

              {!isVideoUrl(item.image_url ?? '') && item.image_url && failedImage !== item.image_url ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open post media for ${item.title}`}
                  onPress={() => onOpen(item)}
                >
                  <Image
                    source={{ uri: item.image_url }}
                    style={styles.updateImage}
                    resizeMode="cover"
                    resizeMethod="resize"
                    fadeDuration={0}
                    onError={() => setFailedImage(item.image_url ?? null)}
                  />
                </Pressable>
              ) : null}

              <View style={styles.updateActions}>
                <Pressable
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={currentVote === 'up' ? `Remove Spot from ${item.title}` : `Spot ${item.title}`}
                  accessibilityState={{ selected: currentVote === 'up', disabled: !canVote || voting }}
                  disabled={!canVote || voting}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.spotVoteButton,
                    !canVote && styles.disabledAction,
                    pressed && styles.pressedButton,
                  ]}
                  onPress={() => onVote(item)}
                >
                  <MapPin
                    size={21}
                    color={currentVote === 'up' ? colors.primary : canVote ? appColors.onSurface : appColors.onSurfaceVariant}
                    strokeWidth={2.5}
                  />
                  <Text style={[styles.voteScoreText, { color: canVote ? appColors.onSurface : appColors.onSurfaceVariant }]}>
                    {formatSpotScore(item.spot_count)}
                  </Text>
                  <Text style={[styles.voteLabelText, { color: currentVote === 'up' ? colors.primary : appColors.onSurfaceVariant }]}>Spot</Text>
                </Pressable>
                <View style={styles.actionSpacer} />
                <Pressable
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.comments_count} comments on ${item.title}`}
                  style={styles.discussButton}
                  onPress={() => onOpen(item)}
                >
                  <MessageCircle size={22} color={appColors.onSurfaceVariant} />
                  <Text style={[styles.actionText, { color: appColors.onSurfaceVariant }]}>
                    {item.comments_count} Comments
                  </Text>
                </Pressable>
              </View>
            </View>);
});

export default function ActivityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ openSubmissionId?: string | string[]; openPostId?: string | string[] }>();
  const { appColors } = useTheme();
  const { user, profile, isSignedIn } = useAuth();
  const {
    getCurrentLocation,
    location: currentLocation,
    loading: locating,
  } = useLocation();
  const { width: viewportWidth } = useWindowDimensions();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [adminUpdates, setAdminUpdates] = useState<AdminUpdate[]>([]);
  const [adminUpdatesError, setAdminUpdatesError] = useState<string | null>(null);
  const [localUpdates, setLocalUpdates] = useState<LocalUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [liveFeedPaused, setLiveFeedPaused] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [feedRetry, setFeedRetry] = useState(0);
  const [nextCursor, setNextCursor] = useState<FeedCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newPostsAvailable, setNewPostsAvailable] = useState(false);
  const feedGeneration = useRef(0);
  const pageInFlight = useRef(false);
  const feedList = useRef<FlatList<LocalUpdate>>(null);
  const [notificationRetry, setNotificationRetry] = useState(0);
  const activitiesOwner = useRef<string | null>(null);

  const [failedAvatarIds, setFailedAvatarIds] = useState<string[]>([]);
  const [submissionVotes, setSubmissionVotes] = useState<Record<string, SpotVoteType>>({});
  const [votingUpdateIds, setVotingUpdateIds] = useState<string[]>([]);
  const [commentThreadUpdateId, setCommentThreadUpdateId] = useState<string | null>(null);
  const [openedPost, setOpenedPost] = useState<LocalUpdate | null>(null);
  const [comments, setComments] = useState<LocalUpdateComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [replyingToComment, setReplyingToComment] = useState<LocalUpdateComment | null>(null);
  const [sendingComment, setSendingComment] = useState(false);
  const [failedCommentAvatarIds, setFailedCommentAvatarIds] = useState<string[]>([]);
  const [postMediaUrls, setPostMediaUrls] = useState<string[]>([]);
  const [postMediaLoading, setPostMediaLoading] = useState(false);
  const [activePostMediaIndex, setActivePostMediaIndex] = useState(0);
  const [failedPostMediaUrls, setFailedPostMediaUrls] = useState<string[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSortOptions, setShowSortOptions] = useState(false);
  const [localUpdateSort, setLocalUpdateSort] = useState<LocalUpdateSort>('newest');
  const [readActivityIds, setReadActivityIds] = useState<string[]>([]);
  const [readStateReady, setReadStateReady] = useState(false);
  const openedPostParamRef = useRef<string | null>(null);
  const postMediaWidth = Math.min(680, Math.max(260, viewportWidth - spacing.lg * 2));

  const notificationItems = useMemo(() => mergeActivityNotifications(activities, adminUpdates), [activities, adminUpdates]);
  const unreadCount = useMemo(
    () => (readStateReady ? notificationItems.filter((item) => !readActivityIds.includes(item.id)).length : 0),
    [notificationItems, readActivityIds, readStateReady]
  );
  const selectedCommentUpdate = useMemo(
    () => localUpdates.find((item) => item.id === commentThreadUpdateId)
      ?? (openedPost?.id === commentThreadUpdateId ? openedPost : null),
    [commentThreadUpdateId, localUpdates, openedPost]
  );
  const openPost = useCallback((item: LocalUpdate) => {
    setOpenedPost(item);
    setCommentBody('');
    setReplyingToComment(null);
    setCommentThreadUpdateId(item.id);
  }, []);
  const sortedLocalUpdates = localUpdates;
  const activeSortLabel = localUpdateSortOptions.find((option) => option.value === localUpdateSort)?.label ?? 'Newest';
  const visiblePostMedia = postMediaUrls.filter((url) => !failedPostMediaUrls.includes(url));
  const parentComments = comments.filter((comment) => !comment.parent_comment_id);
  const openSubmissionId = Array.isArray(params.openSubmissionId)
    ? params.openSubmissionId[0]
    : params.openSubmissionId;
  const openPostId = Array.isArray(params.openPostId) ? params.openPostId[0] : params.openPostId;

  useEffect(() => {
    let mounted = true;
    const generation = ++feedGeneration.current;
    pageInFlight.current = false;
    setLoadingMore(false);
    setLoading(true);
    setNextCursor(null);
    setLocalUpdates([]);
    setFeedError(null);
    setLiveFeedPaused(false);
    setNewPostsAvailable(false);
    feedList.current?.scrollToOffset({ offset: 0, animated: false });
    const unsubscribe = localUpdateService.subscribeToFeedChanges((changes) => {
      if (!mounted) return;
      if (changes.some(change => change.eventType === 'INSERT')) setNewPostsAvailable(true);
      const changed = new Map(changes.map(change => [change.id, change]));
      setLocalUpdates(current => current.flatMap(item => {
        const change = changed.get(item.id);
        return change?.eventType === 'DELETE' ? [] : [change?.item ?? item];
      }));
    }, () => { if (mounted) setLiveFeedPaused(true); },
    () => { if (mounted) setLiveFeedPaused(false); });
    localUpdateService.getLocalUpdatesPage({ sort: localUpdateSort, location: currentLocation })
      .then(page => {
        if (!mounted || feedGeneration.current !== generation) return;
        setLocalUpdates(page.items); setNextCursor(page.nextCursor);
      }).catch(error => {
        console.warn('Activity page could not load', error);
        if (mounted) setFeedError('Posts could not be loaded. Check your connection and retry.');
      }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; feedGeneration.current += 1; unsubscribe(); };
  }, [feedRetry, localUpdateSort, localUpdateSort === 'nearest' ? currentLocation?.latitude : null,
    localUpdateSort === 'nearest' ? currentLocation?.longitude : null]);

  const loadMorePosts = useCallback(async () => {
    if (loading || pageInFlight.current || !nextCursor || feedError) return;
    pageInFlight.current = true;
    const generation = feedGeneration.current;
    setLoadingMore(true);
    try {
      const page = await localUpdateService.getLocalUpdatesPage({ cursor: nextCursor, sort: localUpdateSort, location: currentLocation });
      if (generation !== feedGeneration.current) return;
      setLocalUpdates(current => {
        const known = new Set(current.map(item => item.id));
        return [...current, ...page.items.filter(item => !known.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (error) {
      console.warn('Next activity page could not load', error);
      if (generation === feedGeneration.current) setFeedError('More posts could not be loaded. Pull down to retry.');
    } finally {
      if (generation === feedGeneration.current) { pageInFlight.current = false; setLoadingMore(false); }
    }
  }, [loading, nextCursor, feedError, localUpdateSort, currentLocation]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    async function loadActivities() {
      if (activitiesOwner.current !== (user?.id ?? null)) {
        activitiesOwner.current = user?.id ?? null;
        setActivities([]);
        setNotificationError(null);
      }
      if (!user?.id) {
        setActivities([]);
        return;
      }

      try {
        const recentActivities = await activityService.getRecentActivities(20, user.id);
        if (!mounted) return;
        setActivities(recentActivities);
        setNotificationError(null);
        const nextUnsubscribe = activityService.subscribeToActivities((nextActivities) => {
          if (mounted) { setActivities(nextActivities); setNotificationError(null); }
        }, user.id, () => { if (mounted) setNotificationError('Notifications could not be refreshed. Cached notifications may be out of date.'); });
        if (mounted) unsubscribe = nextUnsubscribe;
        else nextUnsubscribe();
      } catch (error) {
        console.error('Unable to load activity notifications:', error);
        if (mounted) setNotificationError('Notifications are unavailable. Check your connection and retry.');
      }
    }

    loadActivities();
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [user?.id, notificationRetry]);

  useEffect(() => {
    let active = true;
    async function loadUpdates() {
      try {
        const updates = await getPublishedAdminUpdates(30);
        if (active) { setAdminUpdates(updates); setAdminUpdatesError(null); }
      } catch {
        if (active) setAdminUpdatesError('Admin updates could not be loaded.');
      }
    }
    void loadUpdates();
    const unsubscribe = subscribeToPublishedAdminUpdates(() => void loadUpdates());
    return () => { active = false; unsubscribe(); };
  }, [notificationRetry, user?.id]);

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
        setSubmissionVotes({});
        return;
      }

      const votesBySubmissionId = await localUpdateService.getSubmissionVotes(user.id);
      if (mounted) setSubmissionVotes(votesBySubmissionId);
      unsubscribe = localUpdateService.subscribeToSubmissionVotes(user.id, (nextVotesBySubmissionId) => {
        if (mounted) setSubmissionVotes(nextVotesBySubmissionId);
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
      setReplyingToComment(null);
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

  useEffect(() => {
    const requestKey = openPostId ? `post:${openPostId}` : openSubmissionId ? `submission:${openSubmissionId}` : null;
    if (!requestKey) { openedPostParamRef.current = null; return; }
    if (openedPostParamRef.current === requestKey) return;
    let cancelled = false;

    async function openSubmissionPost() {
      try {
        const post = openPostId ? await localUpdateService.getLocalUpdateById(openPostId)
          : await localUpdateService.getLocalUpdateForSpotSubmission(openSubmissionId!);
        if (cancelled) return;
        openedPostParamRef.current = requestKey;
        if (!post) {
          Alert.alert('Post unavailable', 'This post is no longer available or is awaiting moderation.');
          return;
        }
        setShowNotifications(false);
        openPost(post);
      } catch {
        if (!cancelled) Alert.alert('Post unavailable', 'This post could not be loaded. Please try again.');
      }
    }

    void openSubmissionPost();
    return () => {
      cancelled = true;
    };
  }, [openPostId, openSubmissionId, openPost]);

  async function voteForUpdate(item: LocalUpdate) {
    if (item.source_type !== 'spot_submission' || !item.source_id) {
      return;
    }

    if (!isSignedIn) {
      Alert.alert('Sign in required', 'Please sign in to vote on new spots.');
      return;
    }

    if (votingUpdateIds.includes(item.id)) return;

    const submissionId = item.source_id;
    const previousVote = submissionVotes[submissionId] ?? null;
    const optimisticVote: SpotVoteType | null = previousVote === 'up' ? null : 'up';
    const previousVoteValue = previousVote === 'up' ? 1 : previousVote === 'down' ? -1 : 0;
    const optimisticVoteValue = optimisticVote === 'up' ? 1 : 0;

    setSubmissionVotes((current) => {
      const nextVotes = { ...current };
      if (optimisticVote) nextVotes[submissionId] = optimisticVote;
      else delete nextVotes[submissionId];
      return nextVotes;
    });
    setLocalUpdates((current) =>
      current.map((update) =>
        update.id === item.id
          ? { ...update, spot_count: item.spot_count + optimisticVoteValue - previousVoteValue }
          : update
      )
    );

    try {
      setVotingUpdateIds((current) => [...current, item.id]);
      const result = await localUpdateService.toggleSpotSubmissionVote(submissionId);
      setSubmissionVotes((current) => {
        const nextVotes = { ...current };
        if (result.vote_type === 'up' || result.vote_type === 'down') {
          nextVotes[submissionId] = result.vote_type;
        } else {
          delete nextVotes[submissionId];
        }
        return nextVotes;
      });
      setLocalUpdates((current) =>
        current.map((update) => (update.id === item.id ? { ...update, spot_count: result.vote_count } : update))
      );
    } catch (error: any) {
      setSubmissionVotes((current) => {
        const nextVotes = { ...current };
        if (previousVote) nextVotes[submissionId] = previousVote;
        else delete nextVotes[submissionId];
        return nextVotes;
      });
      setLocalUpdates((current) =>
        current.map((update) => (update.id === item.id ? { ...update, spot_count: item.spot_count } : update))
      );
      console.error('Unable to vote on spot submission:', error);
      Alert.alert('Vote failed', userErrorMessage(error, 'We could not save your change. Please try again.'));
    } finally {
      setVotingUpdateIds((current) => current.filter((id) => id !== item.id));
    }
  }

  async function selectLocalUpdateSort(nextSort: LocalUpdateSort) {
    if (nextSort === 'nearest' && !currentLocation) {
      const nextLocation = await getCurrentLocation();
      if (!nextLocation) {
        Alert.alert(
          'Location unavailable',
          'Allow location access to sort local updates by distance.'
        );
        return;
      }
    }

    setLocalUpdateSort(nextSort);
    setShowSortOptions(false);
  }

  const openPostSpot = useCallback(async (item: LocalUpdate) => {
    try {
      const spotId = item.spot_id ?? await localUpdateService.getLinkedSpotId(item.id);
      if (spotId) router.push(`/spot/${spotId}`);
      else openPost(item);
    } catch {
      Alert.alert('Spot unavailable', 'Unable to open the linked spot. Please try again.');
    }
  }, [openPost, router]);

  function closeComments() {
    if (sendingComment) return;
    setCommentThreadUpdateId(null);
    setOpenedPost(null);
    router.setParams({ openPostId: '', openSubmissionId: '' });
    setCommentBody('');
    setReplyingToComment(null);
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
      }, replyingToComment?.parent_comment_id ?? replyingToComment?.id ?? null);
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
      setOpenedPost((current) => current?.id === commentThreadUpdateId
        ? { ...current, comments_count: Math.max(current.comments_count, comments.length + 1) } : current);
      setCommentBody('');
      setReplyingToComment(null);
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
    saveReadActivityIds([...new Set([...readActivityIds, ...notificationItems.map((item) => item.id)])]);
  }

  async function openNotification(item: Activity) {
    markNotificationRead(item);
    if (item.type === 'admin_update') return;

    if (item.type === 'spot_comment' || item.type === 'spot_liked') {
      const submissionId = item.target_id;
      if (!submissionId) return;
      const post =
        localUpdates.find((update) => update.source_type === 'spot_submission' && update.source_id === submissionId) ??
        await localUpdateService.getLocalUpdateForSpotSubmission(submissionId);
      if (!post) {
        Alert.alert('Post unavailable', 'This spot post is not available yet.');
        return;
      }
      setShowNotifications(false);
      openPost(post);
      return;
    }

    if (item.type === 'submission_approved' && item.spot_id) {
      setShowNotifications(false);
      router.push({
        pathname: '/',
        params: {
          focusSpotId: item.spot_id,
          openSpot: '1',
        },
      });
      return;
    }

    if (item.type === 'reservation_reminder' && item.target_id) {
      setShowNotifications(false);
      router.push(`/confirmed/${item.target_id}`);
      return;
    }

    if (item.spot_id) {
      router.push(`/spot/${item.spot_id}`);
      return;
    }

    if (item.type.includes('reservation')) {
      router.push('/reservations');
    }
  }

  const voteHandlerRef = useRef(voteForUpdate);
  voteHandlerRef.current = voteForUpdate;
  const onVote = useCallback((item: LocalUpdate) => { void voteHandlerRef.current(item); }, []);
  const renderPost = useCallback(({ item }: { item: LocalUpdate }) => (
    <ActivityPostCard item={item} appColors={appColors}
      currentVote={item.source_id ? submissionVotes[item.source_id] ?? null : null}
      voting={votingUpdateIds.includes(item.id)} onOpen={openPost} onOpenSpot={openPostSpot} onVote={onVote} />
  ), [appColors, submissionVotes, votingUpdateIds, openPost, openPostSpot, onVote]);

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

        {(notificationError || adminUpdatesError) && <Pressable accessibilityRole="button" onPress={() => setNotificationRetry(value => value + 1)} style={styles.emptyNotificationState}>
          <Text style={{ color: appColors.onSurface }}>{notificationError || adminUpdatesError}</Text>
          <Text style={{ color: colors.primary }}>Retry notifications</Text>
        </Pressable>}
        {!isSignedIn && !notificationItems.length ? (
          <View style={styles.emptyNotificationState}>
            <Bell size={22} color={colors.primary} />
            <Text style={[styles.emptyNotificationTitle, { color: appColors.onSurface }]}>Sign in to see notifications</Text>
            <Text style={[styles.emptyNotificationText, { color: appColors.onSurfaceVariant }]}>
              Reservation approvals, alerts, circle activity, and spot updates will appear here.
            </Text>
          </View>
        ) : notificationItems.length ? (
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

            {notificationItems.map((item) => {
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
                    void openNotification(item);
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
            <Text style={[styles.emptyNotificationTitle, { color: appColors.onSurface }]}>{notificationError ? 'Notifications unavailable' : 'No notifications yet'}</Text>
            <Text style={[styles.emptyNotificationText, { color: appColors.onSurfaceVariant }]}>
              {notificationError ? 'Retry to check for updates.' : 'Reservation approvals, alerts, circle activity, and spot updates will show up here.'}
            </Text>
          </View>
        )}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer appColors={appColors} showBottomNav padded={false}>
      <FlatList
        ref={feedList}
        data={sortedLocalUpdates}
        keyExtractor={item => item.id}
        renderItem={renderPost}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS === 'android'}
        onEndReached={() => void loadMorePosts()}
        onEndReachedThreshold={0.5}
        refreshing={loading}
        onRefresh={() => setFeedRetry(value => value + 1)}
        ListHeaderComponent={<>
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
        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: appColors.onSurface }]}>Local Updates</Text>
          {!feedError && !liveFeedPaused && <View style={styles.liveDot} />}
        </View>
        <Pressable
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Sort local updates. Current sort: ${activeSortLabel}`}
          accessibilityHint="Opens feed sorting choices."
          style={({ pressed }) => [
            styles.sortButton,
            {
              backgroundColor: appColors.surfaceLow,
              borderColor: appColors.outlineVariant + '66',
            },
            pressed && styles.pressedButton,
          ]}
          onPress={() => setShowSortOptions(true)}
        >
          <ListFilter size={17} color={colors.primary} />
          <Text style={[styles.sortButtonText, { color: appColors.onSurface }]}>{activeSortLabel}</Text>
        </Pressable>
      </View>

      {feedError && <Pressable accessibilityRole="button" onPress={() => setFeedRetry(value => value + 1)} style={styles.emptyNotificationState}>
        <Text style={{ color: appColors.onSurface }}>{feedError}</Text>
        <Text style={{ color: colors.primary }}>Retry local updates</Text>
      </Pressable>}

          {liveFeedPaused && <Text style={{ color: appColors.onSurfaceVariant }}>Live updates paused. Pull down to refresh.</Text>}
          {newPostsAvailable && <Pressable onPress={() => setFeedRetry(value => value + 1)} style={styles.emptyNotificationState}>
            <Text style={{ color: colors.primary }}>New posts available. Tap to refresh.</Text>
          </Pressable>}
        </>}
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> :
          !feedError ? <Text style={{ color: appColors.onSurfaceVariant }}>No posts yet.</Text> : null}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
      />

      <Modal
        visible={showSortOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSortOptions(false)}
      >
        <View style={styles.sortModalRoot}>
          <Pressable
            accessible
            accessibilityRole="button"
            accessibilityLabel="Close sorting choices"
            style={styles.sortBackdrop}
            onPress={() => setShowSortOptions(false)}
          />
          <View style={[styles.sortSheet, { backgroundColor: appColors.surface }]}>
            <View style={[styles.sortHandle, { backgroundColor: appColors.outlineVariant }]} />
            <View style={styles.sortSheetHeader}>
              <View>
                <Text style={[styles.sortSheetTitle, { color: appColors.onSurface }]}>Sort local updates</Text>
                <Text style={[styles.sortSheetSubtitle, { color: appColors.onSurfaceVariant }]}>Choose how posts appear in your feed</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close sorting choices"
                style={[styles.sortCloseButton, { backgroundColor: appColors.surfaceContainer }]}
                onPress={() => setShowSortOptions(false)}
              >
                <X size={18} color={appColors.onSurfaceVariant} />
              </Pressable>
            </View>

            <View style={styles.sortOptions}>
              {localUpdateSortOptions.map((option) => {
                const selected = option.value === localUpdateSort;
                const SortIcon = option.icon;
                const waitingForLocation = option.value === 'nearest' && locating;

                return (
                  <Pressable
                    key={option.value}
                    accessible
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: waitingForLocation }}
                    disabled={waitingForLocation}
                    style={({ pressed }) => [
                      styles.sortOption,
                      {
                        backgroundColor: selected ? colors.primary + '14' : appColors.surfaceLow,
                        borderColor: selected ? colors.primary : appColors.outlineVariant + '55',
                      },
                      pressed && styles.pressedButton,
                    ]}
                    onPress={() => void selectLocalUpdateSort(option.value)}
                  >
                    <View style={[styles.sortOptionIcon, { backgroundColor: selected ? colors.primary : appColors.surfaceContainer }]}>
                      {waitingForLocation ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <SortIcon size={20} color={selected ? colors.white : appColors.onSurfaceVariant} />
                      )}
                    </View>
                    <View style={styles.sortOptionCopy}>
                      <Text style={[styles.sortOptionLabel, { color: appColors.onSurface }]}>{option.label}</Text>
                      <Text style={[styles.sortOptionDescription, { color: appColors.onSurfaceVariant }]}>{option.description}</Text>
                    </View>
                    <View
                      style={[
                        styles.sortSelection,
                        { borderColor: selected ? colors.primary : appColors.outlineVariant },
                        selected && styles.sortSelectionActive,
                      ]}
                    >
                      {selected ? <Check size={14} color={colors.white} strokeWidth={3} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

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
                    <View style={styles.postSpotStat}>
                      <MapPin size={14} color={colors.primary} strokeWidth={2.5} />
                      <Text style={[styles.postStatText, { color: appColors.onSurfaceVariant }]}>
                        {formatSpotScore(selectedCommentUpdate.spot_count)} Spot
                      </Text>
                    </View>
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
              ) : parentComments.length === 0 ? (
                <View style={styles.commentEmptyState}>
                  <MessageCircle size={24} color={appColors.onSurfaceVariant} />
                  <Text style={[styles.commentEmptyTitle, { color: appColors.onSurface }]}>No comments yet</Text>
                  <Text style={[styles.commentEmptyText, { color: appColors.onSurfaceVariant }]}>Start the conversation.</Text>
                </View>
              ) : (
                parentComments.map((comment) => {
                  const replies = comments.filter((reply) => reply.parent_comment_id === comment.id);
                  const threadComments = [comment, ...replies];
                  return threadComments.map((threadComment) => {
                    const isReply = threadComment.parent_comment_id === comment.id;
                    const showAvatar = Boolean(
                      threadComment.user_photo_url && !failedCommentAvatarIds.includes(threadComment.id)
                    );
                    return (
                      <View
                        key={threadComment.id}
                        style={[styles.commentRow, isReply && styles.commentReplyRow]}
                      >
                        {showAvatar ? (
                          <Image
                            source={{ uri: threadComment.user_photo_url! }}
                            style={isReply ? styles.commentReplyAvatar : styles.commentAvatar}
                            onError={() =>
                              setFailedCommentAvatarIds((current) => [...new Set([...current, threadComment.id])])
                            }
                          />
                        ) : (
                          <View
                            style={[
                              isReply ? styles.commentReplyAvatarFallback : styles.commentAvatarFallback,
                              { backgroundColor: appColors.surfaceContainer },
                            ]}
                          >
                            <User size={isReply ? 14 : 17} color={appColors.onSurfaceVariant} />
                          </View>
                        )}
                        <View style={styles.commentCopy}>
                          <View style={styles.commentMetaRow}>
                            <Text style={[styles.commentAuthor, { color: appColors.onSurface }]} numberOfLines={1}>
                              {threadComment.user_name}
                            </Text>
                            <Text style={[styles.commentTime, { color: appColors.onSurfaceVariant }]}>
                              {formatUpdateTime(threadComment.created_at)}
                            </Text>
                          </View>
                          <Text style={[styles.commentBody, { color: appColors.onSurfaceVariant }]}>
                            {threadComment.body}
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Reply to ${threadComment.user_name}`}
                            style={styles.replyButton}
                            onPress={() => setReplyingToComment(threadComment)}
                          >
                            <Text style={styles.replyButtonText}>Reply</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  });
                })
              )}
            </ScrollView>

            <View style={[styles.commentComposer, { borderTopColor: appColors.outlineVariant }]}>
              {replyingToComment ? (
                <View style={[styles.replyingBanner, { backgroundColor: appColors.surfaceLow }]}>
                  <Text style={[styles.replyingText, { color: appColors.onSurfaceVariant }]} numberOfLines={1}>
                    Replying to {replyingToComment.user_name}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancel reply"
                    onPress={() => setReplyingToComment(null)}
                  >
                    <X size={16} color={appColors.onSurfaceVariant} />
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.commentComposerRow}>
                <TextInput
                  multiline
                  editable={isSignedIn && !sendingComment}
                  maxLength={500}
                  value={commentBody}
                  placeholder={
                    isSignedIn
                      ? replyingToComment
                        ? `Reply to ${replyingToComment.user_name}`
                        : 'Write a comment'
                      : 'Sign in to comment'
                  }
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
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
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
    marginBottom: spacing.md,
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
  spotVoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sortButton: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  sortButtonText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  voteScoreText: {
    minWidth: 20,
    textAlign: 'center',
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  voteLabelText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  postSpotStat: {
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
  sortModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sortBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.black + '72',
  },
  sortSheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    ...shadow.lifted,
  },
  sortHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  sortSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  sortSheetTitle: {
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  sortSheetSubtitle: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  sortCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortOptions: {
    gap: spacing.sm,
  },
  sortOption: {
    minHeight: 76,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sortOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortOptionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sortOptionLabel: {
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  sortOptionDescription: {
    marginTop: 2,
    fontSize: fontSize.xs,
    lineHeight: 17,
    fontWeight: '700',
  },
  sortSelection: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortSelectionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
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
  commentReplyRow: {
    marginLeft: 46,
    paddingTop: 0,
  },
  commentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  commentReplyAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  commentAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentReplyAvatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
  replyButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    minHeight: 28,
    justifyContent: 'center',
  },
  replyButtonText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  commentComposer: {
    minHeight: 78,
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentComposerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  replyingBanner: {
    minHeight: 34,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  replyingText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '800',
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
