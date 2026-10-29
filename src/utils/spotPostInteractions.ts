import type { LocalUpdate } from '../types';

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
