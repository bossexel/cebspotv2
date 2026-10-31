import * as Location from 'expo-location';
import type { MapCoordinate } from '../components/map/types';

export type AddressPinResult =
  | { status: 'resolved'; coordinate: MapCoordinate }
  | { status: 'permission-required' }
  | { status: 'outside-cebu' }
  | { status: 'not-found' };

// Approximate supported-area outlines for Cebu Island and its main nearby
// islands. A geocoder result outside these areas must never move the spot pin.
const cebuAreas: Array<Array<[number, number]>> = [
  [
    [9.35, 123.25], [9.55, 123.28], [9.8, 123.35], [10.05, 123.45],
    [10.25, 123.55], [10.5, 123.68], [10.75, 123.75], [11.0, 123.82], [11.28, 123.87],
    [11.28, 124.14], [11.0, 124.16], [10.75, 124.15], [10.5, 124.12],
    [10.25, 124.02], [10.0, 123.9], [9.75, 123.82], [9.5, 123.74], [9.35, 123.65],
  ],
  [[10.24, 123.9], [10.24, 124.05], [10.4, 124.05], [10.4, 123.9]], // Mactan / Olango area
  [[11.1, 123.6], [11.1, 123.9], [11.4, 123.9], [11.4, 123.6]], // Bantayan area
  [[10.55, 124.15], [10.55, 124.55], [10.85, 124.55], [10.85, 124.15]], // Camotes area
];

function isInsideArea(latitude: number, longitude: number, area: Array<[number, number]>) {
  let inside = false;
  for (let i = 0, j = area.length - 1; i < area.length; j = i++) {
    const [latI, lonI] = area[i];
    const [latJ, lonJ] = area[j];
    const crosses = (latI > latitude) !== (latJ > latitude)
      && longitude < ((lonJ - lonI) * (latitude - latI)) / (latJ - latI) + lonI;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function isCebuCoordinate(coordinate: MapCoordinate) {
  return Number.isFinite(coordinate.latitude) && Number.isFinite(coordinate.longitude)
    && cebuAreas.some((area) => isInsideArea(coordinate.latitude, coordinate.longitude, area));
}

export async function resolveAddressPin(address: string): Promise<AddressPinResult> {
  const query = address.trim();
  if (query.length < 5) return { status: 'not-found' };

  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') return { status: 'permission-required' };

  const geocoderQuery = /\bcebu\b/i.test(query) ? query : `${query}, Cebu, Philippines`;
  const results = await Location.geocodeAsync(geocoderQuery);
  const validResults = results.filter((result) =>
    Number.isFinite(result.latitude) && Number.isFinite(result.longitude) &&
    result.latitude >= -90 && result.latitude <= 90 &&
    result.longitude >= -180 && result.longitude <= 180
  );
  const match = validResults.find((result) => isCebuCoordinate(result));
  if (!match && validResults.length) return { status: 'outside-cebu' };
  if (!match) return { status: 'not-found' };

  return {
    status: 'resolved',
    coordinate: { latitude: match.latitude, longitude: match.longitude },
  };
}
