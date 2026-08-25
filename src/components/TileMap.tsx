import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Coffee, Disc3, Martini, Trees, UserRound, Utensils } from 'lucide-react-native';
import { colors } from '../constants/colors';
import { radius, spacing } from '../constants/design';
import { fallbackStaticMapTileUrl, staticMapAttribution, staticMapTileUrl } from '../constants/mapTiles';

const tileSize = 256;
const minZoom = 11;
const maxZoom = 18;
const minGestureDistance = 2;

// --- Transition tuning ---------------------------------------------------
// The "zoom out / swap / zoom in" punch. Total duration should roughly
// match what you had before (~620ms) but is now split into two native-
// driven legs instead of ~40 JS-driven setState calls.
const PUNCH_OUT_DURATION = 240;
const PUNCH_IN_DURATION = 360;
const PUNCH_MIN_SCALE = 0.62; // how far it "zooms out" before swapping content
// ---------------------------------------------------------------------

export interface TileMapMarker {
  id: string;
  latitude: number;
  longitude: number;
  color?: string;
  selected?: boolean;
  label?: string;
  category?: string;
  imageUrl?: string;
  variant?: 'bubble' | 'circle' | 'pin';
  size?: 'normal' | 'small';
  showIcon?: boolean;
}

interface TileMapProps {
  center: {
    latitude: number;
    longitude: number;
  };
  zoom?: number;
  markers?: TileMapMarker[];
  style?: ViewStyle;
  onMarkerPress?: (marker: TileMapMarker) => void;
  onPressCoordinate?: (coordinate: { latitude: number; longitude: number }) => void;
  onCenterChange?: (coordinate: { latitude: number; longitude: number }) => void;
  onZoomChange?: (zoom: number) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  transitionKey?: string | number;
  routeLine?: Array<{ latitude: number; longitude: number }>;
  showAttribution?: boolean;
}

function clampZoom(nextZoom: number) {
  return Math.max(minZoom, Math.min(maxZoom, nextZoom));
}

function touchDistance(touches: GestureResponderEvent['nativeEvent']['touches']) {
  if (touches.length < 2) return 0;
  const [first, second] = touches;
  const dx = first.pageX - second.pageX;
  const dy = first.pageY - second.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function lonToTileX(longitude: number, zoom: number) {
  return ((longitude + 180) / 360) * 2 ** zoom;
}

function latToTileY(latitude: number, zoom: number) {
  const latRad = (latitude * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** zoom;
}

function tileXToLon(tileX: number, zoom: number) {
  return (tileX / 2 ** zoom) * 360 - 180;
}

function tileYToLat(tileY: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * tileY) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function buildTileUrl(template: string, x: number, y: number, zoom: number) {
  const tileCount = 2 ** zoom;
  const wrappedX = ((x % tileCount) + tileCount) % tileCount;
  const clampedY = Math.max(0, Math.min(tileCount - 1, y));

  return template
    .replace('{z}', String(zoom))
    .replace('{x}', String(wrappedX))
    .replace('{y}', String(clampedY));
}

const TileImage = React.memo(function TileImage({
  x,
  y,
  zoom,
  left,
  top,
}: {
  x: number;
  y: number;
  zoom: number;
  left: number;
  top: number;
}) {
  const [useFallback, setUseFallback] = useState(false);
  const template = useFallback ? fallbackStaticMapTileUrl : staticMapTileUrl;

  return (
    <Image
      source={{ uri: buildTileUrl(template, x, y, zoom) }}
      onError={() => setUseFallback(true)}
      style={[styles.tile, { left, top }]}
    />
  );
});

function getMarkerCategoryInfo(category = '') {
  const lower = category.toLowerCase();

  if (lower.includes('friend') || lower.includes('person') || lower.includes('user')) {
    return { color: colors.primary, Icon: UserRound };
  }

  if (lower.includes('coffee') || lower.includes('cafe')) {
    return { color: '#D4A373', Icon: Coffee };
  }
  if (lower.includes('club') || lower.includes('pulse') || lower.includes('night')) {
    return { color: '#EC4899', Icon: Disc3 };
  }
  if (lower.includes('bar') || lower.includes('chill')) {
    return { color: '#3B82F6', Icon: Martini };
  }
  if (lower.includes('outdoor') || lower.includes('garden') || lower.includes('park')) {
    return { color: '#10B981', Icon: Trees };
  }

  return { color: '#10B981', Icon: Utensils };
}

const MapMarkerBubble = React.memo(function MapMarkerBubble({
  marker,
  left,
  top,
  onPress,
}: {
  marker: TileMapMarker;
  left: number;
  top: number;
  onPress?: () => void;
}) {
  const categoryInfo = getMarkerCategoryInfo(marker.category ?? marker.label);
  const Icon = categoryInfo.Icon;
  const markerColor = marker.color ?? categoryInfo.color;
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(marker.imageUrl && !imageFailed);
  const variant = marker.variant ?? 'bubble';
  const isSmall = marker.size === 'small';
  const showIcon = marker.showIcon ?? variant !== 'circle';
  const selectedAnim = useRef(new Animated.Value(marker.selected ? 1 : 0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setImageFailed(false);
  }, [marker.imageUrl]);

  useEffect(() => {
    Animated.spring(selectedAnim, {
      toValue: marker.selected ? 1 : 0,
      friction: 6,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [marker.selected, selectedAnim]);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    if (marker.selected) {
      pulseAnim.setValue(0);
      loop = Animated.loop(
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      );
      loop.start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0);
    }

    return () => {
      loop?.stop();
    };
  }, [marker.selected, pulseAnim]);

  const markerScale = selectedAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, isSmall ? 1.18 : 1.45],
  });
  const haloScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, isSmall ? 1.45 : 1.8],
  });
  const haloOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.32, 0],
  });

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.markerTouchable,
        {
          left: left - 22,
          top: top - 22,
        },
      ]}
    >
      {marker.selected && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.markerHalo,
            isSmall && styles.smallMarkerHalo,
            {
              backgroundColor: markerColor,
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />
      )}
      {variant === 'pin' ? (
        <Animated.View style={[styles.pinMarker, { transform: [{ scale: markerScale }] }]}>
          <View style={[styles.pinHead, { backgroundColor: hasImage ? colors.surfaceLow : markerColor }]}>
            {hasImage ? (
              <Image
                source={{ uri: marker.imageUrl! }}
                style={styles.pinMarkerImage}
                onError={() => setImageFailed(true)}
              />
            ) : showIcon ? (
              <Icon size={15} color={colors.secondary} strokeWidth={2.8} />
            ) : null}
          </View>
          <View style={[styles.pinTip, { backgroundColor: markerColor }]} />
        </Animated.View>
      ) : (
        <Animated.View
          style={[
            hasImage ? styles.imageMarker : variant === 'circle' ? [styles.circleMarker, isSmall && styles.smallCircleMarker] : styles.marker,
            {
              backgroundColor: hasImage ? colors.surfaceLow : markerColor,
              transform: [{ scale: markerScale }],
            },
          ]}
        >
          {hasImage ? (
            <Image source={{ uri: marker.imageUrl! }} style={styles.markerImage} onError={() => setImageFailed(true)} />
          ) : showIcon ? (
            <Icon size={15} color={colors.secondary} strokeWidth={2.8} />
          ) : null}
        </Animated.View>
      )}
    </Pressable>
  );
});

export function TileMap({
  center,
  zoom = 14,
  markers = [],
  style,
  onMarkerPress,
  onPressCoordinate,
  onCenterChange,
  onZoomChange,
  onInteractionStart,
  onInteractionEnd,
  transitionKey,
  routeLine = [],
  showAttribution = true,
}: TileMapProps) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [displayCenter, setDisplayCenter] = useState(center);
  const [displayZoom, setDisplayZoom] = useState(clampZoom(Math.round(zoom)));
  const dragTranslate = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const pinchScale = useRef(new Animated.Value(1)).current;

  // NEW: single native-driven value that "punches" the whole tile+marker
  // layer down then back up during a transition. This replaces the old
  // per-frame setState/requestAnimationFrame loop entirely.
  const punchScale = useRef(new Animated.Value(1)).current;
  const combinedScale = useRef(Animated.multiply(pinchScale, punchScale)).current;

  const dragStartCenter = useRef(displayCenter);
  const movedRef = useRef(false);
  const pinchStartDistance = useRef(0);
  const pinchStartZoom = useRef(displayZoom);
  const pinchLatestZoom = useRef(displayZoom);
  const isPinching = useRef(false);
  const lastTransitionKey = useRef<string | number | undefined>(transitionKey);
  const activePunch = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const nextZoom = clampZoom(Math.round(zoom));
    const isNewTransition =
      transitionKey !== undefined && transitionKey !== lastTransitionKey.current && layout.width && layout.height;

    lastTransitionKey.current = transitionKey;

    // Cancel any transition currently in flight so rapid swipes don't queue up.
    activePunch.current?.stop();

    if (!isNewTransition) {
      // No animated transition requested (e.g. first mount, or a plain prop
      // sync) — just snap directly, no animation needed.
      setDisplayCenter(center);
      setDisplayZoom(nextZoom);
      dragStartCenter.current = center;
      pinchLatestZoom.current = nextZoom;
      dragTranslate.setValue({ x: 0, y: 0 });
      pinchScale.setValue(1);
      punchScale.setValue(1);
      return;
    }

    // --- Punch-zoom transition -------------------------------------
    // 1. Scale the CURRENT tile/marker layer down (native thread, no
    //    React re-render happening here at all).
    // 2. The instant it bottoms out, swap the actual center/zoom state
    //    (one single setState) — this is fully hidden by the small scale,
    //    so the tile/image swap underneath is imperceptible.
    // 3. Scale back up to reveal the new spot already in place.
    dragTranslate.setValue({ x: 0, y: 0 });

    activePunch.current = Animated.sequence([
      Animated.timing(punchScale, {
        toValue: PUNCH_MIN_SCALE,
        duration: PUNCH_OUT_DURATION,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    activePunch.current.start(({ finished }) => {
      if (!finished) return;

      setDisplayCenter(center);
      setDisplayZoom(nextZoom);
      dragStartCenter.current = center;
      pinchLatestZoom.current = nextZoom;

      activePunch.current = Animated.timing(punchScale, {
        toValue: 1,
        duration: PUNCH_IN_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      activePunch.current.start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.latitude, center.longitude, zoom, transitionKey, layout.height, layout.width]);

  useEffect(
    () => () => {
      activePunch.current?.stop();
    },
    [],
  );

  function handleLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  }

  const centerWorld = useMemo(
    () => ({
      x: lonToTileX(displayCenter.longitude, displayZoom) * tileSize,
      y: latToTileY(displayCenter.latitude, displayZoom) * tileSize,
    }),
    [displayCenter.latitude, displayCenter.longitude, displayZoom],
  );

  const tiles = useMemo(() => {
    if (!layout.width || !layout.height) return [];

    const minTileX = Math.floor((centerWorld.x - layout.width / 2) / tileSize) - 1;
    const maxTileX = Math.floor((centerWorld.x + layout.width / 2) / tileSize) + 1;
    const minTileY = Math.floor((centerWorld.y - layout.height / 2) / tileSize) - 1;
    const maxTileY = Math.floor((centerWorld.y + layout.height / 2) / tileSize) + 1;
    const nextTiles: Array<{ key: string; x: number; y: number; left: number; top: number; url: string }> = [];

    for (let x = minTileX; x <= maxTileX; x += 1) {
      for (let y = minTileY; y <= maxTileY; y += 1) {
        nextTiles.push({
          key: `${displayZoom}-${x}-${y}`,
          x,
          y,
          left: layout.width / 2 + x * tileSize - centerWorld.x,
          top: layout.height / 2 + y * tileSize - centerWorld.y,
          url: buildTileUrl(staticMapTileUrl, x, y, displayZoom),
        });
      }
    }

    return nextTiles;
  }, [centerWorld.x, centerWorld.y, displayZoom, layout.height, layout.width]);

  const positionedMarkers = useMemo(() => {
    if (!layout.width || !layout.height) return [];

    return markers.map((marker) => {
      const worldX = lonToTileX(marker.longitude, displayZoom) * tileSize;
      const worldY = latToTileY(marker.latitude, displayZoom) * tileSize;
      return {
        ...marker,
        left: layout.width / 2 + worldX - centerWorld.x,
        top: layout.height / 2 + worldY - centerWorld.y,
      };
    });
  }, [centerWorld.x, centerWorld.y, displayZoom, layout.height, layout.width, markers]);

  const routeSegments = useMemo(() => {
    if (!layout.width || !layout.height || routeLine.length < 2) return [];

    const points = routeLine.map((point) => {
      const worldX = lonToTileX(point.longitude, displayZoom) * tileSize;
      const worldY = latToTileY(point.latitude, displayZoom) * tileSize;
      return {
        left: layout.width / 2 + worldX - centerWorld.x,
        top: layout.height / 2 + worldY - centerWorld.y,
      };
    });

    return points.slice(0, -1).map((point, index) => {
      const nextPoint = points[index + 1];
      const dx = nextPoint.left - point.left;
      const dy = nextPoint.top - point.top;
      const width = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      return {
        key: `${index}-${point.left}-${point.top}`,
        left: (point.left + nextPoint.left) / 2 - width / 2,
        top: (point.top + nextPoint.top) / 2 - 2,
        width,
        angle,
      };
    });
  }, [centerWorld.x, centerWorld.y, displayZoom, layout.height, layout.width, routeLine]);

  function coordinateFromEvent(event: GestureResponderEvent) {
    const worldX = centerWorld.x + event.nativeEvent.locationX - layout.width / 2;
    const worldY = centerWorld.y + event.nativeEvent.locationY - layout.height / 2;

    return {
      latitude: tileYToLat(worldY / tileSize, displayZoom),
      longitude: tileXToLon(worldX / tileSize, displayZoom),
    };
  }

  function centerFromDrag(dx: number, dy: number) {
    const startWorldX = lonToTileX(dragStartCenter.current.longitude, displayZoom) * tileSize;
    const startWorldY = latToTileY(dragStartCenter.current.latitude, displayZoom) * tileSize;

    return {
      latitude: tileYToLat((startWorldY - dy) / tileSize, displayZoom),
      longitude: tileXToLon((startWorldX - dx) / tileSize, displayZoom),
    };
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => Boolean(onPressCoordinate),
        onStartShouldSetPanResponderCapture: (event) => event.nativeEvent.touches.length >= 2,
        onMoveShouldSetPanResponderCapture: (event, gestureState) =>
          event.nativeEvent.touches.length >= 2 ||
          Math.abs(gestureState.dx) > minGestureDistance ||
          Math.abs(gestureState.dy) > minGestureDistance,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > minGestureDistance || Math.abs(gestureState.dy) > minGestureDistance,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          onInteractionStart?.();
          dragStartCenter.current = displayCenter;
          pinchStartDistance.current = touchDistance(event.nativeEvent.touches);
          pinchStartZoom.current = displayZoom;
          pinchLatestZoom.current = displayZoom;
          pinchScale.setValue(1);
          movedRef.current = false;
        },
        onPanResponderMove: (event, gestureState) => {
          if (event.nativeEvent.touches.length >= 2) {
            isPinching.current = true;
            const distance = touchDistance(event.nativeEvent.touches);
            if (pinchStartDistance.current > 0 && distance > 0) {
              const scale = distance / pinchStartDistance.current;
              const nextZoom = clampZoom(Math.round(pinchStartZoom.current + Math.log2(scale) * 1.8));
              pinchLatestZoom.current = nextZoom;
              pinchScale.setValue(Math.max(0.72, Math.min(1.38, scale)));
            }
            movedRef.current = true;
            dragTranslate.setValue({ x: 0, y: 0 });
            return;
          }

          if (
            Math.abs(gestureState.dx) > minGestureDistance ||
            Math.abs(gestureState.dy) > minGestureDistance
          ) {
            movedRef.current = true;
            dragTranslate.setValue({ x: gestureState.dx, y: gestureState.dy });
          }
        },
        onPanResponderRelease: (event, gestureState) => {
          if (isPinching.current) {
            const nextZoom = pinchLatestZoom.current;
            if (nextZoom !== displayZoom) {
              setDisplayZoom(nextZoom);
              onZoomChange?.(nextZoom);
            }
            pinchScale.setValue(1);
            dragTranslate.setValue({ x: 0, y: 0 });
          } else if (movedRef.current) {
            const nextCenter = centerFromDrag(gestureState.dx, gestureState.dy);
            setDisplayCenter(nextCenter);
            dragStartCenter.current = nextCenter;
            onCenterChange?.(nextCenter);
            setTimeout(() => dragTranslate.setValue({ x: 0, y: 0 }), 0);
          } else if (onPressCoordinate && layout.width && layout.height) {
            onPressCoordinate(coordinateFromEvent(event));
          }
          pinchStartDistance.current = 0;
          isPinching.current = false;
          onInteractionEnd?.();
          setTimeout(() => {
            movedRef.current = false;
          }, 0);
        },
        onPanResponderTerminate: (_, gestureState) => {
          if (movedRef.current) {
            const nextCenter = centerFromDrag(gestureState.dx, gestureState.dy);
            setDisplayCenter(nextCenter);
            dragStartCenter.current = nextCenter;
            onCenterChange?.(nextCenter);
          }
          pinchScale.setValue(1);
          setTimeout(() => dragTranslate.setValue({ x: 0, y: 0 }), 0);
          pinchStartDistance.current = 0;
          isPinching.current = false;
          movedRef.current = false;
          onInteractionEnd?.();
        },
      }),
    [
      centerWorld.x,
      centerWorld.y,
      displayCenter,
      displayZoom,
      layout.height,
      layout.width,
      onCenterChange,
      onInteractionEnd,
      onInteractionStart,
      onPressCoordinate,
      onZoomChange,
      dragTranslate,
      pinchScale,
    ],
  );

  return (
    <View
      style={[styles.container, style]}
      onLayout={handleLayout}
      onTouchStart={onInteractionStart}
      onTouchEnd={onInteractionEnd}
      onTouchCancel={onInteractionEnd}
      {...panResponder.panHandlers}
    >
      <Animated.View
        style={[
          styles.contentLayer,
          {
            transform: [
              { translateX: dragTranslate.x },
              { translateY: dragTranslate.y },
              { scale: combinedScale },
            ],
          },
        ]}
      >
        {tiles.map((tile) => (
          <TileImage
            key={tile.key}
            x={tile.x}
            y={tile.y}
            zoom={displayZoom}
            left={tile.left}
            top={tile.top}
          />
        ))}

        {routeSegments.map((segment) => (
          <View
            key={segment.key}
            pointerEvents="none"
            style={[
              styles.routeSegment,
              {
                left: segment.left,
                top: segment.top,
                width: segment.width,
                transform: [{ rotateZ: `${segment.angle}rad` }],
              },
            ]}
          />
        ))}

        {positionedMarkers.map((marker) => (
          <MapMarkerBubble
            key={marker.id}
            marker={marker}
            left={marker.left}
            top={marker.top}
            onPress={() => onMarkerPress?.(marker)}
          />
        ))}
      </Animated.View>

      {showAttribution && (
        <Text style={styles.attribution}>{staticMapAttribution}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainer,
  },
  tile: {
    position: 'absolute',
    width: tileSize,
    height: tileSize,
  },
  contentLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  markerTouchable: {
    position: 'absolute',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerHalo: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  smallMarkerHalo: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  marker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
  },
  circleMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.white,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
  },
  smallCircleMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  pinMarker: {
    width: 34,
    height: 42,
    alignItems: 'center',
  },
  pinHead: {
    width: 31,
    height: 31,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 1,
  },
  pinTip: {
    width: 13,
    height: 13,
    marginTop: -8,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.white,
    transform: [{ rotateZ: '45deg' }],
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  pinMarkerImage: {
    width: 27,
    height: 27,
    borderRadius: 14,
  },
  imageMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
  },
  markerImage: {
    width: '100%',
    height: '100%',
  },
  routeSegment: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    opacity: 0.82,
  },
  attribution: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.88)',
    color: colors.onSurfaceVariant,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontSize: 8,
    fontWeight: '800',
    overflow: 'hidden',
  },
});