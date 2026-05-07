# Expo Migration Complete

CebSpot is now structured as an Expo React Native app with Expo Router and Supabase.

## Current Structure

```text
app/
  _layout.tsx
  index.tsx
  circle.tsx
  activity.tsx
  profile.tsx
  submit-spot.tsx
  spot/[id].tsx
  reservation/[id].tsx
  checkout/[id].tsx
  confirmed/[id].tsx

src/
  components/
  constants/
  hooks/
  lib/supabase.ts
  services/
  types/
```

## Run

```bash
npm install
npx expo start --clear
```

## Environment

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Google Sign-In is intentionally left as a TODO until native OAuth client IDs are available. Email/password auth is implemented first.
