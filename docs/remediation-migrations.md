# Authoritative migration application order

Apply all timestamped migrations in this lexical order on a new isolated project. Never reapply root archived SQL after them. An existing database requires history/schema alignment and backup review before application; do not reset it. See [MIGRATIONS.md](../supabase/MIGRATIONS.md).

| Order | Migration | SHA-256 |
|---:|---|---|
| 1 | [20260901000000_schema_foundation.sql](../supabase/migrations/20260901000000_schema_foundation.sql) | `b8e0e5283f0bd941d13dfbf920def1989169113d620c7777ab52ef09ffcf9ee4` |
| 2 | [20260901000100_feature_foundation.sql](../supabase/migrations/20260901000100_feature_foundation.sql) | `c0fa9bf664a08f3c0d861d7546ac50a96c957ea5f1e547fc5133d7f148579004` |
| 3 | [20260912000100_reservation_attendance.sql](../supabase/migrations/20260912000100_reservation_attendance.sql) | `12f70227011ff23352d6061beeb7cbfa9c1c814d9a5c95148916c2a99fa1b992` |
| 4 | [20260915000100_admin_identity_cutover.sql](../supabase/migrations/20260915000100_admin_identity_cutover.sql) | `a55af0fd885a44e27684b169314ac2f5a8673c44a2bb3f06fb6d2eb1abe8cf85` |
| 5 | [20261006000100_audit_authorization_hardening.sql](../supabase/migrations/20261006000100_audit_authorization_hardening.sql) | `7b980712bdf2518458aa83e2714bd280638a5e164f3589f2511406536b841cf0` |
| 6 | [20261011000100_table_booking_policy_and_walk_ins.sql](../supabase/migrations/20261011000100_table_booking_policy_and_walk_ins.sql) | `988edf657e405c8c83d4672edcb5136984d88ad4166a0f62acd677459e2084b7` |
| 7 | [20261013000100_activity_privacy.sql](../supabase/migrations/20261013000100_activity_privacy.sql) | `53d9513b16551b6b03772b2f7c1fa93a9b2dece93a2532874f1b0bb7f4e96cf5` |
| 8 | [20261013000200_android_reservation_scope.sql](../supabase/migrations/20261013000200_android_reservation_scope.sql) | `85996c02fa4aab5b80564c816cfb6b6cf1850643e238711f22b637c2564338d6` |
| 9 | [20261013000300_manual_proof_and_bounded_holds.sql](../supabase/migrations/20261013000300_manual_proof_and_bounded_holds.sql) | `1318b9dea61f9598100e2e7a0a569b7917c226dcaa080a6f1bcb92594c9224e9` |
| 10 | [20261013000400_durable_checkout_and_payment_events.sql](../supabase/migrations/20261013000400_durable_checkout_and_payment_events.sql) | `e036813d1387a4f051898551332fc5f411b942823bbf4f01313cd1b01be1b0f6` |
| 11 | [20261013000500_request_bound_private_uploads.sql](../supabase/migrations/20261013000500_request_bound_private_uploads.sql) | `9dd661e41712f77d408b5fc04e3781d135fa0a13477427b80d0b8af6710845c8` |
| 12 | [20261013000600_server_reservation_details.sql](../supabase/migrations/20261013000600_server_reservation_details.sql) | `77f9f46dc49f961a1f0aece0658aca2da5154ea87759d71c9451afb126713549` |
| 13 | [20261013000700_circle_location_controls.sql](../supabase/migrations/20261013000700_circle_location_controls.sql) | `1e036ebcbb0b962116e02fa3ba9683399edc7bc64b6878d010b89b3c821c88fd` |
| 14 | [20261013000800_account_erasure.sql](../supabase/migrations/20261013000800_account_erasure.sql) | `4171be5264f8385d74034a48d90b1e7b192a1521cac07e059a8b57b9080dfc98` |
| 15 | [20261013000900_block_deleting_owner_assignments.sql](../supabase/migrations/20261013000900_block_deleting_owner_assignments.sql) | `c74ddd052955285973859f6bf75e87df05eecc969772607879a7b8311cafecdc` |
| 16 | [20261020000100_admin_spot_delete.sql](../supabase/migrations/20261020000100_admin_spot_delete.sql) | `6ac899cd4d6ca6cb2355b0e10f32c6772dffc3fb90383c4bb5f307549d74d35d` |
| 17 | [20261021000100_admin_owner_request_delete.sql](../supabase/migrations/20261021000100_admin_owner_request_delete.sql) | `326bd649cfbfffd36d234f594d8c18601f6a83fbc6171f232f7468445e2553b7` |
| 18 | [20261022000100_admin_spot_submission_delete.sql](../supabase/migrations/20261022000100_admin_spot_submission_delete.sql) | `a8992f515d010565a4c61dad983307a4d4e4fbaff88fd37c86769098e55170df` |
| 19 | [20261022000200_admin_updates.sql](../supabase/migrations/20261022000200_admin_updates.sql) | `e0eca57fb8d0f8e88d826d2fb2c10641daf8d864e515ee5e3e62d90c1b0a6d6a` |
| 20 | [20261025000100_activity_feed_pagination.sql](../supabase/migrations/20261025000100_activity_feed_pagination.sql) | `93965407e468027b8794ab50027066a4d9ef50c52148357c45ed74246909ad1d` |
| 21 | [20261025000200_public_media_size_limits.sql](../supabase/migrations/20261025000200_public_media_size_limits.sql) | `495f1abfcaf1d0f838aa6eb7740aa746d9d6044dfbdc0614e173ae103f622a2b` |
| 22 | [20261027000100_independent_spot_posts.sql](../supabase/migrations/20261027000100_independent_spot_posts.sql) | `6d43b20c43dfe74f87ed36216c53ade5d524121e7ae1397baf77469de51e8087` |
| 23 | [20261028000100_beta_identity_prerequisites.sql](../supabase/migrations/20261028000100_beta_identity_prerequisites.sql) | `c9a64d90522ab031c6a3e13d2aaa525c34751e8666805f4636628145faabc37b` |

Migrations 007 and 008 remove legacy location fields and prepare irreversible erasure operations. They were tested only in newly created synthetic clusters. Deploy matching app/Edge/face-service code; SQL migrations alone do not establish deployed acceptance.
