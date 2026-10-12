# CebSpot Android Quickstart

## 1. Install

```bash
npm install
```

## 2. Configure Supabase

Create `.env.local`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Run `supabase-schema.sql` in the Supabase SQL editor.

If these variables are missing, the app still opens in local demo mode with sample data.

## 3. Run

```bash
npm.cmd start
```

Open the QR code in Expo Go on Android or press `a` for an Android emulator. Use `npm.cmd run android` to launch Android directly, or `npm.cmd run start:usb` for USB. Customers and owners use Android. The admin console stays hosted on Render.

Customer/owner web and iOS are unsupported. The browser owner portal and Vercel configuration were removed. `npm.cmd run build:android` exports Android; `npm.cmd run test:platform` checks platform isolation. Render keeps `npm ci && npm run build` and publishes the separate `admin-app` web export to `dist`. Use `npm.cmd run dev:admin` for local admin browser testing.

The `npm.cmd start` script skips Expo's online dependency validation so the local server can boot even when Expo's metadata request fails.

If Expo Go cannot download the update after scanning, close the old Expo terminal, restart with `npm.cmd start`, and allow Node.js through Windows Firewall when prompted.

If Windows will not let you add a firewall rule, run PowerShell as Administrator and add the rule there. If you do not have admin access, use the tunnel fallback:

```bash
npm.cmd run start:tunnel
```

## App Flow

- `app/index.tsx` - Explore
- `app/spot/[id].tsx` - Spot details
- `app/reservation/[id].tsx` - Reservation
- `app/checkout/[id].tsx` - Demo checkout
- `app/confirmed/[id].tsx` - QR confirmation
- `app/circle.tsx`, `app/activity.tsx`, `app/profile.tsx` - Bottom navigation tabs
- `app/submit-spot.tsx` - Spot submission
- `app/admin.tsx` - Admin console inside the Android app
