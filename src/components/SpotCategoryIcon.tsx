import React from 'react';
import { Coffee, Martini, Music2, Store, Trees, Utensils } from 'lucide-react-native';
import { getSpotCategoryText } from '../utils/spotCategory';

interface SpotCategoryIconProps {
  category?: string | null;
  categories?: string[] | null;
  color: string;
  size?: number;
  strokeWidth?: number;
}

export function SpotCategoryIcon({
  category,
  categories,
  color,
  size = 18,
  strokeWidth = 2.5,
}: SpotCategoryIconProps) {
  const value = getSpotCategoryText(category, categories);
  let Icon = Store;

  if (/coffee|cafe|co-working|coworking/.test(value)) Icon = Coffee;
  else if (/club|pulse|night|music|dance/.test(value)) Icon = Music2;
  else if (/bar|chill|pub|lounge/.test(value)) Icon = Martini;
  else if (/outdoor|garden|park|beach|nature/.test(value)) Icon = Trees;
  else if (/food|dining|restaurant|eatery|kitchen|grill/.test(value)) Icon = Utensils;

  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}
