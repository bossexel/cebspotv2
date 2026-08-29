export const mapTilerKey = process.env.EXPO_PUBLIC_MAPTILER_KEY;
export const cartoBasemapsKey = process.env.EXPO_PUBLIC_CARTO_BASEMAPS_API_KEY?.trim();

const cartoKeyQuery = cartoBasemapsKey
  ? `?key=${encodeURIComponent(cartoBasemapsKey)}`
  : '';

export const darkTileUrl = mapTilerKey
  ? `https://api.maptiler.com/maps/dataviz-dark/256/{z}/{x}/{y}.png?key=${mapTilerKey}`
  : cartoBasemapsKey
    ? `https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png${cartoKeyQuery}`
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const lightTileUrl = mapTilerKey
  ? `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${mapTilerKey}`
  : cartoBasemapsKey
    ? `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png${cartoKeyQuery}`
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const mapAttribution = mapTilerKey
  ? 'MapTiler | OpenStreetMap contributors'
  : cartoBasemapsKey
    ? 'OpenStreetMap contributors | CARTO'
    : 'OpenStreetMap contributors';

export const staticMapTileUrl = cartoBasemapsKey
  ? `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png${cartoKeyQuery}`
  : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const fallbackStaticMapTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const staticMapAttribution = cartoBasemapsKey
  ? 'OpenStreetMap contributors | CARTO'
  : 'OpenStreetMap contributors';
