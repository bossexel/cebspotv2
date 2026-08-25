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

Install one new native build after adding `expo-updates`:

```bash
eas build --platform android --profile preview
```

After that build is installed, JavaScript and asset changes that do not add or change native dependencies can be sent to it without rebuilding:

```bash
eas update --channel preview --environment preview --message "Describe the update"
```

Production updates use `--channel production --environment production`. The update runtime follows the Expo app version, so increment `expo.version` before building whenever native dependencies or native configuration change.
"# cebspotv2" 
