# Retained remediation command record

Each row links the exact sanitized command, times, exit status and complete output. Failed attempts are retained; later successful runs supersede only the relevant failed check. Npm audit exits nonzero when findings remain. These are recorded verification/install commands; exploratory reads and Git commands also appear in the Codex tool transcript and commit history. No production probes or deployments were run during remediation.

Environment context: network npm checks use `NODE_OPTIONS=--use-system-ca`; final admin export uses `EXPO_NO_DOTENV=1`; final admin browser test uses `ADMIN_WEB_EXPORT_DIR=.codex-tmp/remediation-admin-final`. The Android RC wrapper disables dotenv and clears public backend variables in offline-verification mode. Python advisory checks use the OS trust store through `scripts/python-audit.py`. No secret environment values are recorded.

| Label | Exact command | Exit | Result |
|---|---|---:|---|
| [phase-1-typecheck](../tests/remediation/evidence/commands/phase-1-typecheck.json) | `npm run typecheck` | 0 | PASS |
| [phase-1-backend](../tests/remediation/evidence/commands/phase-1-backend.json) | `node --test tests/backend/*.test.cjs tests/platform/*.test.cjs` | 0 | PASS |
| [phase-2-activity-privacy](../tests/remediation/evidence/commands/phase-2-activity-privacy.json) | `node --test tests/remediation/activity-privacy.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-2-activity-privacy-verified](../tests/remediation/evidence/commands/phase-2-activity-privacy-verified.json) | `node --test tests/remediation/activity-privacy.test.cjs` | 0 | PASS |
| [phase-3-complete-migrations](../tests/remediation/evidence/commands/phase-3-complete-migrations.json) | `node --test tests/remediation/migrations.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-3-complete-migrations-bom-corrected](../tests/remediation/evidence/commands/phase-3-complete-migrations-bom-corrected.json) | `node --test tests/remediation/migrations.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-3-complete-migrations-and-roles](../tests/remediation/evidence/commands/phase-3-complete-migrations-and-roles.json) | `node --test tests/remediation/migrations.test.cjs tests/remediation/activity-privacy.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-3-replay-upgrade-and-roles](../tests/remediation/evidence/commands/phase-3-replay-upgrade-and-roles.json) | `node --test tests/remediation/migrations.test.cjs tests/remediation/activity-privacy.test.cjs` | 0 | PASS |
| [phase-4-typecheck](../tests/remediation/evidence/commands/phase-4-typecheck.json) | `npm run typecheck` | 0 | PASS |
| [phase-4-inventory](../tests/remediation/evidence/commands/phase-4-inventory.json) | `node --test tests/remediation/inventory.test.cjs tests/remediation/migrations.test.cjs tests/backend/owner-reservation-settings.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-4-inventory-verified](../tests/remediation/evidence/commands/phase-4-inventory-verified.json) | `node --test tests/remediation/inventory.test.cjs tests/remediation/inventory-client.test.cjs tests/backend/owner-reservation-settings.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-4-inventory-final](../tests/remediation/evidence/commands/phase-4-inventory-final.json) | `node --test tests/remediation/inventory.test.cjs tests/remediation/inventory-client.test.cjs tests/backend/owner-reservation-settings.test.cjs` | 0 | PASS |
| [phase-4-existing-backend](../tests/remediation/evidence/commands/phase-4-existing-backend.json) | `node --test tests/backend/*.test.cjs tests/platform/*.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-4-floor-plan](../tests/remediation/evidence/commands/phase-4-floor-plan.json) | `node --test tests/backend/club-floor-plan.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-4-backend-final](../tests/remediation/evidence/commands/phase-4-backend-final.json) | `node --test tests/backend/*.test.cjs tests/platform/*.test.cjs` | 0 | PASS |
| [phase-5-typecheck](../tests/remediation/evidence/commands/phase-5-typecheck.json) | `npm run typecheck` | 0 | PASS |
| [phase-5-manual-proof](../tests/remediation/evidence/commands/phase-5-manual-proof.json) | `node --test tests/remediation/manual-proof.test.cjs` | 0 | PASS |
| [phase-5-workflows](../tests/remediation/evidence/commands/phase-5-workflows.json) | `node --test tests/remediation/manual-proof.test.cjs tests/remediation/private-upload.test.cjs tests/remediation/migrations.test.cjs` | 0 | PASS |
| [phase-5-existing-backend](../tests/remediation/evidence/commands/phase-5-existing-backend.json) | `node --test tests/backend/*.test.cjs tests/platform/*.test.cjs` | 0 | PASS |
| [phase-5-proof-client](../tests/remediation/evidence/commands/phase-5-proof-client.json) | `node --test tests/remediation/proof-client.test.cjs` | 0 | PASS |
| [phase-6-migration-compile](../tests/remediation/evidence/commands/phase-6-migration-compile.json) | `node --test tests/remediation/migrations.test.cjs` | 0 | PASS |
| [phase-6-typecheck](../tests/remediation/evidence/commands/phase-6-typecheck.json) | `npm run typecheck` | 0 | PASS |
| [phase-6-payment-transactions](../tests/remediation/evidence/commands/phase-6-payment-transactions.json) | `node --test tests/remediation/durable-payments.test.cjs tests/remediation/manual-proof.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-6-payment-transactions-verified](../tests/remediation/evidence/commands/phase-6-payment-transactions-verified.json) | `node --test tests/remediation/durable-payments.test.cjs` | 0 | PASS |
| [phase-6-payment-handlers](../tests/remediation/evidence/commands/phase-6-payment-handlers.json) | `node --test tests/remediation/payment-handlers.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-6-payment-handlers-verified](../tests/remediation/evidence/commands/phase-6-payment-handlers-verified.json) | `node --test tests/remediation/payment-handlers.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-6-payment-handlers-final](../tests/remediation/evidence/commands/phase-6-payment-handlers-final.json) | `node --test tests/remediation/payment-handlers.test.cjs` | 0 | PASS |
| [phase-6-typecheck-final](../tests/remediation/evidence/commands/phase-6-typecheck-final.json) | `npm run typecheck` | 0 | PASS |
| [phase-6-handler-recovery-boundaries](../tests/remediation/evidence/commands/phase-6-handler-recovery-boundaries.json) | `node --test --test-name-pattern=complete database outage\|older than provider\|scheduled maintenance tests/remediation/payment-handlers.test.cjs` | 0 | PASS |
| [phase-6-backend-and-upgrade](../tests/remediation/evidence/commands/phase-6-backend-and-upgrade.json) | `node --test tests/backend/*.test.cjs tests/platform/*.test.cjs tests/remediation/migrations.test.cjs` | 0 | PASS |
| [phase-7-android-export](../tests/remediation/evidence/commands/phase-7-android-export.json) | `npm run build:android -- --output-dir .codex-tmp/remediation-android-phase7 --max-workers 1` | 0 | PASS |
| [phase-7-platform](../tests/remediation/evidence/commands/phase-7-platform.json) | `node --test tests/platform/android-only.test.cjs` | 0 | PASS |
| [phase-7-admin-export](../tests/remediation/evidence/commands/phase-7-admin-export.json) | `npm run build -- --output-dir .codex-tmp/remediation-admin-phase7 --max-workers 1` | 0 | PASS |
| [phase-7-denied-customer-web](../tests/remediation/evidence/commands/phase-7-denied-customer-web.json) | `node tests/platform/deny-customer-web.cjs` | 0 | PASS |
| [phase-7-admin-artifact](../tests/remediation/evidence/commands/phase-7-admin-artifact.json) | `npm run test:admin-web` | 0 | PASS |
| [phase-8-private-upload-migration](../tests/remediation/evidence/commands/phase-8-private-upload-migration.json) | `node --test tests/remediation/migrations.test.cjs` | 0 | PASS |
| [phase-8-owner-typecheck](../tests/remediation/evidence/commands/phase-8-owner-typecheck.json) | `npm run typecheck` | 0 | PASS |
| [phase-8-private-upload-handlers](../tests/remediation/evidence/commands/phase-8-private-upload-handlers.json) | `node --test tests/remediation/private-upload.test.cjs tests/remediation/proof-client.test.cjs` | 0 | PASS |
| [phase-8-owner-private-database](../tests/remediation/evidence/commands/phase-8-owner-private-database.json) | `node --test tests/remediation/owner-private-uploads.test.cjs tests/remediation/manual-proof.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-8-owner-private-database-verified](../tests/remediation/evidence/commands/phase-8-owner-private-database-verified.json) | `node --test --test-concurrency=1 tests/remediation/owner-private-uploads.test.cjs tests/remediation/manual-proof.test.cjs` | 0 | PASS |
| [phase-8-face-security](../tests/remediation/evidence/commands/phase-8-face-security.json) | `.venv/Scripts/python.exe face-blur-service/tests/test_security.py` | 101 | NONZERO — inspect retained output |
| [phase-8-face-security-runtime](../tests/remediation/evidence/commands/phase-8-face-security-runtime.json) | `.venv/Scripts/python.exe face-blur-service/tests/test_security.py` | 0 | PASS |
| [phase-8-authenticated-face-typecheck](../tests/remediation/evidence/commands/phase-8-authenticated-face-typecheck.json) | `npm run typecheck` | 2 | NONZERO — inspect retained output |
| [phase-8-upload-client-coverage](../tests/remediation/evidence/commands/phase-8-upload-client-coverage.json) | `node --test tests/remediation/upload-clients.test.cjs tests/remediation/private-upload.test.cjs tests/remediation/proof-client.test.cjs` | 0 | PASS |
| [phase-8-typecheck-verified](../tests/remediation/evidence/commands/phase-8-typecheck-verified.json) | `npm run typecheck` | 0 | PASS |
| [phase-8-backend-regression](../tests/remediation/evidence/commands/phase-8-backend-regression.json) | `node --test --test-concurrency=1 tests/backend/*.test.cjs tests/platform/*.test.cjs` | 0 | PASS |
| [phase-8-face-security-verified](../tests/remediation/evidence/commands/phase-8-face-security-verified.json) | `.venv/Scripts/python.exe face-blur-service/tests/test_security.py` | 0 | PASS |
| [phase-8-upload-acceptance](../tests/remediation/evidence/commands/phase-8-upload-acceptance.json) | `node --test --test-concurrency=1 tests/remediation/owner-private-uploads.test.cjs tests/remediation/upload-maintenance.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-8-face-complete](../tests/remediation/evidence/commands/phase-8-face-complete.json) | `.venv/Scripts/python.exe face-blur-service/tests/test_security.py` | 0 | PASS |
| [phase-8-upload-acceptance-verified](../tests/remediation/evidence/commands/phase-8-upload-acceptance-verified.json) | `node --test --test-concurrency=1 tests/remediation/owner-private-uploads.test.cjs tests/remediation/upload-maintenance.test.cjs` | 0 | PASS |
| [phase-9-map-build](../tests/remediation/evidence/commands/phase-9-map-build.json) | `npm run map:build` | 0 | PASS |
| [phase-9-map-regression](../tests/remediation/evidence/commands/phase-9-map-regression.json) | `npm run test:map` | 0 | PASS |
| [phase-9-details-and-feed](../tests/remediation/evidence/commands/phase-9-details-and-feed.json) | `node --test --test-concurrency=1 tests/remediation/reservation-details.test.cjs tests/remediation/truthful-feed.test.cjs tests/remediation/manual-proof.test.cjs tests/remediation/durable-payments.test.cjs` | 0 | PASS |
| [phase-9-details-typecheck](../tests/remediation/evidence/commands/phase-9-details-typecheck.json) | `npm run typecheck` | 2 | NONZERO — inspect retained output |
| [phase-9-details-typecheck-verified](../tests/remediation/evidence/commands/phase-9-details-typecheck-verified.json) | `npm run typecheck` | 0 | PASS |
| [phase-9-ui-backend-regression](../tests/remediation/evidence/commands/phase-9-ui-backend-regression.json) | `node --test --test-concurrency=1 tests/backend/*.test.cjs tests/platform/*.test.cjs tests/remediation/migrations.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-9-route-regression](../tests/remediation/evidence/commands/phase-9-route-regression.json) | `node --test tests/remediation/android-recovery.test.cjs tests/remediation/truthful-feed.test.cjs` | 0 | PASS |
| [phase-9-details-replay-regression](../tests/remediation/evidence/commands/phase-9-details-replay-regression.json) | `node --test --test-concurrency=1 tests/backend/audit-remediation.test.cjs tests/remediation/migrations.test.cjs tests/remediation/android-recovery.test.cjs` | 0 | PASS |
| [phase-9-ui-typecheck-complete](../tests/remediation/evidence/commands/phase-9-ui-typecheck-complete.json) | `npm run typecheck` | 0 | PASS |
| [phase-9-circle-privacy](../tests/remediation/evidence/commands/phase-9-circle-privacy.json) | `node --test --test-concurrency=1 tests/remediation/circle-privacy.test.cjs tests/remediation/migrations.test.cjs` | 0 | PASS |
| [phase-9-circle-typecheck](../tests/remediation/evidence/commands/phase-9-circle-typecheck.json) | `npm run typecheck` | 0 | PASS |
| [phase-9-account-migration](../tests/remediation/evidence/commands/phase-9-account-migration.json) | `node --test tests/remediation/migrations.test.cjs` | 0 | PASS |
| [phase-9-account-database](../tests/remediation/evidence/commands/phase-9-account-database.json) | `node --test tests/remediation/account-deletion.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-9-account-database-verified](../tests/remediation/evidence/commands/phase-9-account-database-verified.json) | `node --test tests/remediation/account-deletion.test.cjs` | 0 | PASS |
| [phase-9-account-typecheck](../tests/remediation/evidence/commands/phase-9-account-typecheck.json) | `npm run typecheck` | 0 | PASS |
| [phase-9-account-and-uploads](../tests/remediation/evidence/commands/phase-9-account-and-uploads.json) | `node --test tests/remediation/account-deletion.test.cjs tests/remediation/private-upload.test.cjs tests/remediation/payment-handlers.test.cjs` | 0 | PASS |
| [phase-9-face-deletion](../tests/remediation/evidence/commands/phase-9-face-deletion.json) | `.venv/Scripts/python.exe face-blur-service/tests/test_security.py` | 0 | PASS |
| [phase-9-deletion-handlers](../tests/remediation/evidence/commands/phase-9-deletion-handlers.json) | `node --test tests/remediation/account-deletion-handler.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-9-deletion-handlers-verified](../tests/remediation/evidence/commands/phase-9-deletion-handlers-verified.json) | `node --test tests/remediation/account-deletion-handler.test.cjs` | 0 | PASS |
| [phase-9-dependency-audit](../tests/remediation/evidence/commands/phase-9-dependency-audit.json) | `npm audit --json` | 1 | NONZERO — inspect retained output |
| [phase-9-dependency-audit-verified](../tests/remediation/evidence/commands/phase-9-dependency-audit-verified.json) | `npm audit --json` | 1 | NONZERO — inspect retained output |
| [phase-9-account-replay-and-policies](../tests/remediation/evidence/commands/phase-9-account-replay-and-policies.json) | `node --test --test-concurrency=1 tests/remediation/migrations.test.cjs tests/remediation/circle-privacy.test.cjs tests/remediation/manual-proof.test.cjs tests/remediation/owner-private-uploads.test.cjs tests/remediation/private-upload.test.cjs` | 0 | PASS |
| [phase-9-account-race](../tests/remediation/evidence/commands/phase-9-account-race.json) | `node --test tests/remediation/account-deletion.test.cjs tests/remediation/account-deletion-handler.test.cjs` | 1 | NONZERO — inspect retained output |
| [phase-9-face-deletion-final](../tests/remediation/evidence/commands/phase-9-face-deletion-final.json) | `.venv/Scripts/python.exe face-blur-service/tests/test_security.py` | 0 | PASS |
| [phase-9-account-race-verified](../tests/remediation/evidence/commands/phase-9-account-race-verified.json) | `node --test tests/remediation/account-deletion.test.cjs` | 0 | PASS |
| [phase-9-targeted-npm-updates](../tests/remediation/evidence/commands/phase-9-targeted-npm-updates.json) | `npm update shell-quote @babel/core js-yaml nanoid undici compression postcss braces brace-expansion source-map-js fast-uri ws browserslist --ignore-scripts --no-audit` | 0 | PASS |
| [phase-9-python-security-updates](../tests/remediation/evidence/commands/phase-9-python-security-updates.json) | `.venv/Scripts/python.exe -m pip install --disable-pip-version-check --upgrade fastapi==0.143.0 starlette==1.7.0 python-multipart==0.0.32 pip-audit` | 1 | NONZERO — inspect retained output |
| [phase-9-release-environment](../tests/remediation/evidence/commands/phase-9-release-environment.json) | `node --test tests/remediation/release-env.test.cjs` | 0 | PASS |
| [phase-9-python-security-updates-system-ca](../tests/remediation/evidence/commands/phase-9-python-security-updates-system-ca.json) | `.venv/Scripts/python.exe -m pip --use-feature=truststore install --disable-pip-version-check --upgrade fastapi==0.143.0 starlette==1.7.0 python-multipart==0.0.32 pip-audit` | 0 | PASS |
| [phase-9-dependency-audit-after-updates](../tests/remediation/evidence/commands/phase-9-dependency-audit-after-updates.json) | `npm audit --json` | 1 | NONZERO — inspect retained output |
| [phase-9-scanner-regression](../tests/remediation/evidence/commands/phase-9-scanner-regression.json) | `node --test tests/remediation/secret-scan.test.cjs` | 0 | PASS |
| [final-lint](../tests/remediation/evidence/commands/final-lint.json) | `npm run lint` | 0 | PASS |
| [final-backend-and-platform](../tests/remediation/evidence/commands/final-backend-and-platform.json) | `node --test --test-concurrency=1 tests/backend/*.test.cjs tests/platform/*.test.cjs` | 0 | PASS |
| [final-typecheck](../tests/remediation/evidence/commands/final-typecheck.json) | `npm run typecheck` | 0 | PASS |
| [phase-9-face-patched-stack](../tests/remediation/evidence/commands/phase-9-face-patched-stack.json) | `.venv/Scripts/python.exe face-blur-service/tests/test_security.py` | 0 | PASS |
| [phase-9-python-dependency-audit](../tests/remediation/evidence/commands/phase-9-python-dependency-audit.json) | `.venv/Scripts/python.exe scripts/python-audit.py` | 1 | NONZERO — inspect retained output |
| [phase-9-source-secret-scan](../tests/remediation/evidence/commands/phase-9-source-secret-scan.json) | `node scripts/remediation-secret-scan.cjs` | 0 | PASS |
| [final-remediation](../tests/remediation/evidence/commands/final-remediation.json) | `node --test --test-concurrency=1 tests/remediation/*.test.cjs` | 0 | PASS |
| [phase-9-targeted-npm-final](../tests/remediation/evidence/commands/phase-9-targeted-npm-final.json) | `npm update tar decode-uri-component form-data http-cache-semantics image-size ajv --ignore-scripts --no-audit` | 0 | PASS |
| [phase-9-python-tools-patched](../tests/remediation/evidence/commands/phase-9-python-tools-patched.json) | `.venv/Scripts/python.exe -m pip --use-feature=truststore install --disable-pip-version-check --upgrade pip==26.2.0 setuptools==83.0.0 python-dotenv==1.2.2` | 0 | PASS |
| [phase-9-archive-compatibility](../tests/remediation/evidence/commands/phase-9-archive-compatibility.json) | `node --test tests/remediation/dependency-compatibility.test.cjs` | 1 | NONZERO — inspect retained output |
| [final-android-hermes](../tests/remediation/evidence/commands/final-android-hermes.json) | `npm run build:android:rc -- --offline-verification --output-dir .codex-tmp/remediation-android-final` | 0 | PASS |
| [final-admin-export](../tests/remediation/evidence/commands/final-admin-export.json) | `npm run build -- --output-dir .codex-tmp/remediation-admin-final --max-workers 1 --clear` | 0 | PASS |
| [phase-9-expo-tar-patch](../tests/remediation/evidence/commands/phase-9-expo-tar-patch.json) | `node scripts/patch-expo-tar.cjs` | 0 | PASS |
| [phase-9-archive-compatibility-verified](../tests/remediation/evidence/commands/phase-9-archive-compatibility-verified.json) | `node --test tests/remediation/dependency-compatibility.test.cjs` | 0 | PASS |
| [phase-9-expo-extraction-patch](../tests/remediation/evidence/commands/phase-9-expo-extraction-patch.json) | `node scripts/patch-expo-tar.cjs` | 0 | PASS |
| [phase-9-extraction-both-paths](../tests/remediation/evidence/commands/phase-9-extraction-both-paths.json) | `node --test tests/remediation/dependency-compatibility.test.cjs tests/remediation/secret-scan.test.cjs tests/remediation/release-env.test.cjs` | 0 | PASS |
| [phase-9-python-audit-final](../tests/remediation/evidence/commands/phase-9-python-audit-final.json) | `.venv/Scripts/python.exe scripts/python-audit.py` | 0 | PASS |
| [phase-9-npm-audit-final](../tests/remediation/evidence/commands/phase-9-npm-audit-final.json) | `npm audit --json` | 1 | NONZERO — inspect retained output |
| [final-admin-browser](../tests/remediation/evidence/commands/final-admin-browser.json) | `npm run test:admin-web` | 0 | PASS |
| [final-web-distribution-denied](../tests/remediation/evidence/commands/final-web-distribution-denied.json) | `node tests/platform/deny-customer-web.cjs` | 0 | PASS |
| [final-existing-isolated-tests](../tests/remediation/evidence/commands/final-existing-isolated-tests.json) | `node --test tests/performance/isolated/suite.test.cjs` | 0 | PASS |
| [final-map-source](../tests/remediation/evidence/commands/final-map-source.json) | `npm run map:check` | 0 | PASS |
| [phase-9-lockfile-sync](../tests/remediation/evidence/commands/phase-9-lockfile-sync.json) | `npm install --package-lock-only --ignore-scripts --offline --no-audit` | 0 | PASS |
| [final-typecheck-after-dependencies](../tests/remediation/evidence/commands/final-typecheck-after-dependencies.json) | `npm run typecheck` | 0 | PASS |
| [final-lint-after-dependencies](../tests/remediation/evidence/commands/final-lint-after-dependencies.json) | `npm run lint` | 0 | PASS |
| [final-lockfile-install](../tests/remediation/evidence/commands/final-lockfile-install.json) | `npm ci --offline --no-audit` | 1 | NONZERO — inspect retained output |
| [final-secret-scan](../tests/remediation/evidence/commands/final-secret-scan.json) | `node scripts/remediation-secret-scan.cjs .codex-tmp/remediation-android-final .codex-tmp/remediation-admin-final` | 0 | PASS |
| [final-lockfile-install-online](../tests/remediation/evidence/commands/final-lockfile-install-online.json) | `npm ci --no-audit` | 0 | PASS |
| [deletion-assignment-race-red](../tests/remediation/evidence/commands/deletion-assignment-race-red.json) | `node --test tests/remediation/account-deletion.test.cjs` | 1 | NONZERO — inspect retained output |
| [final-clean-install-regression](../tests/remediation/evidence/commands/final-clean-install-regression.json) | `node --test tests/remediation/dependency-compatibility.test.cjs tests/remediation/release-env.test.cjs tests/remediation/secret-scan.test.cjs tests/platform/android-only.test.cjs` | 0 | PASS |
| [final-clean-install-typecheck](../tests/remediation/evidence/commands/final-clean-install-typecheck.json) | `npm run typecheck` | 0 | PASS |
| [deletion-assignment-race-verified](../tests/remediation/evidence/commands/deletion-assignment-race-verified.json) | `node --test tests/remediation/account-deletion.test.cjs tests/remediation/migrations.test.cjs` | 0 | PASS |
| [deletion-assignment-concurrency](../tests/remediation/evidence/commands/deletion-assignment-concurrency.json) | `node --test tests/remediation/account-deletion.test.cjs tests/remediation/migrations.test.cjs` | 0 | PASS |
| [final-remediation-after-owner-guard](../tests/remediation/evidence/commands/final-remediation-after-owner-guard.json) | `node --test --test-concurrency=1 tests/remediation/*.test.cjs` | 0 | PASS |
| [final-face-patched-environment](../tests/remediation/evidence/commands/final-face-patched-environment.json) | `.venv/Scripts/python.exe face-blur-service/tests/test_security.py` | 0 | PASS |
| [final-public-credential-guard](../tests/remediation/evidence/commands/final-public-credential-guard.json) | `node --test tests/remediation/release-env.test.cjs` | 0 | PASS |
| [final-source-and-export-secret-scan](../tests/remediation/evidence/commands/final-source-and-export-secret-scan.json) | `node scripts/remediation-secret-scan.cjs .codex-tmp/remediation-android-final .codex-tmp/remediation-admin-final` | 0 | PASS |
| [final-native-link-guard](../tests/remediation/evidence/commands/final-native-link-guard.json) | `node --test tests/remediation/native-links.test.cjs` | 0 | PASS |
| [final-android-hermes-link-guard](../tests/remediation/evidence/commands/final-android-hermes-link-guard.json) | `npm run build:android:rc -- --offline-verification --output-dir .codex-tmp/remediation-android-final` | 0 | PASS |
| [final-native-link-typecheck](../tests/remediation/evidence/commands/final-native-link-typecheck.json) | `npm run typecheck` | 0 | PASS |
| [final-closure-secret-scan](../tests/remediation/evidence/commands/final-closure-secret-scan.json) | `node scripts/remediation-secret-scan.cjs .codex-tmp/remediation-android-final .codex-tmp/remediation-admin-final` | 0 | PASS |
