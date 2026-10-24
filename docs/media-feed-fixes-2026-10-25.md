# Media uploads and Activity changes — 25 October 2026

The patch compresses selected media before sending it, bounds stored outputs, replaces rectangular face blurs with oval head masks, and pages the Activity feed while rendering only a small window of cards. Existing uploaded files are not rewritten or deleted.

## Upload policy

| Media | Dimensions | Output limit | Processing |
| --- | --- | --- | --- |
| Public photos (spots, reviews, owner galleries) | Longest edge 1280 px | 320 KiB | JPEG; faces processed before Storage upload |
| Temporary photo sent to face service | Longest edge 1280 px | 512 KiB | JPEG at higher quality to retain detection detail |
| Avatars | Longest edge 512 px | 120 KiB | JPEG; no face blurring |
| Payment/verification images | Longest edge 1600 px | 700 KiB | JPEG, preserving document legibility; no face blurring |
| Videos | Longest edge 640 px | 3 MiB; up to 15 seconds | Native MP4 encoding at 850 kbps video bitrate |

Quality values alone do not guarantee file size. The client checks actual output bytes, retries photo compression within bounds, and stops if it cannot meet the limit. Temporary files are cleaned up on success/failure. PDFs retain their existing 5 MiB document policy. Videos remain outside the photo face-blurring service.

Public Storage buckets additionally enforce 3 MiB (`spot-images`) and 256 KiB (`profile-photos`) ceilings. Smaller existing bucket limits are preserved. These bucket ceilings complement the stricter per-type client limits.

Video compression uses `react-native-compressor` 1.16.0 with lazy loading. Expo Go and older installed binaries can still process photos; video uploads explain that an app update is required. The app runtime version is now 1.0.4 to prevent delivering the native dependency as an incompatible OTA update. See the [package's Expo installation instructions](https://github.com/numandev1/react-native-compressor#managed-expo).

## Session error findings

The original code sent the locally stored token without proactively refreshing it and treated HTTP 401 as a permanent upload failure. The verifier also mapped both authentication and profile-lookup 401/403 responses to the same “Session validation unavailable or expired” message. A rejected API key could therefore look exactly like an expired customer login.

The client now refreshes tokens close to expiry and retries a rejected authenticated operation once, sharing concurrent refreshes. Native foreground/background transitions control Supabase auto-refresh. Rejected authentication still blocks uploads; original photos never become the fallback. See [Supabase's native auto-refresh guidance](https://supabase.com/docs/reference/javascript/auth-startautorefresh).

The verifier accepts a server publishable key or legacy anon key, checks credentials at startup, diagnoses a mismatched token issuer without trusting it for authentication, and differentiates expired sessions (401), unavailable accounts (403), and configuration/upstream failures (503). It logs the failing endpoint/status/error code without logging tokens. API response bodies, SQL errors, internal URLs and HTTP codes are no longer displayed in the spot/review/activity UI or submission notifications.

The local face-service environment lacked Supabase credentials; its ignored `.env` was configured to match the app's project. Read-only checks returned HTTP 200 from the deployed face-service health endpoint and the app project's Auth settings endpoint. Those checks do **not** prove the deployed face service uses the same credentials. Without the failed request's Render logs/token, the exact production upstream failure remains unconfirmed; do not describe it as conclusively reproduced.

## Detection and feed

Detection has a confidence floor of 0.70, rejects malformed landmark geometry, and keeps short/full-range detectors and bounded tiling for different face sizes. Blurring uses a strongly smoothed oval, extended above the face to cover the head, with an inward feather. Pixels outside the mask are untouched before JPEG encoding. This reduces broad square blurs and low-confidence texture detections; it cannot guarantee zero false detections or missed faces.

Activity uses a memoized card and `FlatList` with three initial cards and a five-viewport render window. The database returns 12 posts plus one lookahead row, using rank/time/ID cursors with a snapshot boundary. Newest, Popular, and Nearest sort across the database, not only the currently loaded posts. Full media arrays are fetched when opening a post. RLS remains active through a security-invoker RPC. Live events are batched and patch loaded rows; newly inserted posts show a refresh prompt rather than moving the scroll position or re-fetching the whole feed.

## Release sequence

1. Apply `20261025000100_activity_feed_pagination.sql` and `20261025000200_public_media_size_limits.sql` to the intended Supabase project. The new Activity screen requires the RPC.
2. Redeploy `face-blur-service` with the updated `render.yaml`. Confirm `SUPABASE_URL` matches the app and either `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY` is valid for that project. Never put a service-role key in the app. The service now fails startup if the credentials cannot be checked.
3. Build/install Android 1.0.4 with the compressor plugin. Run the existing preview preflight and use `eas build --platform android --profile preview`; release after device acceptance. JavaScript export success is not a native compilation or device-performance result.
4. Test a login left idle/backgrounded, a portrait, group/profile photos, food and facade photos, a 15-second video, network interruption, and a long Activity scroll. Check that feed refresh/sort changes discard stale page responses and that upload failures preserve the submission draft.

No production migration, deployment, or app-store publication was performed by this patch. Existing oversized media requires a separately planned migration if storage must also be reclaimed.

## Validation

- Full JS suite: 318 passed, 5 existing skips, zero failures (before the final bucket-limit migration).
- TypeScript check, Android JavaScript export and admin web export passed. Expo prebuild configuration resolves Android 1.0.4 with the compressor plugin.
- The final database checks replay both new migrations and verify upgrade compatibility; bucket limits are idempotent and preserve smaller existing limits.
- Final focused checks: 16 database/media tests passed; 15 client/upload/activity tests passed. The final TypeScript check passed after the last changes.
- Focused upload/pagination tests exercise concurrent refresh, single retry, byte ceilings, video duration, cleanup, cursor ties, sorting and RLS.
- Python: 16 service security tests and 6 new quality/auth tests passed.
- Actual BlazeFace smoke check: scikit-image's coffee sample had zero detections (466,706 → 35,236 bytes); astronaut sample had one detection (791,555 → 31,998 bytes). Outputs were visually inspected. These two samples are not a detector-accuracy benchmark.
- Sample source: [scikit-image v0.19.3 data](https://github.com/scikit-image/scikit-image/tree/v0.19.3/skimage/data); samples stayed in the OS temporary directory.
- No Android device was connected, so scrolling FPS and native video encoding were not measured on hardware.
