import type { Spot } from '../types';
import { calculateHaversineDistanceKm } from './distance';

const genericCategoryWords = new Set(['and', 'place', 'places', 'spot', 'spots', 'the']);

function categoryLabels(spot: Pick<Spot, 'category' | 'categories'>) {
  return Array.from(new Set([spot.category, ...(spot.categories ?? [])]
    .filter(Boolean)
    .map((category) => category.trim().toLowerCase())
    .filter(Boolean)));
}

function categoryWords(labels: string[]) {
  return new Set(labels.flatMap((label) => label.split(/[^a-z0-9]+/))
    .filter((word) => word.length > 2 && !genericCategoryWords.has(word)));
}

export function getCategorySimilarityScore(source: Spot, candidate: Spot) {
  const sourceLabels = categoryLabels(source);
  const candidateLabels = categoryLabels(candidate);
  const candidateLabelSet = new Set(candidateLabels);
  const exactMatches = sourceLabels.filter((label) => candidateLabelSet.has(label)).length;
  const sourceWords = categoryWords(sourceLabels);
  const sharedWords = [...categoryWords(candidateLabels)].filter((word) => sourceWords.has(word)).length;
  const primaryCategoryMatch = source.category.trim().toLowerCase() === candidate.category.trim().toLowerCase();

  return (primaryCategoryMatch ? 8 : 0) + exactMatches * 4 + sharedWords;
}

export function rankSimilarSpots(source: Spot, candidates: Spot[], limit = 6) {
  return candidates
    .filter((candidate) => candidate.id !== source.id && candidate.is_public)
    .map((candidate) => ({
      spot: candidate,
      categoryScore: getCategorySimilarityScore(source, candidate),
      distanceKm: calculateHaversineDistanceKm(
        { latitude: source.latitude, longitude: source.longitude },
        { latitude: candidate.latitude, longitude: candidate.longitude },
      ),
    }))
    .filter(({ categoryScore }) => categoryScore > 0)
    .sort((first, second) => {
      const categoryDelta = second.categoryScore - first.categoryScore;
      if (categoryDelta) return categoryDelta;

      const distanceDelta = first.distanceKm - second.distanceKm;
      if (Math.abs(distanceDelta) > 0.001) return distanceDelta;

      const ratingDelta = Number(second.spot.rating ?? 0) - Number(first.spot.rating ?? 0);
      if (Math.abs(ratingDelta) > 0.001) return ratingDelta;

      const reviewDelta = Number(second.spot.review_count ?? 0) - Number(first.spot.review_count ?? 0);
      if (reviewDelta) return reviewDelta;

      const recencyDelta = new Date(second.spot.created_at ?? 0).getTime() - new Date(first.spot.created_at ?? 0).getTime();
      return recencyDelta || first.spot.name.localeCompare(second.spot.name);
    })
    .slice(0, Math.max(0, limit))
    .map(({ spot, distanceKm }) => ({ spot, distanceKm }));
}
