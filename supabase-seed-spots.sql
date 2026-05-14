-- CebSpot sample spots seed data
-- Run this in Supabase SQL Editor after supabase-schema.sql.
--
-- Note: the production spots.id column is uuid, so these use fixed UUIDs
-- instead of string ids like "neon-brew". The app routes will use these IDs.

alter table public.spots
  add column if not exists website_url text,
  add column if not exists contact_number text;

alter table if exists public.reviews
  add column if not exists user_name text,
  add column if not exists user_photo_url text,
  add column if not exists media_urls text[] default '{}',
  add column if not exists media_types text[] default '{}',
  add column if not exists likes_count integer not null default 0,
  add column if not exists reports_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

-- Compatibility fix for older table versions that used varchar(255).
-- The Google image URLs are longer than 255 characters, so image arrays
-- must be text[] instead of varchar(255)[].
alter table public.spots
  alter column name type text using name::text,
  alter column description type text using description::text,
  alter column category type text using category::text,
  alter column address type text using address::text,
  alter column opening_hours type text using opening_hours::text,
  alter column website_url type text using website_url::text,
  alter column contact_number type text using contact_number::text,
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
  website_url,
  contact_number,
  is_public,
  is_reservable,
  owner_id
) values
(
  '66666666-6666-4666-8666-666666666666',
  'CebSpot Cafe',
  'A warm Cebu cafe test spot for validating venue details, reservations, and contact information.',
  'Cafe',
  array['Cafe', 'Specialty Coffee'],
  'Barangay Apas, Cebu City',
  10.3306,
  123.9062,
  array[
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=900'
  ],
  4.7,
  42,
  150,
  '7:00 AM - 10:00 PM',
  'https://example.com/cebspot-cafe',
  '+63 917 555 0198',
  true,
  true,
  null
),
(
  '11111111-1111-4111-8111-111111111111',
  'Neon Brew Terminal',
  'A high-pulse specialty coffee stop in IT Park with co-working energy, live buzz, and reservation-ready tables.',
  'Specialty Coffee',
  array['Specialty Coffee', 'Co-working'],
  'Barangay Apas, Cebu City',
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
  'https://example.com/neon-brew-terminal',
  '+63 917 555 0201',
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
  'Barangay Luz, Cebu City',
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
  'https://example.com/the-terraces-garden',
  '+63 917 555 0202',
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
  'Barangay Capitol Site, Cebu City',
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
  'https://example.com/pungko-pungko-sa-fuente',
  '+63 917 555 0203',
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
  'Barangay Luz, Cebu City',
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
  'https://example.com/the-glass-hive',
  '+63 917 555 0204',
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
  'Barangay Banilad, Cebu City',
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
  'https://example.com/urban-vine',
  '+63 917 555 0205',
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
  website_url = excluded.website_url,
  contact_number = excluded.contact_number,
  is_public = excluded.is_public,
  is_reservable = excluded.is_reservable,
  updated_at = now();

-- Extra Cebu City mock spots for map density and discovery testing.
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
  website_url,
  contact_number,
  is_public,
  is_reservable,
  owner_id
)
select
  ('90000000-0000-4000-8000-' || lpad(seq::text, 12, '0'))::uuid,
  name,
  'Mock Cebu City ' || lower(category) || ' spot for map and discovery testing around ' || address || '.',
  category,
  array[category, extra_category],
  address,
  latitude,
  longitude,
  case category
    when 'Specialty Coffee' then array['https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=900']
    when 'Cafe' then array['https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=900']
    when 'Restaurant' then array['https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=900']
    when 'Street Food' then array['https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&q=80&w=900']
    when 'Outdoor' then array['https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&q=80&w=900']
    when 'Bar' then array['https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&q=80&w=900']
    else array['https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&q=80&w=900']
  end,
  rating,
  review_count,
  0,
  opening_hours,
  'https://example.com/mock-cebu-' || lpad(seq::text, 3, '0'),
  '+63 917 555 ' || lpad((3000 + seq)::text, 4, '0'),
  true,
  is_reservable,
  null
from (values
  (1, 'Lahug Grind House', 'Specialty Coffee', 'Co-working', 'Barangay Lahug, Cebu City', 10.3291, 123.9042, 4.6, 88, true, '7:00 AM - 10:00 PM'),
  (2, 'JY Corner Bites', 'Street Food', 'Local', 'Barangay Lahug, Cebu City', 10.3322, 123.8999, 4.2, 64, false, '3:00 PM - 12:00 AM'),
  (3, 'IT Park Study Table', 'Co-working', 'Specialty Coffee', 'Barangay Apas, Cebu City', 10.3308, 123.9075, 4.7, 112, true, '8:00 AM - 1:00 AM'),
  (4, 'Garden Bloc Social', 'Social Hub', 'Outdoor', 'Barangay Apas, Cebu City', 10.3333, 123.9079, 4.5, 143, true, '10:00 AM - 12:00 AM'),
  (5, 'Banilad Roastery', 'Specialty Coffee', 'Cafe', 'Barangay Banilad, Cebu City', 10.3402, 123.9117, 4.8, 96, true, '7:00 AM - 9:00 PM'),
  (6, 'Streetside Talamban BBQ', 'Street Food', 'Local', 'Barangay Talamban, Cebu City', 10.3711, 123.9142, 4.3, 77, false, '4:00 PM - 11:30 PM'),
  (7, 'Talamban Quiet Cafe', 'Cafe', 'Study', 'Barangay Talamban, Cebu City', 10.3695, 123.9121, 4.4, 51, false, '8:00 AM - 10:00 PM'),
  (8, 'Country Mall Lunch Stop', 'Restaurant', 'Family', 'Barangay Banilad, Cebu City', 10.3448, 123.9138, 4.1, 59, true, '10:00 AM - 9:00 PM'),
  (9, 'Kasambagan Night Nook', 'Bar', 'Chill Vibe', 'Barangay Kasambagan, Cebu City', 10.3295, 123.9188, 4.4, 83, true, '5:00 PM - 2:00 AM'),
  (10, 'Mabolo Courtyard', 'Outdoor', 'Social Hub', 'Barangay Mabolo, Cebu City', 10.3218, 123.9149, 4.5, 71, true, '9:00 AM - 11:00 PM'),
  (11, 'Mabolo Espresso Lane', 'Specialty Coffee', 'Cafe', 'Barangay Mabolo, Cebu City', 10.3205, 123.9124, 4.6, 69, false, '7:30 AM - 9:30 PM'),
  (12, 'Cebu Business Park Deli', 'Restaurant', 'Social Hub', 'Barangay Luz, Cebu City', 10.3189, 123.9049, 4.3, 118, true, '9:00 AM - 10:00 PM'),
  (13, 'Ayala Pocket Garden', 'Outdoor', 'Garden', 'Barangay Luz, Cebu City', 10.3176, 123.9068, 4.4, 72, false, '8:00 AM - 9:00 PM'),
  (14, 'Archbishop Reyes Brew', 'Cafe', 'Specialty Coffee', 'Barangay Kamputhaw, Cebu City', 10.3163, 123.9032, 4.5, 92, true, '7:00 AM - 10:00 PM'),
  (15, 'Escario Supper Club', 'Restaurant', 'Social Hub', 'Barangay Kamputhaw, Cebu City', 10.3144, 123.8974, 4.5, 106, true, '11:00 AM - 11:00 PM'),
  (16, 'Capitol Commons Coffee', 'Specialty Coffee', 'Co-working', 'Barangay Capitol Site, Cebu City', 10.3151, 123.8916, 4.7, 101, true, '7:00 AM - 11:00 PM'),
  (17, 'Capitol Eats Corner', 'Street Food', 'Local', 'Barangay Sambag II, Cebu City', 10.3149, 123.8894, 4.1, 58, false, '5:00 PM - 12:00 AM'),
  (18, 'Fuente Circle Cafe', 'Cafe', 'Social Hub', 'Barangay Capitol Site, Cebu City', 10.3109, 123.8935, 4.3, 134, false, '8:00 AM - 12:00 AM'),
  (19, 'Jones Avenue Grill', 'Restaurant', 'Local', 'Barangay Santa Cruz, Cebu City', 10.3067, 123.8958, 4.2, 74, true, '10:00 AM - 10:00 PM'),
  (20, 'Colon Heritage Bites', 'Street Food', 'Heritage', 'Barangay Kalubihan, Cebu City', 10.2964, 123.8987, 4.0, 128, false, '9:00 AM - 11:00 PM'),
  (21, 'Carbon Market Skewers', 'Street Food', 'Market', 'Barangay Ermita, Cebu City', 10.2932, 123.9009, 4.1, 151, false, '6:00 AM - 10:00 PM'),
  (22, 'Sto Nino Courtyard', 'Outdoor', 'Heritage', 'Barangay Santo Nino, Cebu City', 10.2947, 123.9028, 4.4, 63, false, '8:00 AM - 8:00 PM'),
  (23, 'Pier One Coffee Stop', 'Cafe', 'Quick Stop', 'Barangay Tinago, Cebu City', 10.3003, 123.9141, 4.0, 42, false, '6:00 AM - 8:00 PM'),
  (24, 'North Reclamation Hangout', 'Social Hub', 'Outdoor', 'Barangay Mabolo, Cebu City', 10.3127, 123.9169, 4.3, 89, true, '10:00 AM - 12:00 AM'),
  (25, 'SM City Food Hall', 'Restaurant', 'Family', 'Barangay Mabolo, Cebu City', 10.3117, 123.9185, 4.2, 94, true, '10:00 AM - 9:00 PM'),
  (26, 'Hipodromo Snack Row', 'Street Food', 'Local', 'Barangay Hipodromo, Cebu City', 10.3162, 123.9151, 4.0, 55, false, '4:00 PM - 11:00 PM'),
  (27, 'Tejero Social House', 'Social Hub', 'Chill Vibe', 'Barangay Tejero, Cebu City', 10.3049, 123.9053, 4.2, 61, false, '2:00 PM - 11:00 PM'),
  (28, 'V. Rama Comfort Meals', 'Restaurant', 'Local', 'Barangay Calamba, Cebu City', 10.3031, 123.8858, 4.3, 66, true, '10:00 AM - 10:00 PM'),
  (29, 'Guadalupe Hill Cafe', 'Cafe', 'Outdoor', 'Barangay Guadalupe, Cebu City', 10.3239, 123.8832, 4.5, 78, false, '8:00 AM - 9:00 PM'),
  (30, 'Guadalupe Grill Stop', 'Restaurant', 'Local', 'Barangay Guadalupe, Cebu City', 10.3208, 123.8815, 4.1, 84, true, '11:00 AM - 11:00 PM'),
  (31, 'Tisa Siomai Strip', 'Street Food', 'Local', 'Barangay Tisa, Cebu City', 10.2948, 123.8765, 4.4, 181, false, '3:00 PM - 12:00 AM'),
  (32, 'Labangon Corner Cafe', 'Cafe', 'Study', 'Barangay Labangon, Cebu City', 10.2997, 123.8834, 4.2, 47, false, '7:30 AM - 9:00 PM'),
  (33, 'Punta Princesa Family Diner', 'Restaurant', 'Family', 'Barangay Punta Princesa, Cebu City', 10.2876, 123.8819, 4.2, 73, true, '10:00 AM - 10:00 PM'),
  (34, 'Pardo Evening BBQ', 'Street Food', 'Local', 'Barangay Poblacion Pardo, Cebu City', 10.2773, 123.8568, 4.1, 82, false, '4:00 PM - 12:00 AM'),
  (35, 'Bulacao South Cafe', 'Cafe', 'Quick Stop', 'Barangay Bulacao, Cebu City', 10.2708, 123.8489, 4.0, 36, false, '7:00 AM - 8:00 PM'),
  (36, 'Mambaling Food Yard', 'Street Food', 'Social Hub', 'Barangay Mambaling, Cebu City', 10.2865, 123.8791, 4.3, 121, false, '4:00 PM - 1:00 AM'),
  (37, 'South Road Terrace', 'Outdoor', 'Social Hub', 'Barangay Mambaling, Cebu City', 10.2824, 123.9067, 4.5, 67, true, '4:00 PM - 11:00 PM'),
  (38, 'Il Corso Seaside Table', 'Restaurant', 'Outdoor', 'Barangay Mambaling, Cebu City', 10.2709, 123.9054, 4.6, 88, true, '10:00 AM - 11:00 PM'),
  (39, 'SRP Sunset Coffee', 'Specialty Coffee', 'Outdoor', 'Barangay Mambaling, Cebu City', 10.2768, 123.9079, 4.4, 52, false, '8:00 AM - 10:00 PM'),
  (40, 'Inayawan Market Grill', 'Street Food', 'Market', 'Barangay Inayawan, Cebu City', 10.2624, 123.8433, 4.0, 62, false, '5:00 AM - 9:00 PM'),
  (41, 'Quiot Neighborhood Cafe', 'Cafe', 'Local', 'Barangay Quiot, Cebu City', 10.2829, 123.8608, 4.1, 38, false, '7:00 AM - 8:30 PM'),
  (42, 'Sambag Study Lounge', 'Co-working', 'Cafe', 'Barangay Sambag I, Cebu City', 10.3048, 123.8912, 4.5, 79, true, '8:00 AM - 12:00 AM'),
  (43, 'Urgello Rice Bowls', 'Restaurant', 'Budget', 'Barangay Sambag I, Cebu City', 10.3021, 123.8943, 4.0, 57, false, '9:00 AM - 9:00 PM'),
  (44, 'Ramos Night Cafe', 'Cafe', 'Chill Vibe', 'Barangay Cogon Ramos, Cebu City', 10.3079, 123.8952, 4.3, 69, false, '9:00 AM - 1:00 AM'),
  (45, 'Junquera Student Bites', 'Street Food', 'Budget', 'Barangay Kamagayan, Cebu City', 10.3006, 123.8989, 4.0, 93, false, '10:00 AM - 11:00 PM'),
  (46, 'Kamputhaw Wine Room', 'Bar', 'Chill Vibe', 'Barangay Kamputhaw, Cebu City', 10.3157, 123.8986, 4.4, 48, true, '5:00 PM - 1:00 AM'),
  (47, 'Zapatera Coffee Window', 'Specialty Coffee', 'Quick Stop', 'Barangay Zapatera, Cebu City', 10.3033, 123.9021, 4.2, 41, false, '7:00 AM - 7:00 PM'),
  (48, 'Lorega Market Meals', 'Street Food', 'Market', 'Barangay Lorega San Miguel, Cebu City', 10.3065, 123.9017, 4.0, 65, false, '6:00 AM - 9:00 PM'),
  (49, 'Carreta Warehouse Bar', 'Bar', 'Social Hub', 'Barangay Carreta, Cebu City', 10.3105, 123.9089, 4.3, 72, true, '6:00 PM - 2:00 AM'),
  (50, 'Mango Avenue Social', 'Social Hub', 'Bar', 'Barangay Kamputhaw, Cebu City', 10.3106, 123.8995, 4.5, 119, true, '4:00 PM - 2:00 AM'),
  (51, 'Luz Parkside Cafe', 'Cafe', 'Outdoor', 'Barangay Luz, Cebu City', 10.3242, 123.9026, 4.2, 44, false, '7:30 AM - 9:00 PM'),
  (52, 'Apas Pocket Diner', 'Restaurant', 'Local', 'Barangay Apas, Cebu City', 10.3374, 123.9036, 4.1, 58, true, '10:00 AM - 10:00 PM'),
  (53, 'Busay View Deck Cafe', 'Outdoor', 'Cafe', 'Barangay Busay, Cebu City', 10.3692, 123.8825, 4.7, 133, true, '7:00 AM - 11:00 PM'),
  (54, 'Beverly Hills Tea Garden', 'Outdoor', 'Cafe', 'Barangay Lahug, Cebu City', 10.3426, 123.8896, 4.6, 86, true, '8:00 AM - 10:00 PM'),
  (55, 'Sirao Road Snack View', 'Outdoor', 'Street Food', 'Barangay Sirao, Cebu City', 10.4102, 123.8786, 4.4, 74, false, '8:00 AM - 8:00 PM')
) as mock(seq, name, category, extra_category, address, latitude, longitude, rating, review_count, is_reservable, opening_hours)
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
  website_url = excluded.website_url,
  contact_number = excluded.contact_number,
  is_public = excluded.is_public,
  is_reservable = excluded.is_reservable,
  updated_at = now();

-- Mock reviews with photos. These require at least one row in public.profiles
-- because reviews.user_id references profiles(id).
with seeded_profiles as (
  select id, display_name, photo_url
  from public.profiles
  order by created_at, id
  limit 5
),
reviewers as (
  select
    id,
    coalesce(display_name, 'CebSpot Explorer') as user_name,
    photo_url,
    row_number() over (order by id) as reviewer_rank,
    count(*) over () as reviewer_count
  from seeded_profiles
),
seeded_spots as (
  select
    id,
    images,
    coalesce(rating, 4.2) as rating,
    row_number() over (order by id) as spot_rank
  from public.spots
  where id in (
    '66666666-6666-4666-8666-666666666666',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555'
  )
  or id::text like '90000000-0000-4000-8000-%'
),
review_rows as (
  select
    md5(spot.id::text || '-review-' || review_no)::uuid as id,
    spot.id as spot_id,
    reviewer.id as user_id,
    reviewer.user_name,
    reviewer.photo_url as user_photo_url,
    least(5.0, greatest(1.0, spot.rating - 0.2 + (review_no * 0.15))) as rating,
    case ((spot.spot_rank + review_no) % 5)
      when 0 then 'Good find for a quick Cebu stop. The place matched the pinned location and the vibe felt easy to recommend.'
      when 1 then 'Dropped by with friends and the photos are accurate. Nice crowd, easy access, and worth saving for later.'
      when 2 then 'Clean setup and solid local energy. I would come back here when I am around the barangay again.'
      when 3 then 'The spot was easy to locate from the map. Cozy enough for a short hangout and the staff were welcoming.'
      else 'Nice atmosphere and a photogenic corner. Good test spot for checking reviews, images, and map pins.'
    end as comment,
    array[
      coalesce(
        spot.images[review_no],
        spot.images[1],
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=700'
      )
    ] as media_urls,
    array['image'] as media_types,
    4 + ((spot.spot_rank + review_no * 3) % 18) as likes_count,
    0 as reports_count,
    now() - ((45 + spot.spot_rank * 28 + review_no * 90) || ' minutes')::interval as created_at
  from seeded_spots spot
  cross join generate_series(1, 2) as review_no
  join reviewers reviewer
    on reviewer.reviewer_rank = (((spot.spot_rank + review_no - 2) % reviewer.reviewer_count) + 1)
)
insert into public.reviews (
  id,
  spot_id,
  user_id,
  user_name,
  user_photo_url,
  rating,
  comment,
  media_urls,
  media_types,
  likes_count,
  reports_count,
  created_at
)
select
  id,
  spot_id,
  user_id,
  user_name,
  user_photo_url,
  rating,
  comment,
  media_urls,
  media_types,
  likes_count,
  reports_count,
  created_at
from review_rows
on conflict (id) do update set
  user_name = excluded.user_name,
  user_photo_url = excluded.user_photo_url,
  rating = excluded.rating,
  comment = excluded.comment,
  media_urls = excluded.media_urls,
  media_types = excluded.media_types,
  likes_count = excluded.likes_count,
  reports_count = excluded.reports_count,
  updated_at = now();

-- Local Updates feed seed data. These are the FYP-style community cards shown
-- in Activity, and submitted spots will add more rows here.
insert into public.local_updates (
  id,
  user_id,
  user_name,
  user_photo_url,
  title,
  body,
  location_name,
  latitude,
  longitude,
  image_url,
  spot_count,
  comments_count,
  source_type,
  source_id,
  created_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    null,
    'Clyde Hans Sadudaquil',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=160',
    'Nature spot',
    'Kalma nga pahangin!',
    'Lahug',
    10.3390,
    123.8990,
    'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=900',
    1,
    0,
    'recommendation',
    null,
    now()
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    null,
    'Joshua Eniceta III',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=160',
    'VIP Club Access',
    'Private tables, bottle service, and kusog nga weekend crowd.',
    'IT Park',
    10.3308,
    123.9075,
    'https://images.unsplash.com/photo-1571266028243-d220c9c3a1c8?auto=format&fit=crop&q=80&w=900',
    12,
    8,
    'recommendation',
    null,
    now() - interval '1 day'
  )
on conflict (id) do update set
  user_name = excluded.user_name,
  user_photo_url = excluded.user_photo_url,
  title = excluded.title,
  body = excluded.body,
  location_name = excluded.location_name,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  image_url = excluded.image_url,
  spot_count = excluded.spot_count,
  comments_count = excluded.comments_count,
  source_type = excluded.source_type,
  source_id = excluded.source_id,
  updated_at = now();
