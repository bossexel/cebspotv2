# CebSpot Expo Quickstart

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
npx expo start --clear
```

Open the QR code in Expo Go or press `a` for an Android emulator.

## App Flow

- `app/index.tsx` - Explore
- `app/spot/[id].tsx` - Spot details
- `app/reservation/[id].tsx` - Reservation
- `app/checkout/[id].tsx` - Demo checkout
- `app/confirmed/[id].tsx` - QR confirmation
- `app/circle.tsx`, `app/activity.tsx`, `app/profile.tsx` - Bottom navigation tabs
- `app/submit-spot.tsx` - Spot submission
