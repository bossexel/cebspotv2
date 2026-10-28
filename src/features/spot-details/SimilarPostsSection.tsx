import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MapPin, MessageCircle, PlayCircle, User } from 'lucide-react-native';
import { AppButton } from '../../components/AppButton';
import { colors } from '../../constants/colors';
import { fontSize, radius, spacing } from '../../constants/design';
import { useTheme } from '../../hooks/useTheme';
import { localUpdateService, type SpotPostCursor } from '../../services/localUpdateService';
import type { LocalUpdate } from '../../types';

function SimilarPostCard({ post, onOpen }: { post: LocalUpdate; onOpen: () => void }) {
  const { appColors } = useTheme();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const isVideo = /\.(mp4|mov|m4v|webm)(?:[?#]|$)/i.test(post.image_url ?? '');
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open post by ${post.user_name}: ${post.title}`}
    accessibilityHint="Opens this author's full post, media and comment thread."
    onPress={onOpen} style={({ pressed }) => [styles.card,
      { backgroundColor: appColors.surfaceLow, borderColor: appColors.outlineVariant }, pressed && styles.pressed]}>
    <View style={styles.authorRow}>
      {post.user_photo_url && failedAvatar !== post.user_photo_url
        ? <Image source={{ uri: post.user_photo_url }} style={styles.avatar} onError={() => setFailedAvatar(post.user_photo_url ?? null)} />
        : <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: appColors.surfaceContainer }]}><User size={18} color={appColors.onSurfaceVariant} /></View>}
      <View style={styles.authorCopy}>
        <Text style={[styles.author, { color: appColors.onSurface }]}>{post.user_name}</Text>
        <Text style={[styles.time, { color: appColors.onSurfaceVariant }]}>{new Date(post.created_at).toLocaleString()}</Text>
      </View>
    </View>
    <Text style={[styles.postTitle, { color: appColors.onSurface }]} numberOfLines={2}>{post.title}</Text>
    {!!post.body && <Text style={[styles.caption, { color: appColors.onSurfaceVariant }]} numberOfLines={4}>{post.body}</Text>}
    {post.image_url && failedImage !== post.image_url && (isVideo
      ? <View style={[styles.video, { backgroundColor: appColors.surfaceContainer }]}><PlayCircle size={32} color={colors.primary} /><Text style={{ color: appColors.onSurface }}>Open post video</Text></View>
      : <Image source={{ uri: post.image_url }} style={styles.cover} resizeMode="cover" onError={() => setFailedImage(post.image_url ?? null)} />)}
    <View style={styles.stats}>
      <MapPin size={16} color={colors.primary} /><Text style={{ color: appColors.onSurfaceVariant }}>{post.spot_count} Spot</Text>
      <MessageCircle size={16} color={appColors.onSurfaceVariant} /><Text style={{ color: appColors.onSurfaceVariant }}>{post.comments_count} Comments</Text>
      <Text style={[styles.openLabel, { color: colors.primary }]}>Open post</Text>
    </View>
  </Pressable>;
}

export function SimilarPostsSection({ spotId, onOpenPost }: { spotId: string; onOpenPost: (postId: string) => void }) {
  const { appColors } = useTheme();
  const [posts, setPosts] = useState<LocalUpdate[]>([]);
  const [cursor, setCursor] = useState<SpotPostCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    const version = ++generation.current;
    inFlight.current = true;
    setPosts([]); setCursor(null); setError(null); setLoading(true);
    localUpdateService.getPostsForSpot(spotId).then(page => {
      if (!active || generation.current !== version) return;
      setPosts(page.items); setCursor(page.nextCursor);
    }).catch(() => {
      if (active && generation.current === version) setError('Posts are temporarily unavailable.');
    }).finally(() => {
      if (active && generation.current === version) { inFlight.current = false; setLoading(false); }
    });
    return () => { active = false; generation.current += 1; inFlight.current = false; };
  }, [spotId]));

  async function loadMore() {
    if (!cursor || inFlight.current) return;
    const version = generation.current;
    inFlight.current = true; setLoading(true); setError(null);
    try {
      const page = await localUpdateService.getPostsForSpot(spotId, cursor);
      if (generation.current !== version) return;
      setPosts(current => {
        const known = new Set(current.map(post => post.id));
        return [...current, ...page.items.filter(post => !known.has(post.id))];
      });
      setCursor(page.nextCursor);
    } catch {
      if (generation.current === version) setError('More posts are temporarily unavailable.');
    } finally {
      if (generation.current === version) { inFlight.current = false; setLoading(false); }
    }
  }

  return <View style={styles.section} testID="similar-posts-section">
    <Text style={[styles.title, { color: appColors.onSurface }]}>Similar Posts</Text>
    <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>Community posts about this spot, newest first.</Text>
    {posts.map(post => <SimilarPostCard key={post.id} post={post} onOpen={() => onOpenPost(post.id)} />)}
    {loading && <ActivityIndicator color={colors.primary} accessibilityLabel="Loading similar posts" />}
    {!!error && <View style={styles.empty}>
      <Text accessibilityRole="alert" style={{ color: appColors.onSurfaceVariant }}>{error}</Text>
    </View>}
    {!loading && !error && !posts.length && <View style={[styles.empty, { backgroundColor: appColors.surfaceLow }]}>
      <Text style={[styles.postTitle, { color: appColors.onSurface }]}>No similar posts yet</Text>
      <Text style={[styles.subtitle, { color: appColors.onSurfaceVariant }]}>Posts linked to this spot will appear here.</Text>
    </View>}
    {cursor && <AppButton label="Show more posts" variant="ghost" disabled={loading} onPress={() => void loadMore()} />}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: '900' },
  subtitle: { fontSize: fontSize.sm, lineHeight: 20 },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  pressed: { opacity: 0.75 },
  authorRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  authorCopy: { flex: 1, gap: 2 },
  author: { fontSize: fontSize.sm, fontWeight: '800' },
  time: { fontSize: fontSize.xs },
  postTitle: { fontSize: fontSize.md, fontWeight: '800' },
  caption: { fontSize: fontSize.sm, lineHeight: 21 },
  cover: { width: '100%', height: 190, borderRadius: radius.lg },
  video: { height: 120, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  stats: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  openLabel: { marginLeft: 'auto', fontSize: fontSize.sm, fontWeight: '700' },
  empty: { padding: spacing.md, borderRadius: radius.lg, gap: spacing.sm },
});
