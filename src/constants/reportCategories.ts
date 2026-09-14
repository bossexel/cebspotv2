export const REVIEW_REPORT_CATEGORIES = [
  'Inaccurate or misleading review',
  'Frauds and scams',
  'Spam',
  'Hate speech',
  'Harassment or bullying',
  'Pornography and nudity',
  'Illegal activities and regulated goods',
  'Others',
  'Child or minor safety',
] as const;

export type ReviewReportCategory = (typeof REVIEW_REPORT_CATEGORIES)[number];

export function getReviewReportCategory(reason?: string | null): ReviewReportCategory {
  const normalizedReason = (reason ?? '').trim().toLowerCase();
  const exactCategory = REVIEW_REPORT_CATEGORIES.find((category) => {
    const normalizedCategory = category.toLowerCase();
    return normalizedReason === normalizedCategory || normalizedReason.startsWith(`${normalizedCategory}:`);
  });

  if (exactCategory) return exactCategory;
  if (/child|minor/.test(normalizedReason)) return 'Child or minor safety';
  if (/porn|nudity|sexual/.test(normalizedReason)) return 'Pornography and nudity';
  if (/harass|bully/.test(normalizedReason)) return 'Harassment or bullying';
  if (/hate/.test(normalizedReason)) return 'Hate speech';
  if (/illegal|regulated|drug|weapon/.test(normalizedReason)) return 'Illegal activities and regulated goods';
  if (/fraud|scam|fake/.test(normalizedReason)) return 'Frauds and scams';
  if (/spam/.test(normalizedReason)) return 'Spam';
  if (/wrong|incorrect|inaccurate|misleading|address|location|map|pin|website|contact|opening|description|category/.test(normalizedReason)) {
    return 'Inaccurate or misleading review';
  }
  return 'Others';
}
