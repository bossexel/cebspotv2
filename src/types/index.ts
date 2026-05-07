export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'on-site';

export interface UserProfile {
  id: string;
  display_name: string | null;
  email: string;
  photo_url: string | null;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  } | null;
  last_location_update?: string | null;
  level: number;
  points: number;
  friends: string[];
  created_at?: string;
  updated_at?: string;
}

export interface Circle {
  id: string;
  name: string;
  owner_id: string;
  members: string[];
  created_at: string;
  updated_at?: string;
}

export interface Spot {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  categories?: string[] | null;
  address: string;
  latitude: number;
  longitude: number;
  images?: string[] | null;
  rating?: number | null;
  review_count?: number | null;
  reservation_fee: number;
  opening_hours?: string | null;
  is_public: boolean;
  is_reservable: boolean;
  owner_id?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Reservation {
  id: string;
  user_id: string;
  spot_id: string;
  spot_name: string;
  reservation_date: string;
  reservation_time: string;
  guests: number;
  fee: number;
  status: ReservationStatus;
  payment_status: PaymentStatus;
  qr_code: string;
  created_at: string;
  updated_at?: string;
}

export interface Activity {
  id: string;
  user_id: string;
  user_name: string;
  user_photo_url?: string | null;
  user_avatar?: string | null;
  action?: string | null;
  target_id?: string | null;
  target_name?: string | null;
  type: string;
  content?: string | null;
  spot_id?: string | null;
  spot_name?: string | null;
  created_at: string;
}

export interface SpotSubmission {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  images?: string[] | null;
  reservation_fee: number;
  submitter_id: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Review {
  id: string;
  spot_id: string;
  user_id: string;
  user_name?: string | null;
  user_photo_url?: string | null;
  rating: number;
  comment?: string | null;
  media_urls?: string[] | null;
  media_types?: string[] | null;
  likes_count?: number;
  reports_count?: number;
  created_at: string;
  updated_at?: string;
}

export type NewReview = Omit<Review, 'id' | 'created_at' | 'updated_at' | 'likes_count' | 'reports_count'>;

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
}

export type NewSpotSubmission = Omit<
  SpotSubmission,
  'id' | 'status' | 'created_at' | 'updated_at' | 'rejection_reason'
>;

export type NewReservation = Omit<Reservation, 'id' | 'created_at' | 'updated_at'>;

export type NewActivity = Omit<Activity, 'id' | 'created_at'>;
