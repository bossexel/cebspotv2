# Map performance and maintenance

The discovery map and the maps used for spot details, location picking, circles and admin evidence share `src/components/TileMap.tsx`.

## Findings

The former renderer used React Native images and a JavaScript `PanResponder`. It moved a fixed tile grid until touch release, so longer drags could expose unloaded areas. It had no inertia, rebuilt tile positions at release, and repeatedly rasterized a layer containing animated markers. Selection used a 150 ms shrink, a download wait of up to 180 ms, an instantaneous center replacement, and a 260 ms reveal. The carousel only changed selection at momentum end and repeated selection events restarted this sequence.

The installed WebView, gestures, Reanimated and React Native Maps versions match the Expo 52 compatibility manifest. React Native Maps is installed but was not used by these screens, so changing its API key would not fix the renderer.

A live tile probe during this change returned HTTP 200 from the configured CARTO service and the OpenStreetMap fallback. The configured MapTiler service returned HTTP 403. CARTO remains the first choice when configured. A MapTiler key must be corrected in the provider account before relying on it; keys are never printed by the health command. A one-tile probe is not a sustained service-availability measurement.

## Implementation

Leaflet 1.9.4 is pinned in `package.json` and bundled with its license, CSS and our runtime. No map JavaScript or CSS comes from a CDN. The native surface uses the existing Expo-compatible WebView 13.12.5; web uses an iframe. No additional native SDK or Google Maps API key is required.

The document stays mounted as React props change. Its own rendering context handles drag/pinch, inertia, tile placement, camera easing and pin selection. React receives completed user viewport changes, taps and interaction boundaries. Android nested scrolling prevents parent scroll views from stealing gestures.

Only tiles in the current viewport are requested. Already viewed neighbors are retained, and normal browser/WebView HTTP caches honor provider cache headers. Tile updates during movement are throttled to 100 ms; intermediate integer zoom levels are not fetched during a flight. There is no destination prefetch or eager offscreen tile buffer. Existing tiles remain visible while replacement tiles load. Each failed tile may try one different provider; repeated failures expose a small retry action without blocking the map.

Nearby selections pan for 550 ms; farther selections use an 800 ms flight. Each new selection cancels the preceding camera motion; a touch interrupts it immediately. Pins reuse DOM nodes, animate their selected scale and lift, and show one short arrival halo. Reduced motion disables those effects. Carousel updates occur as the focused card changes, with duplicate selections and intermediate cards during a pin-triggered scroll ignored.

## Commands

- `npm run map:build`: regenerate `mapDocument.generated.ts` after editing `runtime.js` or `map.css`.
- `npm run map:check`: confirm the checked-in bundle matches its source and installed Leaflet version.
- `npm run map:health`: verify dependency compatibility and request one sample tile per configured provider. Reports status, latency and caching headers without keys. A failed configured provider produces a nonzero exit code even if the active provider works.
- `npm run test:map`: run browser regression tests. Uses installed Chrome by default; set `MAP_TEST_CHANNEL=msedge` to use Edge. All tile requests use intercepted fixtures, never public tile servers.
- `npm run typecheck`: check all TypeScript consumers.
- `node node_modules/expo/bin/cli export --platform web --platform android --max-workers 1`: verify both platform bundles on a machine with limited memory.

After changes to map sources, regenerate and commit the generated file along with the sources. It contains no environment configuration or API keys. A normal fresh install needs no CDN access to open the renderer.

Release testing should include long drags, diagonal flicks, pinches followed by one-finger movement, rapid card swipes, pin taps several cards away, picking a submission location, maps within a scrolling page, and a return to a recently viewed area on the target Android phones. Browser tests and successful exports do not establish a physical device frame rate. New areas still need network access for tiles.

## Validation of this change

All 11 browser map tests and the project TypeScript check passed. Production web and Android (Hermes) exports passed with one Metro worker. The exported Explore screen was also checked using a fixture session, intercepted API responses and simulated map tiles: iframe startup, pin-to-card selection across intermediate cards, and carousel-to-pin selection all passed without browser page errors. No production account or database was changed by these checks.

The carousel and bottom navigation were additionally checked at 360×640, 390×844 and 430×932 layouts, with simulated bottom safe-area insets of 0, 24 and 34 pixels. The measured card-to-raised-Share-button gap stayed at 9 pixels. Tests cover a horizontal swipe, immediate card tap, image/title/action-area taps, Favorite isolation, bottom-navigation taps, stable card height, absence of a card shadow and page errors. The map also defers camera updates while its retained screen has zero size, avoiding invalid-coordinate errors when a card opens during an active camera transition.

No Android device was attached, so these checks do not include a physical phone performance measurement. Local screenshots and export/test artifacts are under the ignored `.codex-tmp/map-review/` directory.

References: [Leaflet map and tile options](https://leafletjs.com/reference.html), [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/), [Expo 52 WebView documentation](https://docs.expo.dev/versions/v52.0.0/sdk/webview/).
