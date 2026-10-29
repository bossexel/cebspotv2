import type { LocalUpdate, SpotVoteType } from '../types';

// Older approvals relabelled submission posts as community. Their source_id
// still identifies the original submission, not the map listing or review.
// The voting RPC must validate that this source really is an eligible post.
export function getSpotPostSubmissionId(
  post: Pick<LocalUpdate, 'source_type' | 'source_id'>,
): string | null {
  if (post.source_type !== 'spot_submission' && post.source_type !== 'community') return null;
  return typeof post.source_id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(post.source_id)
    ? post.source_id : null;
}

export function getOptimisticSpotVote(currentVote: SpotVoteType | null): {
  vote: SpotVoteType | null;
  delta: number;
} {
  const nextVote: SpotVoteType | null = currentVote === 'up' ? null : 'up';
  const score = (vote: SpotVoteType | null) => vote === 'up' ? 1 : vote === 'down' ? -1 : 0;
  return { vote: nextVote, delta: score(nextVote) - score(currentVote) };
}

export function setSpotPostVote(
  votes: Record<string, SpotVoteType>,
  submissionId: string,
  vote: SpotVoteType | null,
): Record<string, SpotVoteType> {
  const nextVotes = { ...votes };
  if (vote) nextVotes[submissionId] = vote;
  else delete nextVotes[submissionId];
  return nextVotes;
}

export function adjustSpotPostCounts(
  posts: LocalUpdate[],
  submissionId: string,
  delta: number,
): LocalUpdate[] {
  return posts.map((post) => getSpotPostSubmissionId(post) === submissionId
    ? { ...post, spot_count: post.spot_count + delta }
    : post);
}

export function setSpotPostCount(
  posts: LocalUpdate[],
  submissionId: string,
  count: number,
): LocalUpdate[] {
  return posts.map((post) => getSpotPostSubmissionId(post) === submissionId
    ? { ...post, spot_count: count }
    : post);
}
