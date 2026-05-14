export const mapTilerKey = process.env.EXPO_PUBLIC_MAPTILER_KEY;

export const darkTileUrl = mapTilerKey
  ? `https://api.maptiler.com/maps/dataviz-dark/256/{z}/{x}/{y}.png?key=${mapTilerKey}`
  : 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';

export const lightTileUrl = mapTilerKey
  ? `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${mapTilerKey}`
  : 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';

export const mapAttribution = mapTilerKey
  ? 'MapTiler | OpenStreetMap contributors'
  : 'OpenStreetMap contributors | CARTO';

export const staticMapTileUrl = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
export const fallbackStaticMapTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const staticMapAttribution = 'OpenStreetMap contributors | CARTO';
