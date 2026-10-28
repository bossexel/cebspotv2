import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, MapPin, MessageCircle, PlayCircle, Send, User, X } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/ScreenContainer';
import { colors } from '../../src/constants/colors';
import { fontSize, radius, spacing } from '../../src/constants/design';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { localUpdateService } from '../../src/services/localUpdateService';
import type { LocalUpdate, LocalUpdateComment, SpotVoteType } from '../../src/types';

export default function PostDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { appColors } = useTheme();
  const { user, profile, isSignedIn } = useAuth();
  const { width } = useWindowDimensions();
  const [post, setPost] = useState<LocalUpdate | null>(null);
  const [comments, setComments] = useState<LocalUpdateComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<LocalUpdateComment | null>(null);
  const [sending, setSending] = useState(false);
  const [vote, setVote] = useState<SpotVoteType | null>(null);
  const [voting, setVoting] = useState(false);
  const [failedMedia, setFailedMedia] = useState<string[]>([]);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const generation = useRef(0);
  const sendingRef = useRef(false);
  const votingRef = useRef(false);

  useFocusEffect(useCallback(() => {
    const version = ++generation.current;
    let active = true;
    setPost(null); setComments([]); setLoading(true); setError(null); setCommentError(null);
    setVote(null); setBody(''); setReplyTo(null); setFailedMedia([]); setAvatarFailed(false);
    async function load() {
      try {
        const next = await localUpdateService.getLocalUpdateById(id);
        if (!active || generation.current !== version) return;
        if (!next) { setError('This post is unavailable or is awaiting moderation.'); return; }
        setPost(next);
        if (user?.id && next.source_id) {
          const votes = await localUpdateService.getSubmissionVotes(user.id);
          if (active && generation.current === version) setVote(votes[next.source_id] ?? null);
        }
      } catch {
        if (active && generation.current === version) setError('This post could not be loaded. Please open it again when connected.');
      } finally {
        if (active && generation.current === version) setLoading(false);
      }
    }
    void load();
    return () => { active = false; generation.current += 1; };
  }, [id, user?.id]));

  useEffect(() => {
    if (!post?.id) return;
    let active = true;
    setCommentsLoading(true);
    const postId = post.id;
    localUpdateService.getComments(postId).then(rows => {
      if (active) setComments(current => {
        const merged = new Map([...rows, ...current].map(comment => [comment.id, comment]));
        return [...merged.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
      });
    }).catch(() => { if (active) setCommentError('Comments could not be loaded.'); })
      .finally(() => { if (active) setCommentsLoading(false); });
    const unsubscribe = localUpdateService.subscribeToComments(postId, rows => {
      if (active) { setComments(rows); setCommentError(null); }
    });
    return () => { active = false; unsubscribe(); };
  }, [post?.id]);

  async function reactToPost() {
    if (!post?.source_id || post.source_type !== 'spot_submission' || votingRef.current) return;
    if (!isSignedIn) { Alert.alert('Sign in required', 'Please sign in to react to this post.'); return; }
    const version = generation.current;
    votingRef.current = true; setVoting(true);
    try {
      const result = await localUpdateService.toggleSpotSubmissionVote(post.source_id);
      if (generation.current === version) {
        setVote(result.vote_type ?? (result.voted ? 'up' : null));
        setPost(current => current ? { ...current, spot_count: result.vote_count } : current);
      }
    } catch { if (generation.current === version) Alert.alert('Reaction unavailable', 'Your reaction could not be saved.'); }
    finally { votingRef.current = false; setVoting(false); }
  }

  async function sendComment() {
    if (!post || !body.trim() || sendingRef.current) return;
    if (!isSignedIn || !user?.id) { Alert.alert('Sign in required', 'Please sign in to comment.'); return; }
    const version = generation.current;
    sendingRef.current = true; setSending(true);
    try {
      const comment = await localUpdateService.addComment(post.id, body, {
        id: user.id, name: profile?.display_name || user.email?.split('@')[0] || 'Explorer', photoUrl: profile?.photo_url,
      }, replyTo?.parent_comment_id ?? replyTo?.id ?? null);
      if (generation.current !== version) return;
      setComments(current => current.some(item => item.id === comment.id) ? current : [...current, comment]);
      setPost(current => current ? { ...current, comments_count: Math.max(current.comments_count, comments.length + 1) } : current);
      setBody(''); setReplyTo(null); setCommentError(null);
    } catch (failure: any) { if (generation.current === version) Alert.alert('Comment unavailable', failure.message ?? 'Your comment could not be saved.'); }
    finally { sendingRef.current = false; setSending(false); }
  }

  const media = [...new Set([...(post?.media_urls ?? []), post?.image_url].filter((url): url is string => Boolean(url)))];
  const mediaWidth = Math.max(240, width - spacing.lg * 2);
  const commentCount = Math.max(comments.length, post?.comments_count ?? 0);
  return <ScreenContainer appColors={appColors} padded={false}>
    <View style={[styles.header, { borderBottomColor: appColors.outlineVariant }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back from post" onPress={() => router.canGoBack() ? router.back() : router.replace('/activity')} style={styles.iconButton}>
        <ArrowLeft size={24} color={appColors.onSurface} />
      </Pressable>
      <Text accessibilityRole="header" style={[styles.heading, { color: appColors.onSurface }]}>Post</Text>
    </View>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {loading && <ActivityIndicator color={colors.primary} accessibilityLabel="Loading post" />}
        {!!error && <Text accessibilityRole="alert" style={{ color: appColors.onSurfaceVariant }}>{error}</Text>}
        {post && <>
          <View style={styles.authorRow}>
            {post.user_photo_url && !avatarFailed
              ? <Image source={{ uri: post.user_photo_url }} style={styles.avatar} onError={() => setAvatarFailed(true)} />
              : <View style={[styles.avatar, styles.center, { backgroundColor: appColors.surfaceLow }]}><User size={22} color={appColors.onSurfaceVariant} /></View>}
            <View style={styles.flex}>
              <Text style={[styles.author, { color: appColors.onSurface }]}>{post.user_name}</Text>
              <Text style={{ color: appColors.onSurfaceVariant }}>{new Date(post.created_at).toLocaleString()}</Text>
            </View>
          </View>
          <Text style={[styles.heading, { color: appColors.onSurface }]}>{post.title}</Text>
          {!!post.body && <Text style={[styles.body, { color: appColors.onSurface }]}>{post.body}</Text>}
          <Text style={{ color: appColors.onSurfaceVariant }}>{post.location_name}</Text>
          {!!media.length && <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {media.map(url => <View key={url} style={{ width: mediaWidth }}>
              {failedMedia.includes(url) ? <Text style={{ color: appColors.onSurfaceVariant }}>Attachment unavailable</Text>
                : /\.(mp4|mov|m4v|webm)(?:[?#]|$)/i.test(url)
                  ? <Pressable accessibilityRole="button" accessibilityLabel="Open attached video" onPress={() => void Linking.openURL(url).catch(() => Alert.alert('Video unavailable', 'This attachment could not be opened.'))} style={[styles.video, styles.center, { backgroundColor: appColors.surfaceLow }]}>
                    <PlayCircle size={44} color={colors.primary} /><Text style={{ color: appColors.onSurface }}>Open video</Text>
                  </Pressable>
                  : <Image source={{ uri: url }} resizeMode="contain" style={styles.photo} onError={() => setFailedMedia(current => [...current, url])} />}
            </View>)}
          </ScrollView>}
          <View style={styles.authorRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={vote === 'up' ? 'Remove Spot from this post' : 'Spot this post'}
              accessibilityState={{ selected: vote === 'up', disabled: voting || post.source_type !== 'spot_submission' || !post.source_id }}
              disabled={voting || post.source_type !== 'spot_submission' || !post.source_id} onPress={() => void reactToPost()} style={styles.stats}>
              <MapPin size={21} color={vote === 'up' ? colors.primary : appColors.onSurfaceVariant} />
              <Text style={{ color: appColors.onSurface }}>{post.spot_count} Spot</Text>
            </Pressable>
            <MessageCircle size={20} color={appColors.onSurfaceVariant} /><Text style={{ color: appColors.onSurfaceVariant }}>{commentCount} Comments</Text>
          </View>
          <Text style={[styles.heading, { color: appColors.onSurface }]}>Comments</Text>
          {!!commentError && <Text accessibilityRole="alert" style={{ color: appColors.onSurfaceVariant }}>{commentError}</Text>}
          {commentsLoading && <ActivityIndicator color={colors.primary} accessibilityLabel="Loading post comments" />}
          {!commentsLoading && !comments.length && !commentError && <Text style={{ color: appColors.onSurfaceVariant }}>No comments yet.</Text>}
          {comments.map(comment => <View key={comment.id} style={[styles.comment, { backgroundColor: appColors.surfaceLow, marginLeft: comment.parent_comment_id ? spacing.lg : 0 }]}>
            <Text style={[styles.author, { color: appColors.onSurface }]}>{comment.user_name}</Text>
            <Text style={{ color: appColors.onSurfaceVariant }}>{new Date(comment.created_at).toLocaleString()}</Text>
            <Text style={[styles.body, { color: appColors.onSurface }]}>{comment.body}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Reply to ${comment.user_name}`} onPress={() => setReplyTo(comment)}><Text style={{ color: colors.primary }}>Reply</Text></Pressable>
          </View>)}
          {replyTo && <View style={styles.authorRow}>
            <Text style={{ color: appColors.onSurfaceVariant }}>Replying to {replyTo.user_name}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" onPress={() => setReplyTo(null)}><X size={20} color={appColors.onSurfaceVariant} /></Pressable>
          </View>}
          <TextInput accessibilityLabel="Post comment" value={body} onChangeText={setBody} maxLength={500} multiline
            placeholder="Write a comment" placeholderTextColor={appColors.onSurfaceVariant}
            style={[styles.input, { color: appColors.onSurface, borderColor: appColors.outlineVariant }]} />
          <Pressable accessibilityRole="button" accessibilityLabel="Send post comment" disabled={sending || !body.trim()} onPress={() => void sendComment()} style={styles.stats}>
            {sending ? <ActivityIndicator color={colors.primary} /> : <Send size={20} color={colors.primary} />}
            <Text style={{ color: colors.primary }}>Send comment</Text>
          </Pressable>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderBottomWidth: 1 },
  iconButton: { padding: spacing.sm },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  heading: { fontSize: fontSize.xl, fontWeight: '800' },
  author: { fontSize: fontSize.sm, fontWeight: '800' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  center: { alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: fontSize.md, lineHeight: 23 },
  photo: { width: '100%', height: 300 },
  video: { height: 220, borderRadius: radius.lg, gap: spacing.sm },
  stats: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  comment: { padding: spacing.md, borderRadius: radius.lg, gap: spacing.sm },
  input: { minHeight: 80, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, textAlignVertical: 'top' },
});
