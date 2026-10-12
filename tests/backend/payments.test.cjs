// Payment regression entry point: actual handlers and full native SQL migrations.
// Auth and PayMongo are isolated adapters; no real charge or provider call occurs.
require('../remediation/payment-handlers.test.cjs');
