# CebSpot

Expo React Native mobile app for discovering Cebu spots, reserving venues, and sharing local activity.

## Run

```bash
npm install
npm.cmd start
```

The native app, user web app, and admin console run from the same Expo server on one port. Start one server on `8081`, then open the route you need:

- User app: `http://localhost:8081/`
- Admin console: `http://localhost:8081/admin`

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
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Then run `supabase-schema.sql` in Supabase.
"# cebspotv2" 
