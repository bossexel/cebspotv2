import type { CircleMember } from '../types';

export function getMemberCoordinate(member: Pick<CircleMember, 'location'>) {
  const latitude = member.location?.lat;
  const longitude = member.location?.lng;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function hasRecentLocation(member: Pick<CircleMember, 'location' | 'last_location_update'>, now = Date.now()) {
  if (!member.last_location_update || !getMemberCoordinate(member)) return false;
  const age = now - new Date(member.last_location_update).getTime();
  return age >= 0 && age <= 15 * 60 * 1000;
}
