export const mapTilerKey = process.env.EXPO_PUBLIC_MAPTILER_KEY?.trim();
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
  : lightTileUrl;
export const fallbackStaticMapTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const staticMapAttribution = cartoBasemapsKey
  ? 'OpenStreetMap contributors | CARTO'
  : mapAttribution;

// Include OSM even when a commercial provider is selected: it is also the fallback.
export const staticMapAttributionHtml =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' +
  (cartoBasemapsKey
    ? ' | <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
    : mapTilerKey
      ? ' | <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">MapTiler</a>'
      : '');
