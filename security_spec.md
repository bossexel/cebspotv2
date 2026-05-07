# Security Specification: CebSpot Supabase Prototype

## Data Invariants

1. Users can read and update only their own profile.
2. Public users can read only approved/public spots.
3. Authenticated users can create reservations only for themselves.
4. Reservations persist `spot_name`, QR code, status, payment status, and created time.
5. Spot submissions are created by authenticated users and reviewed before becoming public spots.
6. Circle data is readable only by owners or members.

## Prototype RLS Coverage

The baseline policies live in `supabase-schema.sql`:

- Public read for `spots` where `is_public = true`
- Own-profile read, insert, and update
- Own-reservation insert and read
- Own-spot-submission insert and read
- Activity feed read for prototype community updates
- Own-activity insert
- Circle owner/member read
