# CebSpot 1.0.3 tester release

Published to Expo's Android preview channel on September 14, 2026 (Asia/Manila).

## Distribution

- Version/runtime: `1.0.3`; Android version code: `3`.
- Update group: `03c38879-1422-4075-82a3-686e142d9978`.
- Android update: `01a09c70-eb24-73d8-ba7d-ac7a3e86f02d`.
- [Published update](https://expo.dev/accounts/exl123/projects/cebspot/updates/03c38879-1422-4075-82a3-686e142d9978).
- Update-prompt patch group: `4501e564-f5be-42fc-b6c9-0eef74469234`.
- [Update-prompt patch](https://expo.dev/accounts/exl123/projects/cebspot/updates/4501e564-f5be-42fc-b6c9-0eef74469234).
- Dedicated role-routing patch group: `24aeecee-fd2f-4603-b593-098b78b22ca3`.
- [Dedicated role-routing patch](https://expo.dev/accounts/exl123/projects/cebspot/updates/24aeecee-fd2f-4603-b593-098b78b22ca3).
- [APK build](https://expo.dev/accounts/exl123/projects/cebspot/builds/3c22c7f3-387d-4ffe-b2ef-a786b01ef9ff).
- APK status: `FINISHED` (signed preview build).
- [Download Android APK](https://expo.dev/artifacts/eas/gNYw1Np-mpBl0BpfQ4yOpBJpxrMhRrDreII1zgaMtz0.apk).

Install the new preview APK over the existing CebSpot installation. Older runtimes will not receive this OTA update. The new native build includes the document picker and screen orientation modules. Future compatible preview patches use the in-app update prompt.

## Included changes

Current workspace changes include dedicated owner invitations/password setup, registered-business-email rejection, owner spot assignment, document uploads, activity sorting, map/carousel improvements, similar spots, owner gallery, table selection and reservation/payment UI updates.

This release publishes the Android client. It does not publish the standalone owner website or apply SQL files automatically.

## Verification

- TypeScript: passed.
- Backend/owner/reservation regression checks: 72 passed.
- Map browser interaction checks: 11 passed.
- Generated map source: up to date.
- Android Metro/Hermes export: passed (3,380 modules).
- Expo device update endpoint: HTTP 200, matching Android update ID and runtime `1.0.3`, 64 assets plus the launch bundle.
- Preview Supabase Auth, spots, submissions, Storage: reachable.
- Preview image anonymization health: passed on retry after initial cold-start timeout.
- Deployed owner-email RPC: rejects invalid input.
- Deployed provisioning function: rejects unauthenticated calls with HTTP 401; no invitations sent by this check.
- Preview environment defaults to GCash disabled, QRPh enabled; CARTO configured.

Automated checks do not replace physical-device testing. After installation, verify sign-in, duplicate-email rejection, owner invitation/password setup, document upload, map dragging/carousel taps, booking and payment confirmation. Actual payment completion was not performed as part of this release.
