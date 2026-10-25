# In-app updates — 25 October 2026

Published to the existing **preview** channel and branch, with the **preview** EAS environment. Local dotenv loading was disabled so both exports used the hosted public configuration.

| Installed runtime | Update group | Source | Behavior |
| --- | --- | --- | --- |
| 1.0.3 | `187db439-2c07-42d6-82a5-6dded18544d2` | `5643743b80a77135dbb1e61969d69866551e3e53` | Compatible update adds a link to install Android 1.0.4. |
| 1.0.4 | `d604a0b8-5fec-48c9-842d-86f14b3ec55f` | `78814b5fac9f0bf1b7646f5300a46b73974bc9aa` | Current media/feed release with the normal OTA update flow. |

Users on 1.0.3 reopen CebSpot and tap **Update** in the existing prompt. After the app restarts, **Download update** opens the signed 1.0.4 APK. They open the download and approve Android installation while keeping the existing app installed. The new native video encoder requires that APK installation; an OTA cannot add it to an older binary. Users already on 1.0.4 use **Update** normally.

The 1.0.3 release was built in an isolated worktree on its previously published commit, `2bd6aac823bf4ba776723331699bf1d562776212`. Only `AppUpdatePrompt.tsx` and its tests changed. Native dependencies, lockfile, app version, plugins and runtime configuration were preserved. The legacy bundle does not import the new compressor.

Validation:

- Four update-flow tests passed in both checkouts: legacy installer link, normal OTA download/reload, friendly retry on link failure, and no downgrade prompt for newer runtimes.
- Current TypeScript check and both Android/Hermes exports passed.
- Actual EAS manifest requests using each installed runtime and the preview channel returned the exact published update IDs.
- Both launch bundles downloaded successfully using the per-asset request headers supplied by the Expo Updates protocol. Their SHA-256 hashes matched the manifests, and the expected installer link was present.
- No Android device was attached, so tapping through the phone installer was not physically tested. The previously built APK's signature/package/version were verified in the [deployment record](deployment-2026-10-25.md).

The separate older reservation/account/private-upload backend rollout remains unchanged by these EAS publications.
