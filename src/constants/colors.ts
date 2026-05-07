export const colors = {
  primary: '#E14D00',
  primaryContainer: '#FF7941',
  secondary: '#0F172A',
  surface: '#F8F7F3',
  surfaceLow: '#F1F0EC',
  surfaceContainer: '#EBEAE4',
  surfaceHigh: '#E4E3DD',
  surfaceHighest: '#DDDCD5',
  onSurface: '#1C1B17',
  onSurfaceVariant: '#4A463D',
  outline: '#7D7767',
  outlineVariant: '#CEC6B4',
  white: '#FFFFFF',
  black: '#000000',
  success: '#2E7D32',
  successContainer: '#E8F5E9',
  danger: '#B3261E',
  dangerContainer: '#FCEEEE',
};

export const darkColors = {
  ...colors,
  surface: '#0A0A0A',
  surfaceLow: '#141414',
  surfaceContainer: '#1C1C1C',
  surfaceHigh: '#242424',
  surfaceHighest: '#2D2D2D',
  onSurface: '#F5F5F5',
  onSurfaceVariant: '#A0A0A0',
  outline: '#555555',
  outlineVariant: '#333333',
};

export type AppColors = typeof colors;
