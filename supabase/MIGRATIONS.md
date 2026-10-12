# Authoritative CebSpot schema history

Apply only timestamped files in `supabase/migrations`, in lexical timestamp order. Root `supabase-*.sql` files are historical references and reproduction inputs; do not run them as a second deployment sequence. Never apply spot/demo seeds as release inventory.

The two `20260901` foundation migrations capture the inspected schema and feature definitions that previously existed only in root files. Booking columns are created before dependent constraints/functions. They contain no venue, account, review, activity, or inventory sample rows. Static achievement definitions are application configuration, not live activity.

Existing September/October migration files retain their historical contents. New corrections follow them. `tests/remediation/evidence/migration-manifest.json` records the actual replay order and checksums.

## Verification

`node --test tests/remediation/migrations.test.cjs` creates a new loopback PostgreSQL cluster and replays every migration. Platform-owned Auth/Storage objects use explicit contract fixtures, so this is not a full Supabase-stack or HTTP test. Embedded PostgreSQL packages currently live in ignored `.codex-tmp/walk-in-validation/node_modules`; set `WALK_IN_PG_PACKAGES` to an equivalent installed package directory when needed.

For a full stack, provision a NEW isolated Supabase project with a Docker-compatible runtime, copy the authoritative config/migrations into it, start it, then replay/reset that disposable fixture and run the API/storage suites. Do not reset an existing local or linked database. CLI/runtime availability is currently an external verification blocker.

## Existing deployments

Do not blindly push the foundation into a deployed database. First inspect its schema and migration history, compare against the baseline, and prepare an explicit alignment manifest. Run upgrade verification on an isolated schema-only fixture. No production migration history repair or production deployment is authorized here.

Rollback uses feature shutdown and reviewed forward repairs; it must not restore permissive activity policies or remove payment evidence.
