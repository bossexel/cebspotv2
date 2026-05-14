import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import type { LocationData } from '../types';

const devFallbackLocation: LocationData = {
  latitude: 10.3298,
  longitude: 123.9054,
  accuracy: 25,
  timestamp: Date.now(),
};

export function useLocation() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestPermissions = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setError('Location permission was denied.');
      return false;
    }
    setError(null);
    return true;
  }, []);

  const getCurrentLocation = useCallback(async () => {
    setLoading(true);
    try {
      const allowed = await requestPermissions();
      if (!allowed) return null;

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const nextLocation: LocationData = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        accuracy: current.coords.accuracy ?? undefined,
        timestamp: current.timestamp,
      };
      setLocation(nextLocation);
      return nextLocation;
    } catch (locationError) {
      console.warn('Location unavailable, checking last known location:', locationError);
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        const nextLocation: LocationData = {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          accuracy: lastKnown.coords.accuracy ?? undefined,
          timestamp: lastKnown.timestamp,
        };
        setLocation(nextLocation);
        setError(null);
        return nextLocation;
      }
      if (__DEV__) {
        setLocation(devFallbackLocation);
        setError(null);
        return devFallbackLocation;
      }
      setError('Unable to get your current location.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [requestPermissions]);

  return {
    location,
    error,
    loading,
    requestPermissions,
    getCurrentLocation,
  };
}
