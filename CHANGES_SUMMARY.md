# CebSpot Migration Summary

Converted the Vite React web app into a true Expo React Native app.

## Changed

- Replaced Vite entrypoints with Expo Router: `app/_layout.tsx` plus root route files.
- Replaced React Router navigation with Expo Router `router.push`, `router.replace`, and `useLocalSearchParams`.
- Replaced Firebase/Firestore code with Supabase client and service modules.
- Replaced Leaflet maps with `react-native-maps`.
- Replaced browser geolocation with `expo-location`.
- Replaced `react-qr-code` with `react-native-qrcode-svg`.
- Replaced DOM elements with React Native primitives.
- Moved design tokens into `src/constants/colors.ts` and `src/constants/design.ts`.
- Added reusable native UI components for buttons, screen shell, bottom nav, chips, and spot cards.

## Backend

- `src/lib/supabase.ts` configures Supabase with AsyncStorage session persistence.
- `supabase-schema.sql` defines profiles, spots, reservations, activities, circles, and spot submissions.
- Reservations save `spot_name`, QR code, payment status, and per-booking fee totals.
- Spot submissions write to `spot_submissions` for approval.

## Verification

- `npm install` completed.
- `npm run typecheck` passes.
- Expo Metro starts on `http://localhost:8081`.
