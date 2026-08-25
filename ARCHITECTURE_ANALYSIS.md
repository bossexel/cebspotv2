# CebSpot Technical Architecture Analysis

## 1. Recommendation Algorithm

### Current Implementation
The app uses a **weighted popularity-score heuristic** defined in the `pending_spot_submission_popularity` view:

```sql
popularity_score = 
  (vote_count * 3) + 
  (search_count * 1) + 
  (similar_submission_count * 2)
```

**Algorithm Components:**
- **Votes**: User upvotes on spot submissions (weighted 3x)
- **Searches**: How often users searched and matched the submission (weighted 1x)
- **Similar submissions**: Duplicate or competing submissions (weighted 2x)
- **Baseline threshold**: Minimum score of 5 to promote to public spots
- **Ranking**: Order by popularity_score DESC, then created_at ASC

### Performance Evidence vs. Baseline
**Status: NO COMPARATIVE BASELINE EVIDENCE FOUND**

The codebase contains:
- ✓ No A/B testing framework
- ✓ No user engagement metrics (CTR, conversion, dwell time)
- ✓ No performance benchmarks comparing this against:
  - Simple rating average (baseline)
  - Random ordering
  - Most recent submissions
  - Geographic clustering

**Risk**: Without user interaction logging and comparative metrics, it's impossible to prove this heuristic outperforms simpler alternatives. The weighted formula appears arbitrary.

### Limitations
1. **Cold-start problem**: New spots have 0 popularity score
2. **No decay**: Older popular spots maintain scores indefinitely
3. **No user-specific personalization**: All users see same ranking
4. **Gaming potential**: Votes can be manipulated by creating multiple accounts

---

## 2. Fake Review Detection

### Current Implementation
The system uses **community reporting only** with NO algorithmic detection:

```sql
-- Review reporting mechanism
CREATE TABLE review_reports (
  id uuid,
  review_id uuid,
  reporter_id uuid,
  reason text,
  created_at timestamptz,
  UNIQUE(review_id, reporter_id)  -- One report per user per review
);
```

**Available report reasons** (from code):
- Inaccurate or misleading review
- Frauds and scams
- Spam
- Hate speech
- Harassment or bullying
- Pornography and nudity
- Illegal activities and regulated goods
- Child or minor safety
- Others

**Detection Logic**: NONE - manual admin review only

### When Insufficient Reviews Exist
**Current capability: ZERO**

The system **cannot detect fake reviews** when review count is low because it relies entirely on:
1. User reports (requires multiple users to notice)
2. Manual admin review (no automation)
3. No statistical patterns (insufficient data volume)

**Recommended approaches for low-volume scenarios:**
- Review creation rate anomalies (many reviews in short time)
- Same-user reviewing multiple spots consecutively
- Identical rating patterns (e.g., all 5-stars from new accounts)
- Geographic impossibility (user reviewed 3 venues in different cities within minutes)
- Language/style similarity detection (ML clustering)
- Account age at review time (new accounts more suspicious)

**Current implementation score**: Vulnerable to coordinated fake review campaigns

---

## 3. Location-Based Search Scalability

### Current Implementation

**Distance Calculation** ([supabase-popular-submissions-workflow.sql](supabase-popular-submissions-workflow.sql#L807)):
```sql
CREATE FUNCTION public.distance_km(
  lat1, lon1, lat2, lon2
) RETURNS double precision
AS $$
  SELECT 6371 * 2 * asin(
    least(1, sqrt(
      power(sin(radians((lat2 - lat1) / 2)), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians((lon2 - lon1) / 2)), 2)
    ))
  );
$$;
```

**Current filtering** ([app/index.tsx](app/index.tsx#L112)):
```tsx
const filters = {
  category: 'All',
  minRating: 0,
  maxDistance: 10,  // User can select: 1, 5, 10, 25, 50 km
};
```

### Scalability Analysis

| Scale | Hundreds | Thousands | Millions |
|-------|----------|-----------|----------|
| **Current Approach** | ✓ Fast | ⚠️ Slow | ✗ Unacceptable |
| **Query Pattern** | All spots + client-side distance calc | All venues loaded, distances computed in-app | Would timeout |
| **Database Burden** | SELECT spots WHERE is_public=true (indexed) | Same query, but 1000x more rows | Same query, but 1,000,000x rows |

### Performance Bottlenecks (for millions of venues)

1. **No spatial indexing**: 
   - PostGIS geometry indexes not used
   - Distance function runs on EVERY row after filter
   - Query: `SELECT * FROM spots WHERE is_public=true` then compute distance in app

2. **Client-side computation** ([app/index.tsx#L35-43]):
   ```tsx
   function enhanceSpots(spots: Spot[]): EnhancedSpot[] {
     return spots.map((spot, index) => ({
       ...spot,
       distanceValue: calculateDistance(
         10.3298, 123.9054,  // Fixed Cebu center
         spot.latitude, spot.longitude
       ),
     }));
   }
   ```
   - Downloads ALL public spots to calculate distance client-side
   - With 1M venues: 1M calculation cycles on device

3. **Missing indexes**:
   - No spatial index on (latitude, longitude)
   - No composite index on (is_public, category, latitude, longitude)

### Scalability Solution (PostgreSQL/PostGIS)

For millions of venues, implement:
```sql
-- Create spatial index
CREATE INDEX spots_location_idx 
  ON spots USING GIST(ll_to_earth(latitude, longitude));

-- Query nearest venues server-side
SELECT * FROM spots 
WHERE is_public = true 
  AND earth_distance(
    ll_to_earth(latitude, longitude),
    ll_to_earth($1, $2)
  ) < $3 * 1000  -- meters
ORDER BY earth_distance(...) 
LIMIT 100;
```

**Current readiness for millions**: **1/10** - Complete redesign required

---

## 4. Database Structure & Indexing

### Core Tables

**Spots** (Venues)
```sql
CREATE TABLE spots (
  id uuid PRIMARY KEY,
  name, description, category,
  address, latitude, longitude,
  images[], rating, review_count,
  reservation_type, reservation_fee,
  payment_required, gcash_*,
  table_inventory JSONB,
  is_public boolean,  -- ← Filtered first
  is_reservable boolean,
  owner_id uuid REFERENCES profiles,
  created_at, updated_at
);

CREATE INDEX spots_public_idx ON spots(is_public);
CREATE INDEX spots_category_idx ON spots(category);
```

**Reservations** (Booking data)
```sql
CREATE TABLE reservations (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES profiles,  -- ← Indexed
  spot_id uuid REFERENCES spots,     -- ← Indexed
  spot_name, reservation_date, reservation_time,
  guest_count, fee, status, payment_status,
  payment_proof_url, qr_code,
  created_at, updated_at
);

CREATE INDEX reservations_user_idx ON reservations(user_id);
CREATE INDEX reservations_spot_idx ON reservations(spot_id);
```

**Reviews** (Ratings & feedback)
```sql
CREATE TABLE reviews (
  id uuid PRIMARY KEY,
  spot_id uuid REFERENCES spots,  -- ← Indexed
  user_id uuid REFERENCES profiles,
  rating numeric(2, 1),
  comment, media_urls[], likes_count, reports_count,
  created_at, updated_at
);

CREATE INDEX reviews_spot_idx 
  ON reviews(spot_id, created_at DESC);
```

**Locations** (User position tracking)
```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  location JSONB,          -- { latitude, longitude }
  last_location_update timestamptz,  -- Update frequency
  role, email, display_name, photo_url, level, points,
  friends UUID[], created_at, updated_at
);
```

### Query Patterns & Speed

**Fast Queries** (indexed):
- Get public spots: `WHERE is_public=true` (~instant)
- Get user's reservations: `WHERE user_id=$1` (~instant)
- Get spot reviews: `WHERE spot_id=$1 ORDER BY created_at DESC` (ordered index)
- Get spot reservations: `WHERE spot_id=$1` (~instant)

**Slow Queries** (no server-side optimization):
- Distance search: Must compute distance on ALL public spots
- Radius search: No spatial index, calculates Haversine distance server-side but no LIMIT enforcement
- Complex filters: Multiple sequential scans

### What Makes Searches Fast
- **Row-Level Security (RLS)** pre-filters: `WHERE is_public = true`
- **Index on is_public**: Eliminates 99% of rows immediately
- **Small result sets**: Max 75 spots returned to app
- **Client-side filtering**: Category/distance filters run on device

### What Would Slow Down with Scale
- Joins across millions of reservations
- Aggregations (COUNT reviews per spot) without materialization
- Distance calculations on millions of rows without spatial indexes

---

## 5. Concurrent Reservation Handling

### Problem: Double-Booking Prevention

**Scenario**: Two users book slot "Table 5, 8:00 PM" at same restaurant simultaneously.

### Current Implementation

**Method 1: Database Constraints** (Primary prevention)
```sql
CREATE TABLE reservations (
  id uuid PRIMARY KEY,
  spot_id uuid,
  reservation_date date,
  reservation_time time,
  guest_count integer,
  status text CHECK (status IN (
    'pending', 'pending_payment', 'confirmed', 'cancelled'
  ))
);
```

**Problem**: NO UNIQUE constraint preventing duplicate bookings!
```sql
-- MISSING: This constraint doesn't exist
-- UNIQUE(spot_id, reservation_date, reservation_time, status)
```

**Method 2: Application Logic** (Secondary, unreliable)
The app tracks table inventory as JSONB:
```sql
table_inventory JSONB DEFAULT '{}'::jsonb
-- Example: { "table_5": [{ tableId: "5", capacity: 4, isReserved: false }] }
```

**Reservation Service** ([reservationService.ts](src/services/reservationService.ts#L45)):
```tsx
async createReservation(reservation: NewReservation): Promise<Reservation> {
  // No advisory lock or check-then-insert pattern
  const { data, error } = await supabase
    .from('reservations')
    .insert(reservationToCreate)  // ← Race condition here
    .select('*')
    .single();
  // If two requests arrive simultaneously, BOTH succeed
}
```

### Race Condition Timeline

```
User A @ 20:00:00.000 → Request reservation at Table 5, 8PM
User B @ 20:00:00.001 → Request reservation at Table 5, 8PM
                        ↓
                   Database insert (no lock)
                        ↓
User A: INSERT succeeds → Reservation confirmed
User B: INSERT succeeds → Reservation ALSO confirmed ← DOUBLE BOOKING!
```

### Prevention Strategies NOT Implemented

**❌ Advisory Locks** (PostgreSQL feature not used):
```sql
SELECT pg_advisory_lock(
  hashtext(spot_id || '::' || reservation_date || '::' || reservation_time)
);
-- Then safely check & insert
```

**❌ Pessimistic Locking**:
```sql
BEGIN;
  SELECT * FROM reservations 
  WHERE spot_id=$1 AND date=$2 AND time=$3 
  FOR UPDATE;  -- ← Locks rows until transaction ends
  
  IF NOT EXISTS (conflicting row) THEN
    INSERT new reservation;
  END IF;
COMMIT;
```

**❌ Optimistic Locking** (version numbers):
```sql
UPDATE reservations SET reserved_slot_v2 = v2 + 1
WHERE spot_id=$1 AND v = v2 - 1;  -- Only update if version matches
```

**Current Status**: 
- ✓ Reservations are inserted
- ✗ **Double-booking is POSSIBLE during race conditions**
- ⚠️ Dependent on payment status workflow to reject one later

### Effective Workaround (if using Supabase)
Use the `approve_paid_reservation` RPC function:
```sql
CREATE FUNCTION approve_paid_reservation(reservation_id uuid)
RETURNS reservations AS $$
BEGIN
  UPDATE reservations SET
    status = 'confirmed',
    payment_status = 'paid'
  WHERE id = $1 AND payment_status = 'pending'
  RETURNING *;
END;
$$ SECURITY DEFINER;
```

This prevents confirmation until payment verified, reducing double-booking window.

---

## 6. Privacy & Location Data Handling

### Location Data Storage

**User location** stored in [supabase-schema.sql](supabase-schema.sql#L12):
```sql
ALTER TABLE profiles ADD COLUMN
  location JSONB,
  last_location_update timestamptz;
```

**Access Controls** ([supabase-schema.sql](supabase-schema.sql#L452)):
```sql
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);  -- Users can only read their own profile

CREATE POLICY "profiles_select_owned_reservation_guests"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM reservations
      WHERE reservations.user_id = profiles.id
        AND (spots.owner_id = auth.uid() 
             OR owner_spot_access.owner_id = auth.uid())
    )
  );  -- Venue owners can see guest details
```

### Specific Privacy Design Decisions

| Aspect | Implementation | Risk Level |
|--------|---|---|
| **Location data exposure** | RLS: only user can see own location | ✓ Low |
| **Owner sees guest location?** | NO - only email/name visible | ✓ Low |
| **Historical location tracking** | `last_location_update` timestamp only, no trail | ✓ Low |
| **Location-based advertising** | NOT implemented | ✓ Safe |
| **Third-party location sharing** | NOT integrated | ✓ Safe |
| **Device geofencing** | NOT implemented | ✓ Safe |
| **Location stalking prevention** | NO rate-limiting on location queries | ⚠️ Possible risk |

### Gaps in Privacy Protection

1. **No data retention policy**: Location data persists indefinitely
2. **No anonymization**: Full location JSONB stored identifiable
3. **No encryption at rest**: Supabase stores plaintext in database
4. **No audit log**: Can't see who accessed location data
5. **No deletion mechanism**: User can't purge historical location
6. **No privacy notice in code**: No user consent collection visible

---

## 7. Data Privacy Act 2012 Compliance

### Requirements of PH Data Privacy Act

| Requirement | Implemented? | Evidence |
|---|---|---|
| **Lawful basis for processing** | ❌ No | No consent collection in code |
| **Right to be informed** | ❌ No | No privacy policy, no data notice |
| **Right to access** | ✓ Partial | RLS policies prevent unauthorized access |
| **Right to correct** | ✓ Partial | Users can update own profile |
| **Right to erasure** | ❌ No | No delete mechanism visible |
| **Right to restrict** | ❌ No | All data processing uncontrolled |
| **Data minimization** | ⚠️ Partial | Stores more than necessary (JSONB location) |
| **Purpose limitation** | ❌ No | No documentation of data use |
| **Storage limitation** | ❌ No | Indefinite retention |
| **Integrity & confidentiality** | ✓ Partial | RLS + Auth enabled |
| **Accountability** | ❌ No | No audit log, no DPA |

### Specific DPA 2012 Gaps

**1. Consent Collection** (NOT IMPLEMENTED)
```tsx
// Missing from the codebase:
// - Consent modal on signup
// - Explicit opt-in for location tracking
// - Purpose disclosure
// - Third-party sharing notices
```

**2. Data Retention Policy** (NOT DEFINED)
Current: Indefinite storage of:
- Location data
- Reservation history
- Payment proofs
- Review history
- Search events

**Required**: Define retention periods per data type:
```sql
-- Not implemented:
-- Location: delete after 90 days
-- Payment proofs: delete after 1 year + compliance period
-- Abandoned carts: delete after 30 days
```

**3. Data Deletion Rights** (NOT IMPLEMENTED)
Cannot find:
- User account deletion endpoint
- Automatic data purging
- GDPR/DPA right-to-be-forgotten mechanism

**4. Data Processing Agreement** (NOT VISIBLE)
- No DPA between CebSpot and Supabase documented in code
- Should specify data processor obligations
- Should list data locations and backups

---

## 8. Security & Threat Model

### Assumed Attack Vectors

**Implemented Protections**:

1. **Authentication attacks** ✓
   - Supabase Auth (email + password or social login)
   - JWT session tokens (auto-refresh)
   - RLS policies prevent unauthorized access

2. **Authorization attacks** ✓
   - Role-based access control (admin, owner, user)
   ```sql
   -- Role assignment via email
   IF lower(email) = 'testadmin@cebspot.com' THEN role = 'admin'
   IF lower(email) = 'testowner@cebspot.com' THEN role = 'owner'
   ```
   - Database RLS policies enforce:
     - Users see only public spots
     - Users can only modify own reservations
     - Owners can only modify own spots

3. **Data injection attacks** ✓
   - Using Supabase parameterized queries (no raw SQL)
   - TypeScript typing prevents most injection

4. **Payment fraud** ⚠️
   - GCash QR codes stored in database (not recommended)
   - Manual payment proof review (no automated verification)
   - No payment provider SDK (GCash API not integrated)

**NOT Protected Against**:

1. **DDoS attacks** ❌
   - No rate limiting on API calls
   - No request throttling per user
   - Supabase free tier has no DDoS protection

2. **Account takeover via email** ❌
   - No 2FA/MFA
   - No device fingerprinting
   - No unusual login alerts

3. **Fake reviews at scale** ❌
   - No ML-based content moderation
   - No rate limiting on review creation
   - No bot detection

4. **Location data harvesting** ❌
   - No rate limiting on location API calls
   - No detection of scraping patterns
   - Could enumerate all user locations

5. **SQL injection in stored procedures** ⚠️
   - RLS policies use dynamic column values:
   ```sql
   CREATE POLICY "profiles_select_owned_reservation_guests"
   USING (EXISTS (SELECT ... WHERE reservations.user_id = profiles.id ...))
   -- Could be vulnerable if not properly parameterized
   ```

### Explicit Non-Protection

Payment flow appears to rely on **manual verification**:
- User uploads payment proof (screenshot of GCash transfer)
- Owner manually reviews it
- Owner marks `payment_status = 'paid'`
- **Risk**: Owner could approve without verifying, or user could fake screenshot

---

## 9. API Failure Handling

### Failure Modes & Responses

**External API dependencies:**
- Supabase Auth (authentication)
- Supabase PostgreSQL (database)
- Supabase Storage (file uploads)
- Google Maps (routing, reverse geocoding)
- expo-location (GPS)
- react-native-maps (map rendering)

### Current Fallback Strategy

**For Supabase failures** ([spotService.ts](src/services/spotService.ts#L38)):
```tsx
async getSpots(limit = 75): Promise<Spot[]> {
  if (!hasSupabaseConfig) {
    return sampleSpots.slice(0, limit);  // ← Fallback to mock data
  }

  const { data, error } = await supabase
    .from('spots')
    .select('*')
    .eq('is_public', true)
    .limit(limit);
  
  if (error) throw error;  // ← No retry, no fallback on error
  
  return data?.length ? withLocalTestSpots(data) : sampleSpots;  // ← Fallback if empty
}
```

**For Location failures** ([useLocation.ts](src/hooks/useLocation.ts#L22)):
```tsx
try {
  const current = await Location.getCurrentPositionAsync(...);
  setLocation(nextLocation);
} catch (locationError) {
  console.warn('Location unavailable, checking last known...');
  
  const lastKnown = await Location.getLastKnownPositionAsync();
  if (lastKnown) {
    setLocation(lastKnown);  // ← Graceful fallback
    return lastKnown;
  }
  
  if (__DEV__) {
    setLocation(devFallbackLocation);  // ← Dev default: Cebu
    return devFallbackLocation;
  }
  
  setError('Unable to get your current location.');  // ← User error message
  return null;
}
```

### Missing Failure Handling

| Failure Scenario | Current Behavior | Impact |
|---|---|---|
| **Supabase auth service down** | Error thrown, app crashes | ✗ Critical |
| **Network timeout on spot query** | Error thrown, user sees nothing | ✗ Bad UX |
| **Google Maps API quota exceeded** | Route not shown | ✗ Feature unavailable |
| **Payment proof upload fails** | Exception thrown | ✗ Reservation incomplete |
| **Maps tile service fails** | Map blank | ⚠️ App still works but no map |
| **Realtime subscriptions fail** | No live updates | ✓ Acceptable (not critical) |

### Recommended Improvements

**For payment APIs:**
```tsx
// Missing - implement retry logic
async function createReservationWithRetry(
  reservation: NewReservation,
  maxRetries = 3
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await reservationService.createReservation(reservation);
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      
      const backoffMs = Math.pow(2, attempt) * 1000;  // Exponential backoff
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
}
```

**For maps:**
```tsx
// Missing - static map fallback
if (mapLoadingFailed) {
  return <StaticImageMap spot={spot} />;  // Image tile instead of interactive
}
```

**Overall score**: 3/10 - Fallbacks exist but only for demo mode

---

## 10. Role-Based Access Control (RBAC)

### Application Layer

**Role Assignment** ([authRoles.ts](src/constants/authRoles.ts)):
```tsx
export type AppRole = 'admin' | 'owner' | 'user';

export function getPrototypeRoleForEmail(email?: string | null): AppRole {
  const normalized = (email ?? '').trim().toLowerCase();
  if (normalized === 'testadmin@cebspot.com') return 'admin';
  if (normalized === 'testowner@cebspot.com') return 'owner';
  return 'user';
}

// Frontend enforces this:
export function hasAdminAccess(profile?: RoleProfile | null) {
  return profile?.role === 'admin' 
    && normalizeAuthEmail(profile.email) === 'testadmin@cebspot.com';
}

export function hasOwnerAccess(profile?: RoleProfile | null) {
  return profile?.role === 'owner' 
    && normalizeAuthEmail(profile.email) === 'testowner@cebspot.com';
}
```

**Frontend Access Control:**
- `/admin` route only rendered if `hasAdminAccess(profile)`
- `/owner-dashboard` only rendered if `hasOwnerAccess(profile)`
- Payment approval screens hidden for non-owners

### Database Layer (RLS Policies)

**Admin access** - NOT EXPLICITLY RESTRICTED IN RLS:
```sql
-- Missing: No explicit admin-only policies
-- Admin can see everything via: is_public = true
```

**Owner access** - PROPERLY RESTRICTED:
```sql
-- Owners can only modify spots they own or have delegated access to
CREATE POLICY "spots_owner_update"
  ON spots FOR UPDATE
  USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM owner_spot_access access
      WHERE access.spot_id = spots.id
        AND access.owner_id = auth.uid()
    )
  );

-- Owners can see guest reservations for their venues
CREATE POLICY "profiles_select_owned_reservation_guests"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM reservations
      JOIN spots ON spots.id = reservations.spot_id
      LEFT JOIN owner_spot_access access ON access.spot_id = reservations.spot_id
      WHERE reservations.user_id = profiles.id
        AND (spots.owner_id = auth.uid() OR access.owner_id = auth.uid())
    )
  );
```

**User access** - PROPERLY RESTRICTED:
```sql
-- Users can only see own profile
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can only create own reservations
CREATE POLICY "reservations_insert_own"
  ON reservations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

-- Users can only see own reservations
CREATE POLICY "reservations_select_own"
  ON reservations FOR SELECT
  USING (user_id = auth.uid());
```

### RBAC Maturity

| Layer | Status | Strength |
|---|---|---|
| **Authentication** | ✓ | Supabase Auth (strong) |
| **Session validation** | ✓ | JWT + auto-refresh |
| **Application-level checks** | ✓ | Email-based role verification |
| **Database-level enforcement** | ✓ | RLS policies comprehensive |
| **Cross-cutting concern (admin)** | ⚠️ | Admin access not restricted at DB layer |
| **Delegation (owner→manager)** | ✓ | `owner_spot_access` table supports managers |
| **Audit of access** | ❌ | No audit logs |
| **Dynamic role changes** | ✓ | Database trigger on email change |

**Score**: 7/10 - Strong database layer, weak admin isolation

---

## 11. Usability Metrics & Acceptance Thresholds

### Available Metrics in Code

**Search events tracking** (limited):
```sql
CREATE TABLE spot_search_events (
  user_id uuid,
  query text,
  matched_submission_id uuid,
  created_at timestamptz
);
```
This allows measuring:
- How often submissions are searched ✓
- Which submissions are most found ✓

**Activity feed** (limited):
```sql
CREATE TABLE activities (
  user_id, action, type, content,
  spot_id, created_at
);
```
Possible metrics:
- User reservations per week ✓
- Review submission rate ✓

### Missing Metrics

No code visible for tracking:
- **Engagement**: Session duration, features used, user retention
- **Conversion**: Clicks-to-reservation rate, completion rate
- **Performance**: Page load time, API response latency
- **Satisfaction**: NPS, user ratings of the app itself
- **Accessibility**: Error rates, crash reports
- **UX**: Heatmaps, scroll depth, form abandonment

### No Acceptance Thresholds Defined

Code contains NO acceptance criteria like:
```
IF weekly_active_users < 100 THEN alert
IF conversion_rate < 5% THEN alert
IF api_response_time > 500ms THEN alert
```

**Conclusion**: The app collects minimal behavioral data. No usability acceptance thresholds are implemented.

---

## 12. Technical Differentiation from Google Maps, Yelp

### CebSpot vs. Google Maps

| Feature | CebSpot | Google Maps | Differentiator |
|---|---|---|---|
| **Reservation booking** | ✓ In-app | ✗ External | CebSpot = **all-in-one** |
| **Payment processing** | ✓ GCash QR | ✓ Multiple | CebSpot = **mobile-pay** |
| **Community submissions** | ✓ Venue crowdsourcing | ✗ Edit suggestions only | CebSpot = **bottom-up content** |
| **Social circles** | ✓ Friend groups | ✗ Not native | CebSpot = **social discovery** |
| **Spot search by keyword** | ✓ Text search | ✓ Powerful | Google Maps = **more refined** |
| **Map tiles** | ✓ OSM/Mapbox | ✓ Google's own | CebSpot = **cheaper** |
| **Real-time queue info** | ✗ | ✓ | Google Maps = **superior** |
| **Offline maps** | ✗ | ✓ | Google Maps = **offline capability** |

### CebSpot vs. Yelp

| Feature | CebSpot | Yelp | Differentiator |
|---|---|---|---|
| **Instant reservation** | ✓ GCash/QR code | ✗ Call/external | CebSpot = **frictionless booking** |
| **User reputation** | ✓ Points, levels, friends | ✓ Badges, lists | CebSpot = **gamified** |
| **Review authenticity** | ⚠️ Manual reports only | ✓ Yelp's ML models | Yelp = **anti-fake** |
| **Business management** | ✓ Owner portal | ✓ Comprehensive | Yelp = **more features** |
| **Price range filter** | ✗ | ✓ | Yelp = **better filtering** |
| **Reservation integration** | ✓ Built-in | ✗ External (Resy, OpenTable) | CebSpot = **integrated** |
| **Geographic scope** | ✓ Cebu-first | ✗ Global | CebSpot = **localized focus** |

### Unique CebSpot Positioning

1. **Reservation-centric UI**: Not just reviews—book immediately
2. **Payment integration**: GCash payments without leaving app
3. **Community-driven** discovery: Upvote new spots
4. **Vertical integration**: One app for discovery → reservation → payment → review
5. **Emerging market focus**: Optimized for Philippines payment methods (no credit card required)

### Technical Gaps Preventing Dominance

- ❌ Yelp-level review authenticity (no ML fake review detection)
- ❌ Google Maps-level offline capability
- ❌ Real-time data (queue times, wait lists)
- ❌ API for third-party integrations
- ❌ Customizable price filters
- ❌ Photo organization (Yelp/Google better)

---

## 13. Multi-City Deployment Architecture

### Current State: Cebu-Centric Design

**Hardcoded Cebu center** ([app/index.tsx](app/index.tsx#L37-39)):
```tsx
const cebuRegion = {
  latitude: 10.3298,
  longitude: 123.9054,  // ← Only Cebu
};

// Default fallback in location hook
const devFallbackLocation: LocationData = {
  latitude: 10.3298,
  longitude: 123.9054,
};
```

**Sample data hardcoded** ([src/constants/sampleData.ts](src/constants/sampleData.ts)):
- All sample spots in Cebu only
- No multi-city sample data

**Schema supports multi-city**:
```sql
-- Profiles DO NOT have city_id
ALTER TABLE profiles
  ADD location JSONB,  -- Only current lat/lon, no city context
  ADD last_location_update;

-- Spots DO NOT have city_id or region
ALTER TABLE spots
  ADD latitude, longitude,  -- Only coordinates, no logical city grouping
  ADD address;
```

### Scaling to Multi-City

**Required architectural changes**:

1. **Add city context to schema**:
```sql
ALTER TABLE spots ADD city text;  -- 'Cebu', 'Manila', 'Davao'
ALTER TABLE spots ADD city_code uuid REFERENCES cities(id);

CREATE TABLE cities (
  id uuid,
  name text,
  center_lat numeric,
  center_lon numeric,
  search_radius_km int,
  timezone text
);

CREATE INDEX spots_city_idx ON spots(city);
```

2. **Multi-city search UI**:
   - City selector before map loads
   - Separate maps per city (or single map with city zoom)
   - Filter reservations by city

3. **Database scalability**:
   - Partition spots by city (PostgreSQL PARTITIONING)
   - Separate ReserveDB instances per city for reads
   - Central auth/user DB only

4. **Ops & deployment**:
   - Separate admin dashboards per city
   - City-specific phone numbers for support
   - Localized payment methods per city

### Current Readiness

**Multi-city score**: 3/10
- ✓ Database schema supports arbitrary lat/lon (could be any city)
- ✓ Distance calculations city-agnostic
- ❌ Hardcoded defaults to Cebu only
- ❌ No city selector UI
- ❌ No city context in data model
- ❌ No deployment strategy for regional infrastructure

**Timeline to enable**: 4-6 weeks
1. Week 1: Add city_id to schema, migrate data
2. Week 2: Build city selector UI, multi-map support
3. Week 3: Testing, edge cases (inter-city reservations?)
4. Week 4-6: DevOps (separate DB replicas, CDN for maps per city)

---

## Summary Table: System Readiness

| Aspect | Score | Maturity | Risk |
|---|---|---|---|
| Recommendation algorithm | 2/10 | Demo-level heuristic | HIGH - No proof of improvement |
| Fake review detection | 1/10 | Manual reporting only | CRITICAL - Vulnerable to coordinated attacks |
| Scalability (location search) | 2/10 | Works for Cebu only | HIGH - Fails at millions of venues |
| Database design | 7/10 | Well-structured, good indexes | LOW - Ready for 100K venues |
| Concurrency control | 5/10 | Partial protection | MEDIUM - Double-booking possible |
| Privacy protection | 4/10 | Basic RLS, no retention policy | MEDIUM - DPA compliance gaps |
| API failure handling | 3/10 | Sample data fallback only | MEDIUM - No proper retry logic |
| RBAC implementation | 7/10 | DB layer strong, app layer weak | LOW - Admin isolation needed |
| Usability metrics | 1/10 | None implemented | HIGH - No data-driven decisions |
| Competitive differentiation | 6/10 | Strong reservation integration | MEDIUM - Lacks anti-fraud features |
| Multi-city readiness | 3/10 | Architecture agnostic but hardcoded | MEDIUM - 4-6 weeks to enable |

---

## Recommendations

### Immediate (Security & Critical Defects)

1. **Add unique constraint on reservations**: Prevent double-booking
   ```sql
   ALTER TABLE reservations ADD UNIQUE(spot_id, reservation_date, reservation_time, status);
   ```

2. **Implement 2FA**: Reduce account takeover risk

3. **Add DPA consent**: Collect location consent on signup

### Short-term (Weeks 1-4)

4. **Implement fake review detection**: Pattern matching + ML
5. **Add exponential backoff to APIs**: Retry failed operations
6. **Partition spot data by city**: Foundation for scaling
7. **Create usability metrics dashboard**: Track engagement KPIs

### Long-term (Months 2-6)

8. **Build multi-city deployment**: Expand beyond Cebu
9. **Add spatial indexing**: Enable millions of venues
10. **Implement review authenticity scoring**: Beat Yelp's models
11. **Add real-time data**: Queue times, capacity, wait lists
