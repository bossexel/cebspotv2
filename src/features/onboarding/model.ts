export type OnboardingStatus = 'not_started' | 'completed' | 'skipped';
export type GuideStep = { target: string; alsoTargets?: string[]; title: string; body: string; optional?: boolean };
export type GuidePhase = { stage: 'intro' | 'tour' | 'welcome'; index: number };
export type Rect = { x: number; y: number; width: number; height: number };

export function guideTitleFontSize(width: number) {
  return Number.isFinite(width) ? Math.max(28, Math.min(42, width * 0.115)) : 28;
}

export const introduction = [
  { title: 'Discover Cebu', body: 'Find interesting places around Cebu. Your next local favorite starts here.' },
  { title: 'Explore Local Favorites', body: 'Search the map, browse nearby spot cards, and open a place to see its details and community reviews.' },
  { title: 'Share With the Community', body: 'Share a spot for review, join your Circle, and explore local updates in Activity. Let’s take a quick look around.' },
];

export const homeSteps: GuideStep[] = [
  { target: 'discover', title: 'Discover spots', body: 'Explore Cebu on the map. Tap a map pin to select a nearby spot, or swipe through the spot cards below.' },
  { target: 'search', title: 'Search and filter', body: 'Search by name, address, or category. The filter button narrows results by category, minimum rating, and distance. Distance uses your location when available, or a central Cebu reference point.' },
  { target: 'spot', title: 'Explore a spot', body: 'Tap a card or Go to Spot to open its details, photos, and reviews. On that page, Spot guide offers a short walkthrough of the real place you selected.', optional: true },
  { target: 'spot-card-bookmark', title: 'Save a favorite', body: 'Tap the bookmark on a spot card to save it. Find your bookmarks in Profile → Saved Spots. Saved spots stay with this account on this device.', optional: true },
  { target: 'bottom-nav-share', title: 'Share a spot', body: 'While signed in, use Share to add a place, its location, and photos or video. Submissions are reviewed before becoming public. You can save a draft and return later.' },
  { target: 'circle', alsoTargets: ['activity'], title: 'Explore together', body: 'Circle lets you create or join a group with an invite code and control location sharing. Activity contains local updates, votes, comments, and your alerts.' },
  { target: 'bottom-nav-profile', title: 'Make yourself at home', body: 'Profile holds Saved Spots, rewards, and Settings, including your theme. Return to App Guide here whenever you want to replay this walkthrough.' },
];

export const detailSteps: GuideStep[] = [
  { target: 'detail-title', title: 'Know the place', body: 'This is the spot you selected. Check its name and address, and swipe the photos to take a closer look.' },
  { target: 'detail-overview', title: 'Read the overview', body: 'Learn about the place before visiting. Information varies by spot; review the details shown on this page.' },
  { target: 'detail-reviews', title: 'Hear from the community', body: 'Read community reviews here. You can add a review or join a conversation using the available controls. This guide does not post anything.' },
];

export function parseStatus(raw: string | null): OnboardingStatus {
  return raw === 'completed' || raw === 'skipped' ? raw : 'not_started';
}

export function onboardingKey(accountId: string) {
  return `cebspot_onboarding:v1:${accountId}`;
}

export function canOfferGuide(ready: boolean, signedIn: boolean, accountId: string | undefined, profileId: string | undefined, role: string | null) {
  return ready && signedIn && Boolean(accountId) && accountId === profileId && role === 'user';
}

export function shouldStartHomeGuide(input: {
  eligible: boolean; account?: string; path: string; homeReady: boolean; active: boolean;
  deepLink: boolean; requested: boolean; storedAccount?: string; status?: OnboardingStatus | null; offered: boolean;
}) {
  if (!input.eligible || !input.account || input.path !== '/' || !input.homeReady || input.active || input.deepLink) return false;
  return input.requested || (input.storedAccount === input.account && input.status === 'not_started' && !input.offered);
}

export function sessionIsActive(session: { account: string; path: string } | null, eligible: boolean, account: string | undefined, path: string) {
  return Boolean(session && eligible && session.account === account && session.path === path);
}

export function advanceGuide(phase: GuidePhase, direction: 1 | -1, count: number): GuidePhase {
  if (phase.stage === 'welcome') return direction === -1 ? { stage: 'tour', index: Math.max(0, count - 1) } : phase;
  const last = phase.stage === 'intro' ? introduction.length - 1 : count - 1;
  if (direction === -1) return { ...phase, index: Math.max(0, phase.index - 1) };
  if (phase.index < last) return { ...phase, index: phase.index + 1 };
  return { stage: phase.stage === 'intro' ? 'tour' : 'welcome', index: 0 };
}

// Reject clipped/offscreen targets instead of pointing at an unrelated position.
export function visibleRect(rect: Rect, width: number, height: number): Rect | null {
  if (![rect.x, rect.y, rect.width, rect.height, width, height].every(Number.isFinite)) return null;
  if (rect.width < 2 || rect.height < 2) return null;
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const right = Math.min(width, rect.x + rect.width);
  const bottom = Math.min(height, rect.y + rect.height);
  if (right - x < Math.min(24, rect.width) || bottom - y < Math.min(24, rect.height)) return null;
  return { x, y, width: right - x, height: bottom - y };
}

// Both native views are measured in the same window. Translate the target into
// the overlay root's local coordinates before clipping or drawing its outline.
export function windowRectToOverlay(target: Rect, overlayOrigin: Pick<Rect, 'x' | 'y'>): Rect {
  return { x: target.x - overlayOrigin.x, y: target.y - overlayOrigin.y, width: target.width, height: target.height };
}

export function tooltipPlacement(rect: Rect | null, width: number, height: number, topInset: number, bottomInset: number) {
  const top = topInset + 12;
  const bottom = height - bottomInset - 12;
  if (!rect) return { top, maxHeight: Math.max(80, bottom - top), left: Math.max(12, (width - 400) / 2) };
  const above = rect.y - 12 - top;
  const below = bottom - (rect.y + rect.height + 12);
  const useBelow = below >= above;
  // Small landscape windows use a scrollable sheet; the spotlight remains accurate.
  if (Math.max(above, below) < 260) return { top, maxHeight: Math.max(80, bottom - top), left: Math.max(12, (width - 400) / 2) };
  return { top: useBelow ? rect.y + rect.height + 12 : top, maxHeight: useBelow ? below : above, left: Math.max(12, (width - 400) / 2) };
}
