# CebSpot

## A Local Discovery Platform for Cebu

CebSpot helps users discover places in Cebu, share local experiences, and reserve venue tables through an Android application. Venue owners manage their listings and reservations in the app, while administrators review submissions and oversee platform activity through a web console hosted on Render.

The project brings place discovery, community posts, and venue management into one platform for customers, business owners, and administrators.

## Key Features

### Customers and Community

- **Place discovery:** Explore places using search, categories, distance-based results, and an interactive map.
- **Saved places:** Bookmark spots for later viewing.
- **Community content:** Submit places, publish spot posts and local updates, and interact through reviews, likes, and comments.
- **Reservations:** View table choices, provide contact details, and track bookings and payment status. Payment options depend on venue settings and release configuration.
- **Accounts and circles:** Manage profile details, account recovery, and circle privacy and location-sharing settings.

### Spot Owners

- **Owner access:** Apply for owner access and submit business verification documents for review.
- **Spot profiles:** Manage spot details, branding, and gallery images.
- **Table settings:** Configure table choices, availability, and reservation settings.
- **Booking management:** Review reservations, manual payment proofs, attendance, and table occupancy.
- **Records and analytics:** Inspect dashboard analytics, search records, and export CSV reports.

### Administrators

- **Review workflows:** Review spot submissions, edit suggestions, and owner access requests.
- **Content oversight:** Manage listings, community content, and reports through the admin dashboard.
- **Platform monitoring:** Inspect dashboard analytics and system health information.

## Technology Stack

| Area | Technologies |
| --- | --- |
| Android application | Expo SDK 52, React Native 0.76, React 18, TypeScript |
| Navigation and UI | Expo Router, React Native components, Lucide icons |
| Maps and location | Leaflet map engine, Expo Location |
| Backend and storage | Supabase PostgreSQL, Auth, Storage, Realtime, and Edge Functions |
| Payments | PayMongo integration and manual GCash proof workflows |
| Image privacy service | Python, FastAPI, MediaPipe face detection, OpenCV |
| Hosting and releases | Render for the admin console and face service; EAS Build and EAS Update for Android |


## Requirements

- Node.js and npm; EAS build profiles use Node.js 22.18.0.
- An Android device or emulator. Expo Go supports basic development; native features such as video compression require a compatible installed build.
- A configured Supabase project and its public client credentials.
- A face-anonymization service endpoint for image upload workflows; see the [service setup guide](face-blur-service/README.md).
- An Expo account and EAS CLI access when creating native builds or publishing updates.

## Development Guides

See [code structure and regression checks](docs/code-structure.md) for dashboard modules, shared upload utilities, and local validation commands.

See [Oxlint and Vitest commands](docs/lint-and-unit-tests.md) for static linting and isolated business-logic unit tests. Existing `npm test` and `npm run lint` commands are preserved.

See [media/feed changes and rollout](docs/media-feed-fixes-2026-10-25.md) for compression limits, the Activity pagination migrations, and the Android 1.0.4 native rebuild required for video compression.

See [independent spot posts](docs/independent-spot-posts.md) for the separate community-post/listing workflow and historical relationship review, and [the latest user-testing release](docs/deployment-2026-10-28.md) for rollout status and email-testing limits.

## Run

```bash
npm install
npm.cmd start
```

Open the project in Expo Go on Android, or press `a` to launch an Android emulator. Use `npm.cmd run android` to launch Android directly, or `npm.cmd run start:usb` with a USB-connected Android device. The Expo server uses port `8081` to deliver the Android app.

Customer/owner browser screens and the standalone browser owner portal are removed. iOS is unsupported. `npm run build:android` exports Android. Render keeps `npm ci && npm run build`, its `dist` output, and `/admin` URL; this web build uses the separate `admin-app` route root. `npm run dev:admin` previews admin on port `8084`. See [platform scope and LA-08/LA-09](docs/android-only.md).

The `npm.cmd start` script skips Expo's online dependency validation so the local server can boot even when Expo's metadata request fails.

If Expo Go cannot download the update after scanning, close the old Expo terminal, restart with `npm.cmd start`, and allow Node.js through Windows Firewall when prompted.

If Windows will not let you add a firewall rule, run PowerShell as Administrator and add the rule there. If you do not have admin access, use the tunnel fallback:

```bash
npm.cmd run start:tunnel
```

## Supabase

Create `.env.local` with:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
EXPO_PUBLIC_FACE_BLUR_API_URL=https://your-face-service.example.com
```

The app also supports `EXPO_PUBLIC_SUPABASE_ANON_KEY` as a legacy fallback. See [.env.example](.env.example) for map provider settings, payment flags, and separately documented server-side configuration.

Use only public client values in `EXPO_PUBLIC_*` variables. Keep service-role keys, payment secrets, webhook secrets, and worker tokens in their server environments. Do not commit populated environment files or credentials.

Database setup uses the timestamped migration chain described in [Supabase migrations](supabase/MIGRATIONS.md). Root SQL files are archived baselines and must not overwrite the current schema.

## Development Checks

| Check | Command |
| --- | --- |
| TypeScript validation | `npm run typecheck` |
| Static linting | `npm run lint:ox` |
| Isolated unit tests | `npm run test:unit` |
| Backend, remediation, platform, and refactoring tests | `npm test` |
| Map browser tests | `npm run test:map` |

Some database tests require additional configuration and otherwise skip. Map browser tests use installed Chrome by default; `MAP_TEST_CHANNEL=msedge` selects Edge.

## Project Structure

```text
cebspotv3/
|-- app/                    # Android user and owner routes
|-- admin-app/              # Admin web routes
|-- src/
|   |-- components/         # Shared UI controls and map components
|   |-- features/           # Discovery, dashboards, and feature logic
|   |-- hooks/              # Authentication, location, and shared state
|   |-- services/           # Backend access, uploads, and integrations
|   |-- utils/              # Validation, calculations, and helpers
|   |-- constants/          # Shared settings and display content
|   |-- lib/                # Shared client configuration
|   `-- types/              # Shared data contracts
|-- supabase/               # Database migrations and Edge Functions
|-- face-blur-service/      # Python image anonymization service
|-- scripts/                # Build, release, and maintenance tools
|-- tests/                  # Automated checks and walkthroughs
|-- docs/                   # Architecture, setup, and rollout notes
|-- assets/                 # App images, fonts, and branding
|-- public/                 # Static web assets
|-- eas.json                # Android build profiles and update channels
|-- render.yaml             # Admin web and face-service hosting
`-- README.md               # Project overview and setup
```

Node tooling and many tests use `.cjs` files, which run as CommonJS JavaScript with `require()` and `module.exports`.

## EAS Preview And Updates

Preview and production builds use separate EAS Update channels. Before spending time on a build, verify that the selected EAS environment can reach Supabase Cloud, Supabase Storage, and the public face-anonymization service:

```bash
eas env:exec preview "npm run preflight:preview"
eas env:exec production "npm run preflight:production"
```

The face service must be deployed at a public HTTPS address. Add its URL to both EAS environments after deployment:

```bash
eas env:create --environment preview --name EXPO_PUBLIC_FACE_BLUR_API_URL --value https://your-service.example.com --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_FACE_BLUR_API_URL --value https://your-service.example.com --visibility plaintext
```

Create a compatible Android preview build:

```bash
eas build --platform android --profile preview
```

Install the resulting APK on the device. `npm run build:android` exports Android assets locally; it does not create an installable APK.

After validating the change, JavaScript and asset changes that do not add or change native dependencies can be sent to compatible installed builds without rebuilding:

```bash
eas update --platform android --channel preview --environment preview --message "Describe the update"
```

The `preview`, `beta`, and `live` build profiles currently use the `preview` update channel. The `production` profile uses `production`. Confirm the installed app's channel and runtime before choosing the target. See [eas.json](eas.json).

Production updates use `--channel production --environment production`. The update runtime follows the Expo app version, so increment `expo.version` before building whenever native dependencies or native configuration change. These changes require a compatible new APK.

## Privacy and Access Controls

- **Role-based access:** Customer, owner, and administrator workflows use authentication and database access policies.
- **Image processing:** The face service detects and blurs faces in supported image upload workflows before processed images are stored. Face detection does not identify people.
- **Private documents:** Verification documents and payment proofs have separate upload and access workflows from public spot media.
- **Account controls:** Users can manage profile details, circle privacy settings, and account deletion through dedicated flows.
- **Credential separation:** Public app configuration and server-only credentials are configured separately.

See the [face-service guide](face-blur-service/README.md) and [security specification](security_spec.md) for implementation details and requirements.

- This project is developed for academic and civic innovation purposes.
- CebSpot - Find your Spot at the Heart of Cebu
