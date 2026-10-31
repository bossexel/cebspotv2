import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, DeviceEventEmitter, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, MapPin, NotebookPen, PlayCircle, Plus, MoreVertical } from 'lucide-react-native';
import { ScreenContainer } from '../src/components/ScreenContainer';
import { colors, type AppColors } from '../src/constants/colors';
import { fontSize, radius, spacing, tabBarHeight } from '../src/constants/design';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';
import { yourPostsService, type YourSpotPost, type YourPostsCursor } from '../src/services/yourPostsService';

const statusLabel = { pending: 'Awaiting spot review', approved: 'Spot approved', rejected: 'Spot not approved' };
const postKey = (item: YourSpotPost) => item.id;

// Keep image state in the visible card so a failed image does not rerender
// the entire feed. Full captions and galleries are loaded on the post screen.
const YourPostCard = memo(function YourPostCard({ item, appColors, busy, deleting, onOpen, onEdit, onDelete }: {
  item: YourSpotPost; appColors: AppColors; busy: boolean; deleting: boolean;
  onOpen: (item: YourSpotPost) => void; onEdit: (item: YourSpotPost) => void; onDelete: (item: YourSpotPost) => void;
}) {
  const [failedMedia, setFailedMedia] = useState(false);
  const preview = item.images?.[0];
  const editable = item.status === 'pending' || item.status === 'rejected' || item.status === 'approved';
  const openOptions = () => Alert.alert('Post options', item.name, [
    ...(editable ? [{ text: 'Edit details', onPress: () => onEdit(item) }] : []),
    ...((item.status === 'pending' || item.status === 'rejected')
      ? [{ text: 'Delete', style: 'destructive' as const, onPress: () => onDelete(item) }]
      : []),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
  return <View style={[styles.card, { backgroundColor: appColors.surfaceLow }]}>
  <Pressable accessibilityRole="button" accessibilityLabel={`Open your post about ${item.name}`}
    accessibilityHint="Opens this post and its comments" accessibilityState={{ busy }}
    onPress={() => onOpen(item)} style={({ pressed }) => [pressed && styles.pressed]}>
    <View style={styles.meta}>
      <Text style={[styles.status, { color: appColors.onSurface, backgroundColor: appColors.surfaceHighest }]}>{statusLabel[item.status]}</Text>
      <View style={styles.headerActions}>
        <Text style={{ color: appColors.onSurfaceVariant }}>{new Date(item.created_at).toLocaleDateString()}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Post options for ${item.name}`}
          accessibilityHint="Shows edit and delete actions" disabled={deleting || !editable}
          onPress={openOptions} style={styles.optionsButton}>
          <MoreVertical size={21} color={appColors.onSurfaceVariant} />
        </Pressable>
      </View>
    </View>
    <Text style={[styles.cardTitle, { color: appColors.onSurface }]} numberOfLines={2}>{item.name}</Text>
    {!!item.description && <Text style={[styles.body, { color: appColors.onSurface }]} numberOfLines={3}>{item.description}</Text>}
    <View style={styles.row}><MapPin size={16} color={appColors.onSurfaceVariant} />
      <Text style={[styles.flex, { color: appColors.onSurfaceVariant }]} numberOfLines={2}>{item.address}</Text>
    </View>
    {!!(item.categories?.length || item.category) && <Text numberOfLines={2} style={[styles.category, { color: appColors.onSurfaceVariant }]}>
      {(item.categories?.length ? item.categories : [item.category]).filter(Boolean).join(' · ')}
    </Text>}
    {!!preview && <View style={[styles.media, { backgroundColor: appColors.surfaceHighest }]}>
      {/\.(mp4|mov|m4v|webm)(?:[?#]|$)/i.test(preview)
        ? <><PlayCircle size={28} color={colors.primary} /><Text style={{ color: appColors.onSurfaceVariant }}>Video</Text></>
        : failedMedia ? <Text style={{ color: appColors.onSurfaceVariant }}>Photo unavailable</Text>
          : <Image source={{ uri: preview }} resizeMode="cover" accessibilityLabel={`Photo of ${item.name}`}
            style={styles.image} onError={() => setFailedMedia(true)} />}
      {(item.images?.length ?? 0) > 1 && <View style={styles.mediaCount}>
        <Text style={styles.mediaCountText}>+{item.images!.length - 1}</Text>
      </View>}
    </View>}
    {item.status === 'rejected' && !!item.rejection_reason && <Text numberOfLines={3} style={{ color: appColors.onSurfaceVariant }}>Review note: {item.rejection_reason}</Text>}
    {busy && <ActivityIndicator accessibilityLabel="Opening post" color={colors.primary} />}
  </Pressable>
  {item.status === 'approved' && <Text style={[styles.approvedNote, { color: appColors.onSurfaceVariant }]}>You can edit this post; it will return to review. The live map listing stays unchanged until an admin updates it. Contact an admin to remove that listing.</Text>}
  </View>;
});

export default function YourPostsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { appColors } = useTheme();
  const [items, setItems] = useState<YourSpotPost[]>([]);
  const [nextCursor, setNextCursor] = useState<YourPostsCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [opening, setOpening] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const generation = useRef(0);
  const loadingRef = useRef(false);
  const openingRef = useRef(false);
  const loadedOwner = useRef<string | null>(null);
  const lastFetchedCursor = useRef<string | null>(null);
  const interacted = useRef(false);
  const list = useRef<FlatList<YourSpotPost>>(null);

  const refresh = useCallback(() => {
    loadedOwner.current = null;
    lastFetchedCursor.current = null;
    list.current?.scrollToOffset({ offset: 0, animated: false });
    setReload(value => value + 1);
  }, []);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('your-posts-submission-updated', refresh);
    return () => subscription.remove();
  }, [refresh]);

  useFocusEffect(useCallback(() => {
    const version = ++generation.current;
    setOpening(null); openingRef.current = false;
    // Expo keeps the list mounted behind a post. Preserve its rows and scroll
    // position on return; pull-to-refresh explicitly rechecks review statuses.
    if (user?.id && loadedOwner.current === user.id) {
      setLoading(false); loadingRef.current = false;
      return () => { generation.current += 1; };
    }
    loadedOwner.current = null;
    lastFetchedCursor.current = null;
    setItems([]); setNextCursor(null); setLoading(true); setError(null);
    loadingRef.current = true; interacted.current = false;
    async function load() {
      try {
        if (!user?.id) throw new Error('Sign in to see your posts.');
        const page = await yourPostsService.getPage(user.id);
        if (generation.current !== version) return;
        loadedOwner.current = user.id;
        setItems(page.items); setNextCursor(page.nextCursor);
      } catch {
        if (generation.current === version) setError('Your posts could not be loaded. Please try again.');
      } finally {
        if (generation.current === version) { setLoading(false); loadingRef.current = false; }
      }
    }
    void load();
    return () => { generation.current += 1; };
  }, [user?.id, reload]));

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingRef.current || !user?.id) return;
    const cursorKey = `${nextCursor.createdAt}:${nextCursor.id}`;
    if (lastFetchedCursor.current === cursorKey) return;
    const version = generation.current;
    loadingRef.current = true; setLoading(true); setError(null);
    try {
      const page = await yourPostsService.getPage(user.id, nextCursor);
      if (generation.current !== version) return;
      lastFetchedCursor.current = cursorKey;
      setItems(current => [...new Map([...current, ...page.items].map(item => [item.id, item])).values()]);
      setNextCursor(page.nextCursor);
    } catch {
      if (generation.current === version) setError('More posts could not be loaded. Please try again.');
    } finally {
      if (generation.current === version) { setLoading(false); loadingRef.current = false; }
    }
  }, [nextCursor, user?.id]);

  const openPost = useCallback(async (item: YourSpotPost) => {
    if (openingRef.current || item.submitter_id !== user?.id) return;
    const version = generation.current;
    openingRef.current = true;
    let navigated = false;
    try {
      let postId = item.postId;
      if (postId === undefined) {
        setOpening(item.id);
        postId = await yourPostsService.getPostId(user.id, item.id);
        if (generation.current !== version) return;
        const resolvedPostId = postId;
        setItems(current => current.map(row => row.id === item.id ? { ...row, postId: resolvedPostId } : row));
      }
      if (generation.current !== version) return;
      if (postId) { router.push(`/post/${postId}`); navigated = true; }
      else Alert.alert('Post unavailable', 'Your original submission is shown here. Its community post may be awaiting moderation or unavailable.');
    } catch {
      if (generation.current === version) Alert.alert('Unable to open post', 'Please try again when connected.');
    } finally {
      if (!navigated && generation.current === version) { openingRef.current = false; setOpening(null); }
    }
  }, [router, user?.id]);

  const editPost = useCallback((item: YourSpotPost) => {
    if (item.submitter_id !== user?.id) return;
    router.push({ pathname: '/submit-spot', params: { submissionId: item.id } });
  }, [router, user?.id]);

  const deletePost = useCallback((item: YourSpotPost) => {
    if (!user?.id || item.submitter_id !== user.id || (item.status !== 'pending' && item.status !== 'rejected') || deleting) return;
    Alert.alert('Delete spot submission?', 'This permanently removes your unapproved submission and its Activity post, comments, and votes.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        setDeleting(item.id);
        void yourPostsService.deleteOwnSubmission(user.id, item.id)
          .then(() => setItems(current => current.filter(row => row.id !== item.id)))
          .catch(() => Alert.alert('Could not delete spot', 'Your submission is still saved. Please try again when connected.'))
          .finally(() => setDeleting(current => current === item.id ? null : current));
      } },
    ]);
  }, [deleting, user?.id]);

  const renderItem = useCallback(({ item }: { item: YourSpotPost }) =>
    <YourPostCard item={item} appColors={appColors} busy={opening === item.id} deleting={deleting === item.id}
      onOpen={openPost} onEdit={editPost} onDelete={deletePost} />,
  [appColors, deleting, deletePost, editPost, opening, openPost]);

  return <ScreenContainer appColors={appColors} showBottomNav bottomNavOverlay padded={false}>
    <FlatList ref={list} testID="your-posts-list" data={loadedOwner.current === user?.id ? items : []} renderItem={renderItem} keyExtractor={postKey}
      style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
      initialNumToRender={4} maxToRenderPerBatch={4} windowSize={5} updateCellsBatchingPeriod={50}
      refreshing={loading && !items.length} onRefresh={refresh}
      onScrollBeginDrag={() => { interacted.current = true; }}
      onEndReached={() => { if (interacted.current && !error) void loadMore(); }} onEndReachedThreshold={0.4}
      ItemSeparatorComponent={PostSeparator}
      ListHeaderComponent={<View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Profile"
          onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} style={styles.iconButton}>
          <ArrowLeft size={24} color={appColors.onSurface} />
        </Pressable>
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={[styles.title, { color: appColors.onSurface }]}>Your Posts</Text>
          <Text style={{ color: appColors.onSurfaceVariant }}>Spots you shared, newest first</Text>
        </View>
      </View>}
      ListEmptyComponent={!loading && !error ? <View style={[styles.empty, { backgroundColor: appColors.surfaceLow }]}>
        <NotebookPen size={32} color={colors.primary} />
        <Text style={[styles.cardTitle, { color: appColors.onSurface }]}>Your discoveries start here</Text>
        <Text style={[styles.emptyCopy, { color: appColors.onSurfaceVariant }]}>Share a spot and find your post and its review status here.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Share a Spot" onPress={() => router.push('/submit-spot')} style={styles.button}>
          <Plus size={20} color={colors.primary} /><Text style={styles.actionText}>Share a Spot</Text>
        </Pressable>
      </View> : null}
      ListFooterComponent={<>
        {!!error && <View style={[styles.notice, { backgroundColor: appColors.surfaceLow }]}>
          <Text accessibilityRole="alert" style={{ color: appColors.onSurfaceVariant }}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => items.length ? void loadMore() : refresh()} style={styles.button}>
            <Text style={styles.actionText}>Try again</Text>
          </Pressable>
        </View>}
        {loading && <ActivityIndicator accessibilityLabel="Loading your posts" color={colors.primary} style={styles.loader} />}
        {!loading && nextCursor && !error && <Pressable accessibilityRole="button" onPress={() => void loadMore()} style={styles.button}>
          <Text style={styles.actionText}>Load more posts</Text>
        </Pressable>}
      </>}
    />
  </ScreenContainer>;
}

function PostSeparator() { return <View style={styles.separator} />; }

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: tabBarHeight + spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  iconButton: { padding: spacing.sm, minWidth: 44, minHeight: 44 },
  title: { fontSize: fontSize.xxl, fontWeight: '900' },
  separator: { height: spacing.md },
  card: { borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm },
  approvedNote: { fontSize: fontSize.xs, lineHeight: 18 },
  pressed: { opacity: 0.78 },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '800' },
  body: { fontSize: fontSize.md, lineHeight: 55 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  optionsButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  category: { marginLeft: 0, marginTop: 2 * spacing.xs, fontSize: 1.3 *  fontSize.xs, lineHeight: 30, fontWeight: '700' },
  status: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 6, fontSize: fontSize.xs, fontWeight: '700' },
  media: { height: 170, borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  image: { width: '100%', height: '100%' },
  mediaCount: { position: 'absolute', bottom: spacing.sm, right: spacing.sm, borderRadius: radius.pill, backgroundColor: '#000000B3', paddingHorizontal: spacing.sm, paddingVertical: 4 },
  mediaCountText: { color: colors.white, fontWeight: '800' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.sm, minHeight: 44 },
  actionText: { color: colors.primary, fontWeight: '800' },
  empty: { alignItems: 'center', padding: spacing.xl, borderRadius: radius.xl, gap: spacing.md },
  emptyCopy: { textAlign: 'center', lineHeight: 22 },
  notice: { padding: spacing.md, borderRadius: radius.lg, marginTop: spacing.md },
  loader: { marginVertical: spacing.xl },
});
