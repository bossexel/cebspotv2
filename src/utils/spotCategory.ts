export function getSpotCategoryText(category?: string | null, categories?: string[] | null) {
  return [category, ...(categories ?? [])].filter(Boolean).join(' ').toLowerCase();
}

export function getSpotCategoryColor(category?: string | null, categories?: string[] | null) {
  const value = getSpotCategoryText(category, categories);

  if (/coffee|cafe|co-working|coworking/.test(value)) return '#D4A373';
  if (/club|pulse|night|music|dance/.test(value)) return '#EC4899';
  if (/bar|chill|pub|lounge/.test(value)) return '#3B82F6';
  if (/outdoor|garden|park|beach|nature/.test(value)) return '#22C55E';
  if (/food|dining|restaurant|eatery|kitchen|grill|hub/.test(value)) return '#10B981';
  return '#10B981';
}
