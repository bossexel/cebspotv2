# Android preview publication — October 16, 2026

Publication requested and authorized for Android preview/test only. No update has been published by this attempt.

## Verified

- EAS project: CebSpot; preview channel exists and points to preview branch.
- Latest observed preview group: `51e683cc-1c9d-48d0-a5d4-40785df0db41`, Android runtime `1.0.3`, message `Return main tabs to Explore on Android back`.
- Current code TypeScript check passes.
- Focused refactoring/platform regression: 26 passed.
- Full current `npm test`: 278 passed, 0 failed, 5 skipped. Those skips do not establish database concurrency acceptance; native remediation concurrency tests are included and pass.
- Commands and sanitized output are retained under `tests/remediation/evidence/commands/publish-preflight-*-2026-10-16.json`.

## Publication gate

The read-only EAS preview configuration check found that its Supabase backend and face service match the existing application's `.env.local` targets. Explicit staging identity/reference settings are absent. The existing staging release validator therefore rejects the configuration. No endpoint, credential or secret value was recorded in this check.

The user has been asked whether this shared backend is test-only with disposable data, contains real/mixed data, or is unclassified. The previous prohibition on production deployment remains in force. Do not relabel the existing backend as isolated staging or disable the release guard just to publish. A preview channel name does not establish backend isolation.

Next step: establish the shared backend's actual classification. If it contains real or mixed data, configure a verified separate test project/service and deploy the matching migrations/Edge/face code there before publishing the client. If the user confirms disposable test-only data, review the target-bound preview exception and deployed backend compatibility explicitly, retain evidence, and publish only Android preview with public-only environment values. The update must include the new untracked dashboard/utility dependencies if those working-tree changes are included; do not discard or silently omit them.

Android runtime/native compatibility, actual backend migration/function compatibility, final configured export, artifact secret scan and post-publication update endpoint verification remain required. The current pass does not establish deployed feature acceptance or UAT readiness.
