import type { MapCoordinate } from '../components/map/types';

export function parseMapCoordinates(latitudeText: string, longitudeText: string): { coordinate: MapCoordinate | null; error: string | null } {
  const latitude = latitudeText.trim();
  const longitude = longitudeText.trim();
  const decimal = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
  if (!latitude || !longitude) return { coordinate: null, error: 'Enter both latitude and longitude.' };
  if (!decimal.test(latitude) || !decimal.test(longitude)) return { coordinate: null, error: 'Use decimal numbers, such as 10.3157 and 123.8854.' };
  const point = { latitude: Number(latitude), longitude: Number(longitude) };
  if (!Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90) return { coordinate: null, error: 'Latitude must be between -90 and 90.' };
  if (!Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180) return { coordinate: null, error: 'Longitude must be between -180 and 180.' };
  if (Math.abs(point.latitude) > 85.05112878) return { coordinate: null, error: 'This map supports latitudes between -85.05112878 and 85.05112878.' };
  return { coordinate: point, error: null };
}
