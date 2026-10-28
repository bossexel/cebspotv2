# QR Ph checkout fix — October 28, 2026

Checkout called `get_venue_table_availability` directly, although the deployed
database uses the older reservation availability API. The table selection screen
already supported that schema; checkout now uses the same compatibility service.
Before creating a reservation, checkout reads the venue's current stored table
inventory and checks availability. Missing venues, failed reads, unavailable
tables, and changed walk-in policies stop checkout before payment. Unexpected
checkout errors display a friendly message instead of internal database details.

The existing server reservation check and payment flow remain in place. This fix
requires an Android JavaScript update for runtime 1.0.4, with no database migration
or changes to payment configuration or reservation expiry rules.

Validation:

- TypeScript check and 19 focused automated tests passed.
- The actual checkout screen passed fixture tests for both database versions,
  unavailable tables, owner policy changes, slot races, network/provider errors,
  retry without duplicate reservations, and payment routing.
- The actual client service read live stored inventory successfully. The deployed
  QR Ph endpoint authenticated a test request and rejected its nonexistent
  reservation before contacting the payment provider.
- A database transaction verified the checkout insert and reserved-table blocking,
  then rolled back all test data.
- No real payment checkout or charge was created. Completing a real QR Ph payment
  remains a tester check.

Publication details will be recorded after verifying the served Android update.
