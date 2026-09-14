import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { fallbackStaticMapTileUrl, staticMapAttributionHtml, staticMapTileUrl } from '../constants/mapTiles';
import { MapSurface } from './map/MapSurface';
import type { MapCoordinate, MapPayload, TileMapProps } from './map/types';

export type { TileMapMarker } from './map/types';

function validCoordinate(value: unknown): value is MapCoordinate {
  if (!value || typeof value !== 'object') return false;
  const point = value as MapCoordinate;
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

/** Persistent slippy map. Gestures, tiles, and camera animation run in the map renderer. */
export const TileMap = React.memo(function TileMap(props: TileMapProps) {
  const {
    center, zoom = 14, markers, routeLine, routeLineColor = '#16a36a', transitionKey, style,
    showAttribution = true, attributionPosition = 'bottomleft', attributionInset = 10,
  } = props;
  const callbacks = useRef(props);
  callbacks.current = props;
  const touching = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  const startInteraction = useCallback(() => {
    if (touching.current) return;
    touching.current = true;
    callbacks.current.onInteractionStart?.();
  }, []);
  const endInteraction = useCallback(() => {
    if (!touching.current) return;
    touching.current = false;
    callbacks.current.onInteractionEnd?.();
  }, []);

  useEffect(() => endInteraction, [endInteraction]);

  const onMessage = useCallback((text: string) => {
    let data;
    try { data = JSON.parse(text); } catch { return; }
    if (!data || typeof data !== 'object') return;
    const current = callbacks.current;
    if (data.type === 'markerPress' && typeof data.id === 'string') {
      const marker = current.markers?.find((item) => item.id === data.id);
      if (marker) current.onMarkerPress?.(marker);
    } else if (data.type === 'coordinatePress' && validCoordinate(data.center)) {
      current.onPressCoordinate?.(data.center);
    } else if (data.type === 'viewport' && validCoordinate(data.center) && Number.isFinite(data.zoom)) {
      if (data.transitionKey !== current.transitionKey) return;
      current.onCenterChange?.(data.center);
      if (data.zoom !== current.zoom) current.onZoomChange?.(data.zoom);
    } else if (data.type === 'interactionStart') startInteraction();
    else if (data.type === 'interactionEnd') endInteraction();
  }, [endInteraction, startInteraction]);

  const payload = useMemo<MapPayload>(() => ({
    center: { latitude: center.latitude, longitude: center.longitude },
    zoom, markers: markers ?? [], routeLine: routeLine ?? [], routeLineColor, transitionKey,
    tileUrl: staticMapTileUrl, fallbackTileUrl: fallbackStaticMapTileUrl,
    attribution: staticMapAttributionHtml, showAttribution, attributionPosition, attributionInset, reduceMotion,
  }), [center.latitude, center.longitude, zoom, markers, routeLine, routeLineColor, transitionKey,
    showAttribution, attributionPosition, attributionInset, reduceMotion]);

  return (
    <View style={[styles.container, style]}>
      <MapSurface payload={payload} onMessage={onMessage} onTouchStart={startInteraction} onTouchEnd={endInteraction} />
    </View>
  );
});

const styles = StyleSheet.create({ container: { overflow: 'hidden', backgroundColor: '#eeeae2' } });
