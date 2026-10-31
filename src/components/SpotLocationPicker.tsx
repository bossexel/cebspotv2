import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MapPin, Minus, Plus, X } from 'lucide-react-native';
import { TileMap } from './TileMap';
import type { MapCoordinate, TileMapMarker } from './map/types';
import { colors } from '../constants/colors';
import { fontSize, radius, spacing } from '../constants/design';
import { useTheme } from '../hooks/useTheme';
import { parseMapCoordinates } from '../utils/mapCoordinates';
import { isCebuCoordinate } from '../utils/addressGeocoding';

export const SpotLocationPicker = memo(function SpotLocationPicker({ latitude, longitude, category, onChange, onInteractionChange,
  purpose = 'suggestion', mapVisible = true, onCloseMap }: {
  latitude: number; longitude: number; category: string;
  onChange: (coordinate: MapCoordinate | null) => void; onInteractionChange: (interacting: boolean) => void;
  purpose?: 'suggestion' | 'posting'; mapVisible?: boolean; onCloseMap?: () => void;
}) {
  const { appColors } = useTheme();
  const posting = purpose === 'posting';
  const [camera, setCamera] = useState({ center: { latitude, longitude }, zoom: 16, transitionKey: 0 });
  const [latitudeText, setLatitudeText] = useState(latitude.toFixed(7));
  const [longitudeText, setLongitudeText] = useState(longitude.toFixed(7));
  const [error, setError] = useState<string | null>(null);
  const drafts = useRef({ latitude: latitude.toFixed(7), longitude: longitude.toFixed(7) });
  const markers = useMemo<TileMapMarker[]>(() => posting ? [] : [{ id: 'original-location', latitude, longitude,
    category, label: 'Current pin', color: appColors.onSurfaceVariant, variant: 'circle', size: 'small', showIcon: false }],
  [latitude, longitude, category, appColors.onSurfaceVariant, posting]);

  const updateFromMap = useCallback((point: MapCoordinate) => {
    if (posting && !isCebuCoordinate(point)) {
      setError('CebSpot currently supports locations in Cebu only.');
      onChange(null);
      setCamera(current => ({ ...current, transitionKey: current.transitionKey + 1 }));
      return;
    }
    drafts.current = { latitude: point.latitude.toFixed(7), longitude: point.longitude.toFixed(7) };
    setLatitudeText(drafts.current.latitude); setLongitudeText(drafts.current.longitude); setError(null);
    setCamera(current => ({ ...current, center: point }));
    onChange(point);
  }, [onChange, posting]);
  const updateZoom = useCallback((zoom: number) => setCamera(current => ({ ...current, zoom })), []);
  const jumpToPoint = useCallback((point: MapCoordinate) => {
    updateFromMap(point);
    setCamera(current => ({ ...current, transitionKey: current.transitionKey + 1 }));
  }, [updateFromMap]);

  function editCoordinate(field: 'latitude' | 'longitude', text: string) {
    drafts.current = { ...drafts.current, [field]: text };
    if (field === 'latitude') setLatitudeText(text); else setLongitudeText(text);
    const parsed = parseMapCoordinates(drafts.current.latitude, drafts.current.longitude);
    const point = parsed.coordinate;
    const outsideCebu = Boolean(point && posting && !isCebuCoordinate(point));
    setError(outsideCebu ? 'CebSpot currently supports locations in Cebu only.' : parsed.error);
    onChange(outsideCebu ? null : point);
    if (outsideCebu) return;
    if (point) setCamera(current => ({ ...current, center: point, transitionKey: current.transitionKey + 1 }));
  }

  const startInteraction = useCallback(() => { Keyboard.dismiss(); onInteractionChange(true); }, [onInteractionChange]);
  const endInteraction = useCallback(() => onInteractionChange(false), [onInteractionChange]);

  return <View style={styles.picker}>
    {mapVisible && <>
    {posting && <View style={styles.mapHeader}>
      <Text style={[styles.label, { color: appColors.onSurface }]}>Choose spot location</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Hide spot location map" onPress={onCloseMap} style={styles.closeButton}>
        <X size={20} color={appColors.onSurface} />
      </Pressable>
    </View>}
    <View testID={posting ? 'post-location-map' : 'edit-location-map'} style={[styles.mapFrame, { borderColor: appColors.outlineVariant }]}>
      <TileMap style={styles.map} center={camera.center} zoom={camera.zoom} transitionKey={camera.transitionKey}
        animateCamera={false} markers={markers} onCenterChange={updateFromMap} onZoomChange={updateZoom}
        onPressCoordinate={jumpToPoint} onMarkerPress={jumpToPoint} onInteractionStart={startInteraction} onInteractionEnd={endInteraction} />
      <View pointerEvents="none" testID={posting ? 'post-location-pin' : 'suggested-location-pin'} style={styles.pin}>
        <MapPin size={40} color={colors.white} fill={colors.primary} strokeWidth={1.5} />
      </View>
      <View style={[styles.zoomControls, { backgroundColor: appColors.surfaceRaised }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={posting ? 'Zoom in on spot location' : 'Zoom in on suggested location'} disabled={camera.zoom >= 18}
          onPress={() => setCamera(current => ({ ...current, zoom: Math.min(18, current.zoom + 1), transitionKey: current.transitionKey + 1 }))} style={styles.zoomButton}>
          <Plus size={22} color={camera.zoom >= 18 ? appColors.outline : appColors.onSurface} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={posting ? 'Zoom out on spot location' : 'Zoom out on suggested location'} disabled={camera.zoom <= 11}
          onPress={() => setCamera(current => ({ ...current, zoom: Math.max(11, current.zoom - 1), transitionKey: current.transitionKey + 1 }))} style={styles.zoomButton}>
          <Minus size={22} color={camera.zoom <= 11 ? appColors.outline : appColors.onSurface} />
        </Pressable>
      </View>
    </View>
    <Text style={[styles.hint, { color: appColors.onSurfaceVariant }]}>Drag the map under the orange pin, tap a location, or enter coordinates below.</Text>
    </>}
    {posting && <Text style={[styles.label, { color: appColors.onSurface }]}>Coordinates (optional)</Text>}
    {posting && !mapVisible && <Text style={[styles.hint, { color: appColors.onSurfaceVariant }]}>Know the coordinates? Enter both, or tap the pin icon beside Address to choose on the map.</Text>}
    <View style={styles.coordinates}>
      <View style={styles.field}>
        <Text style={[styles.label, { color: appColors.onSurface }]}>Latitude</Text>
        <TextInput accessibilityLabel={posting ? 'Spot latitude' : 'Suggested latitude'} value={latitudeText} onChangeText={text => editCoordinate('latitude', text)}
          keyboardType="numeric" autoCorrect={false} autoCapitalize="none" placeholder="10.3157" maxLength={24}
          style={[styles.input, { color: appColors.onSurface, backgroundColor: appColors.inputSurface, borderColor: error ? appColors.danger : appColors.inputBorder }]} />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: appColors.onSurface }]}>Longitude</Text>
        <TextInput accessibilityLabel={posting ? 'Spot longitude' : 'Suggested longitude'} value={longitudeText} onChangeText={text => editCoordinate('longitude', text)}
          keyboardType="numeric" autoCorrect={false} autoCapitalize="none" placeholder="123.8854" maxLength={24}
          style={[styles.input, { color: appColors.onSurface, backgroundColor: appColors.inputSurface, borderColor: error ? appColors.danger : appColors.inputBorder }]} />
      </View>
    </View>
    {error ? <Text accessibilityRole="alert" style={[styles.hint, { color: appColors.danger }]}>{error}</Text>
      : <Text style={[styles.hint, { color: appColors.onSurfaceVariant }]}>{posting
        ? 'Coordinates and the pin stay in sync. Dragging the map updates both values when you release it.'
        : 'The pin moves as soon as both coordinates are valid. Your suggestion is reviewed before the live map changes.'}</Text>}
  </View>;
});

const styles = StyleSheet.create({
  picker: { gap: spacing.sm },
  mapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  closeButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  mapFrame: { height: 250, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1 },
  map: { flex: 1 },
  pin: { position: 'absolute', left: '50%', top: '50%', marginLeft: -20, marginTop: -37 },
  zoomControls: { position: 'absolute', top: spacing.sm, right: spacing.sm, borderRadius: radius.md, overflow: 'hidden' },
  zoomButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  coordinates: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  field: { flexGrow: 1, flexBasis: 130, gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: radius.md, minHeight: 48, paddingHorizontal: spacing.sm, fontSize: fontSize.md },
  hint: { fontSize: fontSize.sm, lineHeight: 18 },
});
