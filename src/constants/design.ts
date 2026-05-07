export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  pill: 999,
};

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
  display: 32,
};

export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  lifted: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.16,
    shadowRadius: 30,
    elevation: 8,
  },
};

export const tabBarHeight = 92;

export const categories = [
  'Specialty Coffee',
  'Outdoor',
  'Street Food',
  'Social Hub',
  'Restaurant',
  'Co-working',
  'Cafe',
  'Bar',
];

export const reservationStatuses = {
  pending: 'pending',
  confirmed: 'confirmed',
  cancelled: 'cancelled',
} as const;

export const paymentStatuses = {
  unpaid: 'unpaid',
  paid: 'paid',
  onSite: 'on-site',
} as const;
