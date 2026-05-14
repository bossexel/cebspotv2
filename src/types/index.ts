export type ReservationType = 'free' | 'paid';
export type ReservationStatus =
  | 'pending'
  | 'pending_payment'
  | 'confirmed'
  | 'cancelled'
  | 'rescheduled'
  | 'completed'
  | 'no_show';
export type PaymentStatus =
  | 'not_required'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refund_pending'
  | 'refunded'
  | 'non_refundable';
export type RefundStatus = 'not_applicable' | 'pending_review' | 'approved' | 'rejected' | 'completed';

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
  reservation_type?: ReservationType;
  reservation_fee: number;
  payment_required?: boolean;
  opening_hours?: string | null;
  website_url?: string | null;
  contact_number?: string | null;
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
  table_id?: string | null;
  slot_id?: string | null;
  reservation_date: string;
  reservation_time: string;
  reservation_time_start?: string | null;
  reservation_time_end?: string | null;
  group_size_type?: string | null;
  guest_count?: number;
  guests: number;
  note?: string | null;
  fee: number;
  reservation_type: ReservationType;
  reservation_fee: number;
  payment_required: boolean;
  status: ReservationStatus;
  payment_status: PaymentStatus;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_proof_url?: string | null;
  refund_status?: RefundStatus;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  adjustment_acknowledged?: boolean;
  adjustment_acknowledged_at?: string | null;
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

export type LocalUpdateSourceType = 'recommendation' | 'spot_submission' | 'community';

export interface LocalUpdate {
  id: string;
  user_id?: string | null;
  user_name: string;
  user_photo_url?: string | null;
  title: string;
  body?: string | null;
  location_name: string;
  latitude?: number | null;
  longitude?: number | null;
  image_url?: string | null;
  spot_count: number;
  comments_count: number;
  source_type: LocalUpdateSourceType;
  source_id?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface SpotSubmission {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  categories?: string[] | null;
  address: string;
  latitude: number;
  longitude: number;
  images?: string[] | null;
  reservation_type?: ReservationType;
  reservation_fee: number;
  payment_required?: boolean;
  is_reservable?: boolean;
  submitter_id: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  created_at: string;
  updated_at?: string;
}

export type OwnerAccessRequestStatus = 'pending' | 'approved' | 'rejected';

export interface OwnerAccessRequest {
  id: string;
  requester_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string | null;
  spot_name: string;
  spot_address: string;
  category: string;
  access_needs: string[];
  message?: string | null;
  status: OwnerAccessRequestStatus;
  admin_notes?: string | null;
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

export type NewOwnerAccessRequest = Omit<
  OwnerAccessRequest,
  'id' | 'status' | 'created_at' | 'updated_at' | 'admin_notes'
>;

export type NewReservation = Omit<Reservation, 'id' | 'created_at' | 'updated_at'>;

export type NewActivity = Omit<Activity, 'id' | 'created_at'>;

export type NewLocalUpdate = Omit<LocalUpdate, 'id' | 'created_at' | 'updated_at' | 'spot_count' | 'comments_count'> &
  Partial<Pick<LocalUpdate, 'spot_count' | 'comments_count'>>;
