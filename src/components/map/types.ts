import type { ViewStyle } from 'react-native';

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface TileMapMarker extends MapCoordinate {
  id: string;
  color?: string;
  selected?: boolean;
  label?: string;
  category?: string;
  imageUrl?: string;
  variant?: 'bubble' | 'circle' | 'pin';
  size?: 'normal' | 'small';
  showIcon?: boolean;
}

export interface TileMapProps {
  center: MapCoordinate;
  zoom?: number;
  markers?: TileMapMarker[];
  style?: ViewStyle;
  onMarkerPress?: (marker: TileMapMarker) => void;
  onPressCoordinate?: (coordinate: MapCoordinate) => void;
  onCenterChange?: (coordinate: MapCoordinate) => void;
  onZoomChange?: (zoom: number) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  transitionKey?: string | number;
  routeLine?: MapCoordinate[];
  routeLineColor?: string;
  showAttribution?: boolean;
  /** Position attribution above screen overlays such as the discovery carousel. */
  attributionPosition?: 'bottomleft' | 'bottomright' | 'topleft' | 'topright';
  attributionInset?: number;
}

export interface MapPayload {
  center: MapCoordinate;
  zoom: number;
  transitionKey?: string | number;
  markers: TileMapMarker[];
  routeLine: MapCoordinate[];
  routeLineColor: string;
  tileUrl: string;
  fallbackTileUrl: string;
  attribution: string;
  showAttribution: boolean;
  attributionPosition: NonNullable<TileMapProps['attributionPosition']>;
  attributionInset: number;
  reduceMotion: boolean;
}

export interface MapSurfaceProps {
  payload: MapPayload;
  onMessage: (data: string) => void;
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
}
