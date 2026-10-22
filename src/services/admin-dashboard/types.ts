export type AdminMetricSnapshot = {
  totalSpots: number;
  publicSpots: number;
  reservableSpots: number;
  spotsToday: number;
  totalReservations: number;
  reservationsToday: number;
  reservations30d: number;
  confirmedReservations: number;
  estimatedRevenue: number;
  activeOwners: number;
  totalUsers: number;
  reportsFiled: number;
  pendingOwnerRequests: number;
  pendingSpotSubmissions: number;
};

export type AdminProgressItem = {
  label: string;
  value: number;
  copy?: string;
};

export type AdminDailyInsight = {
  key: string;
  label: string;
  reservations: number;
  reservationBar: number;
  newSpots: number;
  newSpotBar: number;
  estimatedRevenue: number;
  totalSpots: number;
  activeOwners: number;
  reportsFiled: number;
};

export type AdminListingRow = {
  id: string;
  name: string;
  category: string;
  barangay: string;
  status: string;
  date: string;
  image: string;
};

export type AdminMapSpotRow = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  categories: string[];
  address: string;
  barangay: string;
  latitude: number;
  longitude: number;
  rating: number;
  reviewCount: number;
  isPublic: boolean;
  isReservable: boolean;
};

export type AdminPulseRow = {
  id: string;
  action: string;
  user: string;
  location: string;
  value: string;
  status: string;
};

export type AdminReportSource = 'review_report' | 'spot_edit_suggestion';

export type AdminReportCoordinate = {
  latitude: number;
  longitude: number;
};

export type AdminReportReviewContext = {
  id: string;
  author: string;
  rating: number | null;
  comment: string;
  date: string;
  flagged?: boolean;
  mediaUrls?: string[];
};

export type AdminReportRow = {
  id: string;
  source: AdminReportSource;
  createdAt?: string | null;
  type: string;
  spotId?: string | null;
  reviewId?: string | null;
  field?: string | null;
  currentValue?: string | null;
  suggestedValue?: string | null;
  currentCoordinate?: AdminReportCoordinate | null;
  suggestedCoordinate?: AdminReportCoordinate | null;
  spot: string;
  area: string;
  reporter: string;
  date: string;
  description: string;
  reviewAuthor?: string | null;
  reviewRating?: number | null;
  reviewComment?: string | null;
  reviewDate?: string | null;
  reviewMediaUrls?: string[] | null;
  reviewThread?: AdminReportReviewContext[];
  note?: string | null;
  expanded?: boolean;
};

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  location: string;
  joined: string;
  avatar: string;
  photoUrl?: string | null;
};

export type AdminOwnerRequestRow = {
  id: string;
  requesterId: string | null;
  spotId?: string | null;
  applicant: string;
  initials: string;
  email: string;
  phone?: string | null;
  spot: string;
  fullAddress: string;
  category: string;
  accessNeeds: string[];
  verificationDocuments: string[];
  barangay: string;
  applied: string;
  status: string;
  message?: string | null;
  adminNotes?: string | null;
  reviewedAt?: string | null;
  expanded?: boolean;
};

export type AdminOwnerRequestDecision = 'approved' | 'rejected';

export type AdminOwnerRequestDecisionResult = {
  ok: boolean;
  requestId: string;
  status: AdminOwnerRequestDecision;
  spotId?: string | null;
  spotName?: string | null;
  alreadyReviewed?: boolean;
};

export type AdminSpotSubmissionRow = {
  id: string;
  name: string;
  category: string;
  categories?: string[] | null;
  barangay: string;
  address: string;
  latitude: number;
  longitude: number;
  submitted: string;
  createdAt?: string | null;
  status: string;
  image: string;
  images: string[];
  voteCount: number;
  searchCount: number;
  similarSubmissionCount: number;
  popularityScore: number;
  description?: string | null;
  reservationType?: string | null;
  reservationFee: number;
  paymentRequired: boolean;
  isReservable: boolean;
  submitterId: string;
  submitterName: string;
  submitterEmail: string;
};

export type AdminDashboardData = {
  source: 'live' | 'sample';
  generatedAt: string;
  metrics: AdminMetricSnapshot;
  reservationsBars: number[];
  reservationBarLabels: string[];
  newSpotBars: number[];
  newSpotBarLabels: string[];
  dailyInsights: AdminDailyInsight[];
  categories: AdminProgressItem[];
  barangays: AdminProgressItem[];
  recentListings: AdminListingRow[];
  livePulse: AdminPulseRow[];
  reports: AdminReportRow[];
  users: AdminUserRow[];
  ownerRequests: AdminOwnerRequestRow[];
  pendingSubmissions: AdminSpotSubmissionRow[];
  errors: string[];
};
