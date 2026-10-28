# Independent community posts and map listings

The workflow migration is `supabase/migrations/20261027000100_independent_spot_posts.sql`. It was applied to the approved CebSpot hosted project on October 28, 2026 with the missing Circle controls and focused identity prerequisites. See [the user-testing release record](deployment-2026-10-28.md). The older standalone workflow SQL is a historical baseline and must not be rerun after this migration.

`spots` identifies confirmed places. `spot_submissions` retains each author's original caption and media, its own moderation state and reactions, and an optional `spot_id`. Each new submission creates its own `local_updates` row in the same database transaction. Its post ID and comment thread remain stable when an admin links or approves it. Reviews and ratings continue to use `reviews`; community posting never writes there.

Posting suggests nearby existing names and places, asks the author to confirm the place, and supports an explicit different-place choice. Linked posts need no new category or reservation details. Activity defaults to newest first; the post title opens the linked spot, while media and Comments open that post's own conversation. Spot details omit the extra posting button; their Similar Posts cards open each independent post directly.

The bottom of spot details shows **Similar Posts**, followed by **Similar Places**. Similar Posts hosts independent community posts linked to this exact map listing, including duplicate submissions after an admin uses “Link to existing spot”. Each card preserves its author's caption, media preview, timestamp, reaction count and comment count. Opening it goes directly to a dedicated post page with that author's full gallery and original comment thread, including older posts outside the current Activity page. This does not insert the older post into the newest-first feed. Reviews stay in Community Reviews; nearby or related businesses stay in Similar Places.

Similar Posts loads six posts per page using the listing's explicit `spot_id`, with timestamp and ID cursors. PostgreSQL timestamp precision is retained. It loads when returning to spot details and offers Show more when another page is available. Manual Refresh and Retry posts controls are omitted. An unconfirmed lookalike is not attached by name or distance; the author or admin must confirm the place first. This section uses the existing independent-post migration and needs no additional database migration.

Admins expand a pending submission to search existing listings, link it, or confirm it is a distinct place. Linking does not approve the submission. Approval of a linked submission reuses its listing. Unlinked approval checks for possible existing places and requires an explicit decision before making another listing. Approvals are serialized to prevent concurrent duplicate creation. Bulk popularity promotion now directs admins to individual place review.

Existing community posts were publicly visible while a place was pending. That behavior is retained; attaching an approved place does not change a future post's pending moderation state. Rejected submission posts are excluded from public Activity. Existing review reporting remains separate and unchanged.

The migration preserves existing post rows and their interactions verbatim. Where the old grouping suppressed an independent post, it restores a separate post from that author's submission and original timestamp. It does not reassign historical votes/comments or guess listing relationships. `spot_post_relationship_audit` stores snapshots and flags missing posts, mismatched authors, mixed media, and approved submissions without confirmed listing links. The admin Spots section exposes this queue, including linking for historical approved submissions. Mixed historical posts keep their original media pending human review; linking alone does not resolve an authorship flag.

The client checks the workflow version before uploading so it cannot invoke the old grouping behavior against an unprepared database. New posting therefore requires this migration before release. Existing clients' publisher/media RPCs are replaced with compatibility functions that read only the requested post; they never group neighbours or cast automatic votes.

Local validation:

- `npm run typecheck`
- `node --test tests/remediation/independent-spot-posts.test.cjs tests/remediation/feed-pagination.test.cjs tests/backend/activity-spot-vote.test.cjs tests/refactoring/independent-spot-posts.test.cjs`
- `npx expo export --platform android --output-dir .codex-tmp/independent-spot-posts-export`

The integration scenarios use an isolated PostgreSQL instance on loopback with Auth/Storage contract fixtures. They do not call a remote database or validate a live Expo device session.
