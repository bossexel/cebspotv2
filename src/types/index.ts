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
export type AppRole = 'admin' | 'owner' | 'user';

export interface UserProfile {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name: string | null;
  email: string;
  role: AppRole;
  photo_url: string | null;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  } | null;
  last_location_update?: string | null;
  level: number;
  points: number;
  total_xp?: number;
  current_level?: number;
  friends: string[];
  created_at?: string;
  updated_at?: string;
}

export interface Circle {
  id: string;
  name: string;
  owner_id: string;
  members: string[];
  invite_code?: string | null;
  invite_expires_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface CircleMember {
  id: string;
  display_name: string | null;
  photo_url: string | null;
  location: { lat?: number; lng?: number } | null;
  last_location_update: string | null;
  is_owner: boolean;
}

export interface CircleInvite {
  code: string;
  expires_at: string;
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
  gcash_wallet_number?: string | null;
  gcash_wallet_name?: string | null;
  gcash_qr_url?: string | null;
  gcash_amount?: number | null;
  table_inventory?: Record<string, Array<{ tableId: string; capacity: number; isReserved?: boolean }>> | null;
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
  payer_gcash_number?: string | null;
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
  media_urls?: string[] | null;
  spot_count: number;
  comments_count: number;
  source_type: LocalUpdateSourceType;
  source_id?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface LocalUpdateComment {
  id: string;
  local_update_id: string;
  user_id: string;
  user_name: string;
  user_photo_url?: string | null;
  body: string;
  created_at: string;
  updated_at?: string;
}

export interface SpotVoteResult {
  vote_count: number;
  voted: boolean;
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
  gcash_wallet_number?: string | null;
  gcash_wallet_name?: string | null;
  gcash_qr_url?: string | null;
  gcash_amount?: number | null;
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

export type SpotEditSuggestionStatus = 'pending' | 'approved' | 'rejected';

export interface SpotEditSuggestion {
  id: string;
  spot_id: string;
  user_id: string;
  field: string;
  current_value?: string | null;
  suggested_value: string;
  note?: string | null;
  status: SpotEditSuggestionStatus;
  admin_notes?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface PointTransaction {
  id: string;
  user_id?: string;
  activity_type: string;
  points: number;
  reference_id?: string | null;
  reference_type?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface GamificationAchievement {
  id?: string;
  achievementId?: string;
  code: string;
  name: string;
  description: string;
  iconName?: string | null;
  requirementType: string;
  requirementValue: number;
  xpReward: number;
  progress: number;
  completed: boolean;
  unlockedAt?: string | null;
}

export interface GamificationSummary {
  totalXp: number;
  currentLevel: number;
  nextLevelXp: number;
  achievements: GamificationAchievement[];
  recentTransactions: PointTransaction[];
}

export interface GamificationLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatar: string;
  totalXp: number;
  currentLevel: number;
  achievementsUnlocked: number;
}

export interface GamificationLeaderboard {
  leaders: GamificationLeaderboardEntry[];
  myRank?: GamificationLeaderboardEntry | null;
}

export interface SpotVisit {
  id: string;
  user_id: string;
  spot_id: string;
  latitude: number;
  longitude: number;
  distance_from_spot?: number | null;
  location_accuracy?: number | null;
  verified: boolean;
  visited_at: string;
}

export type NewReview = Omit<Review, 'id' | 'created_at' | 'updated_at' | 'likes_count' | 'reports_count'>;
export type NewSpotEditSuggestion = Omit<
  SpotEditSuggestion,
  'id' | 'status' | 'admin_notes' | 'created_at' | 'updated_at'
>;

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

export interface SpotSubmissionMediaAsset {
  id: string;
  uri: string;
  type: 'image' | 'video';
  mimeType?: string | null;
  durationMs?: number | null;
  fileName?: string | null;
  fileSize?: number | null;
  isDraftFile?: boolean;
}

export type NewSpotSubmissionUpload = NewSpotSubmission & {
  media?: SpotSubmissionMediaAsset[];
  draftId?: string;
};

export interface SpotSubmissionDraft {
  id: string;
  name: string;
  description: string;
  address: string;
  selectedCategories: string[];
  acceptsReservations: boolean | null;
  latitude: number;
  longitude: number;
  media: SpotSubmissionMediaAsset[];
  updatedAt: string;
}

export type NewOwnerAccessRequest = Omit<
  OwnerAccessRequest,
  'id' | 'status' | 'created_at' | 'updated_at' | 'admin_notes'
>;

export type NewReservation = Omit<Reservation, 'id' | 'created_at' | 'updated_at'>;

export type NewActivity = Omit<Activity, 'id' | 'created_at'>;

export type NewLocalUpdate = Omit<LocalUpdate, 'id' | 'created_at' | 'updated_at' | 'spot_count' | 'comments_count'> &
  Partial<Pick<LocalUpdate, 'spot_count' | 'comments_count'>>;
