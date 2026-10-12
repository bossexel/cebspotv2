# Android customers/owners and Render admin

Effective October 13, 2026 (Asia/Manila), customers and venue owners use CebSpot on Android only. The admin console remains on Render.

## Platform isolation

The default Expo configuration declares only `android` and routes from `app`. Native startup rejects other platforms. `npm run build:android` exports Android. Customer/owner browser launch scripts, the standalone browser owner portal, Vercel configuration, and old local web exports were removed.

Render retains its `cebspot-admin-web` static service, `npm ci && npm run build` build command, `dist` publish directory, root redirect to `/admin`, and SPA rewrite. `npm run build` selects the explicit `admin-web` target and separate `admin-app` route root. This tree contains admin sign-in, dashboard, password recovery, admin-only spot inspection, and an unsupported-page screen. It excludes customer discovery, signup, booking, checkout, profile, owner access, and owner dashboard routes. Removed routes direct customers and owners to Android.

`npm run dev:admin` previews the admin site on port `8084`. Metro rejects unsupported platform/target combinations. Web libraries and the iframe map remain dependencies of the admin site. Native notifications initialize only in the Android entry point. The Android WebView map, browser auth/payment handoffs, deep links, backend APIs, and face-processing service retain their integrations.

## LA-08 and LA-09

Both findings are **outside the Android v1 release scope, not fixed**. Removing
customer/owner distribution does not repair their historical browser behavior.
The retained admin site remains a separate supported deployment.

**LA-08:** Customer/owner web forms are removed from the supported scope. The retained admin site now uses visible browser alerts for validation, failures, and success, and real browser confirmations for actions such as logout. Android alerts continue to use React Native. Actual Render deployment and Android acceptance require retesting.

**LA-09:** Browser payment-proof/video/owner-document uploads no longer apply to supported customer/owner clients because those routes are removed. Admin viewing of verification documents remains available. Android media persistence and authorized-reviewer access still need device UAT.

Original browser evidence remains historical evidence. Older full-app web-export harnesses are unsupported; isolated map-document tests still apply to the Android WebView and admin iframe. Other launch-audit findings remain independent requirements.

## Verification and deployment

Run `npm run test:platform`, `npm run typecheck`, `npm run build:android -- --max-workers 1`, and `npm run build -- --max-workers 1`. A default explicit web export must fail; only the admin-target command may produce a web bundle. Validate admin login, recovery, report maps, logout confirmation, and removed customer/owner URLs against the exported admin site.

`npm run test:admin-web` exercises the actual exported admin artifact using synthetic failures and intercepted external requests. It verifies admin entry routes, rejection of customer/owner URLs, visible sign-in errors, and admin-only recovery. Local TypeScript, platform/backend regression checks, and both platform exports passed during this change; device and deployed testing remain separate.

These changes do not redeploy or disable the existing Render admin service. Deploy the updated source through the existing Render workflow to remove customer/owner routes from the hosted artifact. Restart previously running local Expo servers to load the new target settings. Local builds/tests do not imply Android participant acceptance or production deployment.

`public/payment-return.html` is a static handoff page on the retained admin
origin. It opens Android using a validated reservation ID and always requests a
fresh server status check. It exposes no customer/owner web application and
does not accept a successful redirect as proof of payment. Configure its HTTPS
URL only on the payment server as documented in
[payment verification](payment-release-verification.md).
