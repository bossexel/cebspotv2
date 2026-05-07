-- CebSpot sample spots seed data
-- Run this in Supabase SQL Editor after supabase-schema.sql.
--
-- Note: the production spots.id column is uuid, so these use fixed UUIDs
-- instead of string ids like "neon-brew". The app routes will use these IDs.

-- Compatibility fix for older table versions that used varchar(255).
-- The Google image URLs are longer than 255 characters, so image arrays
-- must be text[] instead of varchar(255)[].
alter table public.spots
  alter column name type text using name::text,
  alter column description type text using description::text,
  alter column category type text using category::text,
  alter column address type text using address::text,
  alter column opening_hours type text using opening_hours::text,
  alter column images type text[] using images::text[],
  alter column categories type text[] using categories::text[];

insert into public.spots (
  id,
  name,
  description,
  category,
  categories,
  address,
  latitude,
  longitude,
  images,
  rating,
  review_count,
  reservation_fee,
  opening_hours,
  is_public,
  is_reservable,
  owner_id
) values
(
  '11111111-1111-4111-8111-111111111111',
  'Neon Brew Terminal',
  'A high-pulse specialty coffee stop in IT Park with co-working energy, live buzz, and reservation-ready tables.',
  'Specialty Coffee',
  array['Specialty Coffee', 'Co-working'],
  'IT Park, Lahug',
  10.3298,
  123.9054,
  array[
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCXjXIxwOrMObulKP0j1P9xy89HbgvjdqPv7DBv-uEXlP0QTvOQJYO6LoyLRe0Dvmk4EgzwH4Cpxv8KudK1l69QnnQou6_iO0-H3pnssKPm7hl6N9jGlodEbPolx8wfud_MVhJQA6RheDdMgtQ7cisVgkxaxyvi4egVja48dmFDSCy2dZw48EprPmBqQC-ZnZVjH20K4lnxSX089N42rm3gL--J9NqyTUiqIvgvElWZ9Mh6jcGOidPNC5r0uCkgryb_Rea3AV-ZvpFz',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=900'
  ],
  4.8,
  1250,
  250,
  '8:00 AM - 11:00 PM',
  true,
  true,
  null
),
(
  '22222222-2222-4222-8222-222222222222',
  'The Terraces Garden',
  'An outdoor garden spot around Ayala Center with greenery, polished dining energy, and relaxed city air.',
  'Outdoor',
  array['Garden', 'Fine Dining'],
  'Ayala Center, Cebu City',
  10.3175,
  123.9051,
  array[
    'https://lh3.googleusercontent.com/aida-public/AB6AXuBe90IMOQq-EWE-2Kcj9Rc7y8w61Sm_CeAeFQ2EJ8BuQL_jB_5ZuTCafNBzrvnjql_Wv2NOoRcwc0p-i3ScbGQky-cZsUR5juzCduAgEkma0xziB1kExBRtsZ-_gWZttHiC4BZjIq0E9eoSBHSEpNefGzE8hvzOde1sQQxOa0t-tn0C_xNr252Leh6FE5Hzo_Ppf4u4VgpL6bq2MS93uC1u4FYdQ2n-L5WwTLkQc5xKp9dF5bLdYZEAiIz6qa6l8srrnk2WWcobIhvE',
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&q=80&w=900'
  ],
  4.5,
  750,
  200,
  '10:00 AM - 10:00 PM',
  true,
  false,
  null
),
(
  '33333333-3333-4333-8333-333333333333',
  'Pungko-Pungko sa Fuente',
  'A local street food favorite near Fuente Osmena with budget bites and late-night Cebu energy.',
  'Street Food',
  array['Budget', 'Local'],
  'Fuente Osmena, Cebu City',
  10.3117,
  123.8931,
  array[
    'https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&q=80&w=600',
    'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80&w=900'
  ],
  4.2,
  350,
  0,
  '4:00 PM - 1:00 AM',
  true,
  false,
  null
),
(
  '44444444-4444-4444-8444-444444444444',
  'The Glass Hive',
  'A modern social hub in Cebu Business Park with co-working corners and a clean city-lounge feel.',
  'Social Hub',
  array['Co-working', 'Modern'],
  'Business Park, Cebu',
  10.3200,
  123.9000,
  array[
    'https://lh3.googleusercontent.com/aida-public/AB6AXuA5n9PuocppNERXw2bZW9mPsNv5Uq0Hhg14ve39rSo6MuMLISME-qZ7CZKA6jm7BCw-3F-wbC5i4PEZ5KNCa92bFs9yTa-bqnu61kHPxI8N-YZa0uahwUtCp_joNipueZ8PFci27Hegsr3tRG2KHBwhkzu-P7e0sbrejODOvmQwCXr7V2hKR4nB6cFVvgQDTuQn69yKindQe68fWH5t9l3Yj1_9M8MaJBdh5ZdFlNexXB61B3I0UO84iuwiloey5ajeVx3GWDixRdrs',
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&q=80&w=900'
  ],
  4.6,
  150,
  150,
  '9:00 AM - 10:00 PM',
  true,
  false,
  null
),
(
  '55555555-5555-4555-8555-555555555555',
  'Urban Vine',
  'A Banilad social spot with greenery, calm interiors, and a relaxed meet-up atmosphere.',
  'Social Hub',
  array['Social', 'Greenery'],
  'Banilad, Cebu City',
  10.3350,
  123.9100,
  array[
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=600',
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&q=80&w=900'
  ],
  4.4,
  120,
  120,
  '8:00 AM - 10:00 PM',
  true,
  false,
  null
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  categories = excluded.categories,
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  images = excluded.images,
  rating = excluded.rating,
  review_count = excluded.review_count,
  reservation_fee = excluded.reservation_fee,
  opening_hours = excluded.opening_hours,
  is_public = excluded.is_public,
  is_reservable = excluded.is_reservable,
  updated_at = now();
