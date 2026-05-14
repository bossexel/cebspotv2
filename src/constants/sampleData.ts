import type { Activity, Circle, Reservation, Review, Spot } from '../types';

const featuredSpots: Spot[] = [
  {
    id: 'cebspot-cafe',
    name: 'CebSpot Cafe',
    description: 'A warm Cebu cafe test spot for validating venue details, reservations, and contact information.',
    category: 'Cafe',
    categories: ['Cafe', 'Specialty Coffee'],
    address: 'Barangay Apas, Cebu City',
    latitude: 10.3306,
    longitude: 123.9062,
    images: [
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=900',
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=900',
      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=900',
      'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&q=80&w=900',
      'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&q=80&w=900',
      'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=900',
    ],
    rating: 4.7,
    review_count: 42,
    reservation_type: 'paid',
    reservation_fee: 150,
    payment_required: true,
    opening_hours: '7:00 AM - 10:00 PM',
    website_url: 'https://example.com/cebspot-cafe',
    contact_number: '+63 917 555 0198',
    is_public: true,
    is_reservable: true,
    owner_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'neon-brew',
    name: 'Neon Brew Terminal',
    description: 'High-energy specialty coffee, deep focus corners, and warm city glow in IT Park.',
    category: 'Specialty Coffee',
    categories: ['Specialty Coffee', 'Co-working'],
    address: 'Barangay Apas, Cebu City',
    latitude: 10.3298,
    longitude: 123.9054,
    images: [
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=900',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=900',
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=900',
    ],
    rating: 4.8,
    review_count: 125,
    reservation_type: 'paid',
    reservation_fee: 250,
    payment_required: true,
    opening_hours: '8:00 AM - 11:00 PM',
    website_url: 'https://example.com/neon-brew-terminal',
    contact_number: '+63 917 555 0201',
    is_public: true,
    is_reservable: true,
    owner_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'terraces-garden',
    name: 'The Terraces Garden',
    description: 'An airy garden venue with relaxed seating, greenery, and polished event energy.',
    category: 'Outdoor',
    categories: ['Outdoor', 'Social Hub'],
    address: 'Barangay Luz, Cebu City',
    latitude: 10.3175,
    longitude: 123.9051,
    images: [
      'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=900',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&q=80&w=900',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&q=80&w=900',
    ],
    rating: 4.5,
    review_count: 95,
    reservation_type: 'paid',
    reservation_fee: 200,
    payment_required: true,
    opening_hours: '10:00 AM - 10:00 PM',
    website_url: 'https://example.com/the-terraces-garden',
    contact_number: '+63 917 555 0202',
    is_public: true,
    is_reservable: true,
    owner_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'fuente-street',
    name: 'Fuente Street Table',
    description: 'A favorite local street food stop near Fuente with quick bites and late-night buzz.',
    category: 'Street Food',
    categories: ['Street Food'],
    address: 'Barangay Capitol Site, Cebu City',
    latitude: 10.3117,
    longitude: 123.8931,
    images: [
      'https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&q=80&w=900',
      'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&q=80&w=900',
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80&w=900',
    ],
    rating: 4.2,
    review_count: 230,
    reservation_type: 'free',
    reservation_fee: 0,
    payment_required: false,
    opening_hours: '4:00 PM - 1:00 AM',
    website_url: 'https://example.com/fuente-street-table',
    contact_number: '+63 917 555 0203',
    is_public: true,
    is_reservable: false,
    owner_id: null,
    created_at: new Date().toISOString(),
  },
];

const sampleCreatedAt = new Date().toISOString();
const fallbackReviewImage =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=700';

const mockSpotImages: Record<string, string[]> = {
  'Specialty Coffee': [
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=900',
  ],
  Cafe: [
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&q=80&w=900',
  ],
  Restaurant: [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=900',
  ],
  'Street Food': [
    'https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&q=80&w=900',
  ],
  Outdoor: [
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=900',
  ],
  Bar: [
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&q=80&w=900',
  ],
  'Social Hub': [
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&q=80&w=900',
  ],
  'Co-working': [
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&q=80&w=900',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&q=80&w=900',
  ],
};

const cebuMockSpotSeeds = [
  ['mock-cebu-001', 'Lahug Grind House', 'Specialty Coffee', ['Specialty Coffee', 'Co-working'], 'Barangay Lahug, Cebu City', 10.3291, 123.9042, 4.6, 88, true, '7:00 AM - 10:00 PM'],
  ['mock-cebu-002', 'JY Corner Bites', 'Street Food', ['Street Food', 'Local'], 'Barangay Lahug, Cebu City', 10.3322, 123.8999, 4.2, 64, false, '3:00 PM - 12:00 AM'],
  ['mock-cebu-003', 'IT Park Study Table', 'Co-working', ['Co-working', 'Specialty Coffee'], 'Barangay Apas, Cebu City', 10.3308, 123.9075, 4.7, 112, true, '8:00 AM - 1:00 AM'],
  ['mock-cebu-004', 'Garden Bloc Social', 'Social Hub', ['Social Hub', 'Outdoor'], 'Barangay Apas, Cebu City', 10.3333, 123.9079, 4.5, 143, true, '10:00 AM - 12:00 AM'],
  ['mock-cebu-005', 'Banilad Roastery', 'Specialty Coffee', ['Specialty Coffee', 'Cafe'], 'Barangay Banilad, Cebu City', 10.3402, 123.9117, 4.8, 96, true, '7:00 AM - 9:00 PM'],
  ['mock-cebu-006', 'Streetside Talamban BBQ', 'Street Food', ['Street Food', 'Local'], 'Barangay Talamban, Cebu City', 10.3711, 123.9142, 4.3, 77, false, '4:00 PM - 11:30 PM'],
  ['mock-cebu-007', 'Talamban Quiet Cafe', 'Cafe', ['Cafe', 'Study'], 'Barangay Talamban, Cebu City', 10.3695, 123.9121, 4.4, 51, false, '8:00 AM - 10:00 PM'],
  ['mock-cebu-008', 'Country Mall Lunch Stop', 'Restaurant', ['Restaurant', 'Family'], 'Barangay Banilad, Cebu City', 10.3448, 123.9138, 4.1, 59, true, '10:00 AM - 9:00 PM'],
  ['mock-cebu-009', 'Kasambagan Night Nook', 'Bar', ['Bar', 'Chill Vibe'], 'Barangay Kasambagan, Cebu City', 10.3295, 123.9188, 4.4, 83, true, '5:00 PM - 2:00 AM'],
  ['mock-cebu-010', 'Mabolo Courtyard', 'Outdoor', ['Outdoor', 'Social Hub'], 'Barangay Mabolo, Cebu City', 10.3218, 123.9149, 4.5, 71, true, '9:00 AM - 11:00 PM'],
  ['mock-cebu-011', 'Mabolo Espresso Lane', 'Specialty Coffee', ['Specialty Coffee', 'Cafe'], 'Barangay Mabolo, Cebu City', 10.3205, 123.9124, 4.6, 69, false, '7:30 AM - 9:30 PM'],
  ['mock-cebu-012', 'Cebu Business Park Deli', 'Restaurant', ['Restaurant', 'Social Hub'], 'Barangay Luz, Cebu City', 10.3189, 123.9049, 4.3, 118, true, '9:00 AM - 10:00 PM'],
  ['mock-cebu-013', 'Ayala Pocket Garden', 'Outdoor', ['Outdoor', 'Garden'], 'Barangay Luz, Cebu City', 10.3176, 123.9068, 4.4, 72, false, '8:00 AM - 9:00 PM'],
  ['mock-cebu-014', 'Archbishop Reyes Brew', 'Cafe', ['Cafe', 'Specialty Coffee'], 'Barangay Kamputhaw, Cebu City', 10.3163, 123.9032, 4.5, 92, true, '7:00 AM - 10:00 PM'],
  ['mock-cebu-015', 'Escario Supper Club', 'Restaurant', ['Restaurant', 'Social Hub'], 'Barangay Kamputhaw, Cebu City', 10.3144, 123.8974, 4.5, 106, true, '11:00 AM - 11:00 PM'],
  ['mock-cebu-016', 'Capitol Commons Coffee', 'Specialty Coffee', ['Specialty Coffee', 'Co-working'], 'Barangay Capitol Site, Cebu City', 10.3151, 123.8916, 4.7, 101, true, '7:00 AM - 11:00 PM'],
  ['mock-cebu-017', 'Capitol Eats Corner', 'Street Food', ['Street Food', 'Local'], 'Barangay Sambag II, Cebu City', 10.3149, 123.8894, 4.1, 58, false, '5:00 PM - 12:00 AM'],
  ['mock-cebu-018', 'Fuente Circle Cafe', 'Cafe', ['Cafe', 'Social Hub'], 'Barangay Capitol Site, Cebu City', 10.3109, 123.8935, 4.3, 134, false, '8:00 AM - 12:00 AM'],
  ['mock-cebu-019', 'Jones Avenue Grill', 'Restaurant', ['Restaurant', 'Local'], 'Barangay Santa Cruz, Cebu City', 10.3067, 123.8958, 4.2, 74, true, '10:00 AM - 10:00 PM'],
  ['mock-cebu-020', 'Colon Heritage Bites', 'Street Food', ['Street Food', 'Heritage'], 'Barangay Kalubihan, Cebu City', 10.2964, 123.8987, 4.0, 128, false, '9:00 AM - 11:00 PM'],
  ['mock-cebu-021', 'Carbon Market Skewers', 'Street Food', ['Street Food', 'Market'], 'Barangay Ermita, Cebu City', 10.2932, 123.9009, 4.1, 151, false, '6:00 AM - 10:00 PM'],
  ['mock-cebu-022', 'Sto Nino Courtyard', 'Outdoor', ['Outdoor', 'Heritage'], 'Barangay Santo Nino, Cebu City', 10.2947, 123.9028, 4.4, 63, false, '8:00 AM - 8:00 PM'],
  ['mock-cebu-023', 'Pier One Coffee Stop', 'Cafe', ['Cafe', 'Quick Stop'], 'Barangay Tinago, Cebu City', 10.3003, 123.9141, 4.0, 42, false, '6:00 AM - 8:00 PM'],
  ['mock-cebu-024', 'North Reclamation Hangout', 'Social Hub', ['Social Hub', 'Outdoor'], 'Barangay Mabolo, Cebu City', 10.3127, 123.9169, 4.3, 89, true, '10:00 AM - 12:00 AM'],
  ['mock-cebu-025', 'SM City Food Hall', 'Restaurant', ['Restaurant', 'Family'], 'Barangay Mabolo, Cebu City', 10.3117, 123.9185, 4.2, 94, true, '10:00 AM - 9:00 PM'],
  ['mock-cebu-026', 'Hipodromo Snack Row', 'Street Food', ['Street Food', 'Local'], 'Barangay Hipodromo, Cebu City', 10.3162, 123.9151, 4.0, 55, false, '4:00 PM - 11:00 PM'],
  ['mock-cebu-027', 'Tejero Social House', 'Social Hub', ['Social Hub', 'Chill Vibe'], 'Barangay Tejero, Cebu City', 10.3049, 123.9053, 4.2, 61, false, '2:00 PM - 11:00 PM'],
  ['mock-cebu-028', 'V. Rama Comfort Meals', 'Restaurant', ['Restaurant', 'Local'], 'Barangay Calamba, Cebu City', 10.3031, 123.8858, 4.3, 66, true, '10:00 AM - 10:00 PM'],
  ['mock-cebu-029', 'Guadalupe Hill Cafe', 'Cafe', ['Cafe', 'Outdoor'], 'Barangay Guadalupe, Cebu City', 10.3239, 123.8832, 4.5, 78, false, '8:00 AM - 9:00 PM'],
  ['mock-cebu-030', 'Guadalupe Grill Stop', 'Restaurant', ['Restaurant', 'Local'], 'Barangay Guadalupe, Cebu City', 10.3208, 123.8815, 4.1, 84, true, '11:00 AM - 11:00 PM'],
  ['mock-cebu-031', 'Tisa Siomai Strip', 'Street Food', ['Street Food', 'Local'], 'Barangay Tisa, Cebu City', 10.2948, 123.8765, 4.4, 181, false, '3:00 PM - 12:00 AM'],
  ['mock-cebu-032', 'Labangon Corner Cafe', 'Cafe', ['Cafe', 'Study'], 'Barangay Labangon, Cebu City', 10.2997, 123.8834, 4.2, 47, false, '7:30 AM - 9:00 PM'],
  ['mock-cebu-033', 'Punta Princesa Family Diner', 'Restaurant', ['Restaurant', 'Family'], 'Barangay Punta Princesa, Cebu City', 10.2876, 123.8819, 4.2, 73, true, '10:00 AM - 10:00 PM'],
  ['mock-cebu-034', 'Pardo Evening BBQ', 'Street Food', ['Street Food', 'Local'], 'Barangay Poblacion Pardo, Cebu City', 10.2773, 123.8568, 4.1, 82, false, '4:00 PM - 12:00 AM'],
  ['mock-cebu-035', 'Bulacao South Cafe', 'Cafe', ['Cafe', 'Quick Stop'], 'Barangay Bulacao, Cebu City', 10.2708, 123.8489, 4.0, 36, false, '7:00 AM - 8:00 PM'],
  ['mock-cebu-036', 'Mambaling Food Yard', 'Street Food', ['Street Food', 'Social Hub'], 'Barangay Mambaling, Cebu City', 10.2865, 123.8791, 4.3, 121, false, '4:00 PM - 1:00 AM'],
  ['mock-cebu-037', 'South Road Terrace', 'Outdoor', ['Outdoor', 'Social Hub'], 'Barangay Mambaling, Cebu City', 10.2824, 123.9067, 4.5, 67, true, '4:00 PM - 11:00 PM'],
  ['mock-cebu-038', 'Il Corso Seaside Table', 'Restaurant', ['Restaurant', 'Outdoor'], 'Barangay Mambaling, Cebu City', 10.2709, 123.9054, 4.6, 88, true, '10:00 AM - 11:00 PM'],
  ['mock-cebu-039', 'SRP Sunset Coffee', 'Specialty Coffee', ['Specialty Coffee', 'Outdoor'], 'Barangay Mambaling, Cebu City', 10.2768, 123.9079, 4.4, 52, false, '8:00 AM - 10:00 PM'],
  ['mock-cebu-040', 'Inayawan Market Grill', 'Street Food', ['Street Food', 'Market'], 'Barangay Inayawan, Cebu City', 10.2624, 123.8433, 4.0, 62, false, '5:00 AM - 9:00 PM'],
  ['mock-cebu-041', 'Quiot Neighborhood Cafe', 'Cafe', ['Cafe', 'Local'], 'Barangay Quiot, Cebu City', 10.2829, 123.8608, 4.1, 38, false, '7:00 AM - 8:30 PM'],
  ['mock-cebu-042', 'Sambag Study Lounge', 'Co-working', ['Co-working', 'Cafe'], 'Barangay Sambag I, Cebu City', 10.3048, 123.8912, 4.5, 79, true, '8:00 AM - 12:00 AM'],
  ['mock-cebu-043', 'Urgello Rice Bowls', 'Restaurant', ['Restaurant', 'Budget'], 'Barangay Sambag I, Cebu City', 10.3021, 123.8943, 4.0, 57, false, '9:00 AM - 9:00 PM'],
  ['mock-cebu-044', 'Ramos Night Cafe', 'Cafe', ['Cafe', 'Chill Vibe'], 'Barangay Cogon Ramos, Cebu City', 10.3079, 123.8952, 4.3, 69, false, '9:00 AM - 1:00 AM'],
  ['mock-cebu-045', 'Junquera Student Bites', 'Street Food', ['Street Food', 'Budget'], 'Barangay Kamagayan, Cebu City', 10.3006, 123.8989, 4.0, 93, false, '10:00 AM - 11:00 PM'],
  ['mock-cebu-046', 'Kamputhaw Wine Room', 'Bar', ['Bar', 'Chill Vibe'], 'Barangay Kamputhaw, Cebu City', 10.3157, 123.8986, 4.4, 48, true, '5:00 PM - 1:00 AM'],
  ['mock-cebu-047', 'Zapatera Coffee Window', 'Specialty Coffee', ['Specialty Coffee', 'Quick Stop'], 'Barangay Zapatera, Cebu City', 10.3033, 123.9021, 4.2, 41, false, '7:00 AM - 7:00 PM'],
  ['mock-cebu-048', 'Lorega Market Meals', 'Street Food', ['Street Food', 'Market'], 'Barangay Lorega San Miguel, Cebu City', 10.3065, 123.9017, 4.0, 65, false, '6:00 AM - 9:00 PM'],
  ['mock-cebu-049', 'Carreta Warehouse Bar', 'Bar', ['Bar', 'Social Hub'], 'Barangay Carreta, Cebu City', 10.3105, 123.9089, 4.3, 72, true, '6:00 PM - 2:00 AM'],
  ['mock-cebu-050', 'Mango Avenue Social', 'Social Hub', ['Social Hub', 'Bar'], 'Barangay Kamputhaw, Cebu City', 10.3106, 123.8995, 4.5, 119, true, '4:00 PM - 2:00 AM'],
  ['mock-cebu-051', 'Luz Parkside Cafe', 'Cafe', ['Cafe', 'Outdoor'], 'Barangay Luz, Cebu City', 10.3242, 123.9026, 4.2, 44, false, '7:30 AM - 9:00 PM'],
  ['mock-cebu-052', 'Apas Pocket Diner', 'Restaurant', ['Restaurant', 'Local'], 'Barangay Apas, Cebu City', 10.3374, 123.9036, 4.1, 58, true, '10:00 AM - 10:00 PM'],
  ['mock-cebu-053', 'Busay View Deck Cafe', 'Outdoor', ['Outdoor', 'Cafe'], 'Barangay Busay, Cebu City', 10.3692, 123.8825, 4.7, 133, true, '7:00 AM - 11:00 PM'],
  ['mock-cebu-054', 'Beverly Hills Tea Garden', 'Outdoor', ['Outdoor', 'Cafe'], 'Barangay Lahug, Cebu City', 10.3426, 123.8896, 4.6, 86, true, '8:00 AM - 10:00 PM'],
  ['mock-cebu-055', 'Sirao Road Snack View', 'Outdoor', ['Outdoor', 'Street Food'], 'Barangay Sirao, Cebu City', 10.4102, 123.8786, 4.4, 74, false, '8:00 AM - 8:00 PM'],
] as const;

export const sampleSpots: Spot[] = [
  ...featuredSpots,
  ...cebuMockSpotSeeds.map(
    ([id, name, category, categories, address, latitude, longitude, rating, reviewCount, isReservable, openingHours], index) => ({
      id,
      name,
      description: `Mock Cebu City ${category.toLowerCase()} spot for map and discovery testing around ${address}.`,
      category,
      categories: [...categories],
      address,
      latitude,
      longitude,
      images: mockSpotImages[category] ?? mockSpotImages['Social Hub'],
      rating,
      review_count: reviewCount,
      reservation_type: 'free' as const,
      reservation_fee: 0,
      payment_required: false,
      opening_hours: openingHours,
      website_url: `https://example.com/${id}`,
      contact_number: `+63 917 555 ${String(3000 + index).slice(-4)}`,
      is_public: true,
      is_reservable: isReservable,
      owner_id: null,
      created_at: sampleCreatedAt,
    })
  ),
];

export const sampleActivities: Activity[] = [
  {
    id: 'activity-1',
    user_id: 'sample-user',
    user_name: 'Sarah Chen',
    action: 'discovered',
    target_name: 'Neon Brew Terminal',
    type: 'discovery',
    created_at: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
  },
  {
    id: 'activity-2',
    user_id: 'sample-user-2',
    user_name: 'Marco Santos',
    action: 'reserved',
    target_name: 'The Terraces Garden',
    type: 'reservation',
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
];

export const sampleCircles: Circle[] = [
  {
    id: 'circle-1',
    name: 'Cebu Coffee Circuit',
    owner_id: 'sample-user',
    members: ['sample-user', 'friend-1', 'friend-2', 'friend-3'],
    created_at: new Date().toISOString(),
  },
  {
    id: 'circle-2',
    name: 'Weekend City Walks',
    owner_id: 'sample-user',
    members: ['sample-user', 'friend-4', 'friend-5'],
    created_at: new Date().toISOString(),
  },
];

const sampleReviewers = [
  {
    id: 'sample-reviewer-mika',
    name: 'Mika Reyes',
    photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200',
  },
  {
    id: 'sample-reviewer-andre',
    name: 'Andre Lim',
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200',
  },
  {
    id: 'sample-reviewer-ella',
    name: 'Ella Yu',
    photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200',
  },
  {
    id: 'sample-reviewer-carlo',
    name: 'Carlo Tan',
    photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=200',
  },
  {
    id: 'sample-reviewer-jo',
    name: 'Jo Mercado',
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
  },
];

const reviewComments = [
  'Good find for a quick Cebu stop. The place matched the pinned location and the vibe felt easy to recommend.',
  'Dropped by with friends and the photos are accurate. Nice crowd, easy access, and worth saving for later.',
  'Clean setup and solid local energy. I would come back here when I am around the barangay again.',
  'The spot was easy to locate from the map. Cozy enough for a short hangout and the staff were welcoming.',
  'Nice atmosphere and a photogenic corner. Good test spot for checking reviews, images, and map pins.',
];

export const sampleReviews: Review[] = sampleSpots.flatMap((spot, spotIndex) =>
  [0, 1].map((reviewOffset) => {
    const reviewer = sampleReviewers[(spotIndex + reviewOffset) % sampleReviewers.length];
    const rating = Math.min(5, Number(((spot.rating ?? 4.2) - 0.2 + reviewOffset * 0.15).toFixed(1)));

    return {
      id: `review-${spot.id}-${reviewOffset + 1}`,
      spot_id: spot.id,
      user_id: reviewer.id,
      user_name: reviewer.name,
      user_photo_url: reviewer.photo,
      rating,
      comment: reviewComments[(spotIndex + reviewOffset) % reviewComments.length],
      media_urls: [spot.images?.[reviewOffset % (spot.images?.length || 1)] ?? mockSpotImages[spot.category]?.[0] ?? fallbackReviewImage],
      media_types: ['image'],
      likes_count: 4 + ((spotIndex + reviewOffset * 3) % 18),
      reports_count: 0,
      created_at: new Date(Date.now() - 1000 * 60 * (45 + spotIndex * 28 + reviewOffset * 90)).toISOString(),
    };
  })
);

export function makeSampleReservation(spot: Spot): Reservation {
  return {
    id: `sample-res-${spot.id}`,
    user_id: 'sample-user',
    spot_id: spot.id,
    spot_name: spot.name,
    reservation_date: new Date().toISOString().slice(0, 10),
    reservation_time: '18:00',
    guest_count: 2,
    guests: 2,
    note: null,
    fee: spot.reservation_fee,
    reservation_type: spot.reservation_fee > 0 ? 'paid' : 'free',
    reservation_fee: spot.reservation_fee,
    payment_required: spot.reservation_fee > 0,
    status: 'confirmed',
    payment_status: spot.reservation_fee > 0 ? 'paid' : 'not_required',
    payment_method: spot.reservation_fee > 0 ? 'demo' : null,
    payment_reference: null,
    qr_code: `CEBSPOT-${spot.id.toUpperCase()}`,
    created_at: new Date().toISOString(),
  };
}
