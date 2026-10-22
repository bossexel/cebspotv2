# Supplied Privacy Policy recreation

The latest attachment explicitly requests the original CebSpot branding, date, developer details, and complete policy wording. The existing `/privacy` native route now displays that supplied reference policy. It is not relabeled as CebSpot content. The earlier CebSpot-specific draft remains unchanged in `src/constants/privacy.ts` for later reuse.

## Changed files

- `app/privacy.tsx`: eleven beige rounded policy cards, warm background, rounded back/header, calendar/date row, search, outline icons, uppercase subsection labels, dividers, location inset, green statement, service category grid, warning panel, and email link. All cards start expanded and can independently collapse/reopen. Search matches section titles and all supporting text, opens results, supports empty results, and clears back to all eleven sections.
- `src/constants/tarakapePrivacy.ts`: editable supplied policy, fixed date, UI labels, section icons, and structured blocks. Paragraphs, lists, panels, and email link can be edited without changing the screen component.
- `tests/about/privacy-reference.cjs`: full content parity and native-screen browser checks.
- `tests/about/privacy-reference.txt`: exact supplied policy as a test fixture, copied from the user attachment with UTF-8 preserved.
- `tests/about/about.cjs`: updates existing About/documentation regression checks for the new reference policy, including phone/tablet layouts, search, expansion, offline reading, and larger rendered text.
- `docs/documentation-privacy.md`: identifies the preceding policy implementation as superseded on this route.
- This report.

## Behavior and boundaries

The supplied wording is preserved, including punctuation, accents, all eleven sections, effective date, names, contact, and every list item. The tests compare the entire ordered content against the supplied-text fixture rather than checking only selected passages. Supplied policy statements describe the requested reference brand; this work does not verify those statements as CebSpot organizational practices.

The screen uses React Native views, text, input, pressable controls, and a vertical scroll view. Shared safe areas, stack back navigation, fonts, and dark theme remain supported. About and documentation navigation are unchanged. Cards have flexible heights and wrapping content. The service grid uses two columns at ordinary text scale from 320px and falls back to one column for larger native font scales or smaller widths.

Core text is bundled locally. Reading, searching, or expanding sections does not record acceptance or grant permissions. The provided agreement sentence is displayed as text without implementing a consent side effect. The email link uses the existing validated link utility and opens a mail application only after a user tap. No email was opened, sent, or submitted during implementation or testing; the test verifies the link without activating it.

Only the textual specification was attached in this turn. The implementation follows its component/color/layout instructions; no claim of a pixel comparison with an image is made.

## Validation commands

```powershell
npm.cmd run typecheck
npm.cmd run lint
node -e "require('./tests/about/privacy-reference.cjs')"
$env:EXPO_OFFLINE='1'
$env:CI='1'
node node_modules/expo/bin/cli export --platform all --max-workers 1 --output-dir .codex-tmp/privacy-reference-final-export
$env:ABOUT_EXPORT_DIR='.codex-tmp/privacy-reference-final-export'
$env:PLAYWRIGHT_CHROMIUM_CHANNEL='chrome'
node tests/about/about.cjs
```

The configured export targets are Android/Hermes and web. Browser tests use fixture accounts and intercepted requests, not real reservations or messages. Physical Android back, TalkBack, OS font scaling, and device safe-area behavior require native-device testing. Nothing was deployed to production.

## Completed validation — October 8, 2026

- Typecheck and repository lint passed (both use TypeScript's `--noEmit` checker).
- Exact ordered text comparison passed for the entire supplied policy and all eleven sections, including the configured date and mailto destination.
- Final web and Android/Hermes exports passed in `.codex-tmp/privacy-reference-final-export` (3,090 web modules; 3,396 Android modules).
- The browser regression suite passed in light/dark themes at 320×640 and 1024×900. It checked every displayed policy heading, paragraph, list item, and email label; all eleven expandable cards; the panels and green sharing color; service grid columns; heading/body search and clearing; empty results; back/scroll preservation; offline reading and search; larger rendered text; and existing About/documentation/Profile behavior.
- The narrow-phone grid check exposed an initial column-sizing issue, corrected by allowing both cells to share the available width after spacing. Final grid checks passed at both widths.
- Light phone and enlarged-text screenshots were visually reviewed. Browser-script syntax and scoped whitespace checks passed.
- No device installation, physical-device testing, email activation/submission, or production deployment was performed.
