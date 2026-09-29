// Geographic coordinate mapping for 3D Brazil map
export const GEO_CONFIG = {
  centerLat: -14.235,
  centerLon: -51.9253,
  minLat: -34.5,
  maxLat: 5.5,
  minLon: -74.5,
  maxLon: -34.0,
  mapWidth: 140, // 3D units X
  mapDepth: 140  // 3D units Z
};

/**
 * Converts Latitude and Longitude to 3D Scene coordinates (X, Z)
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @returns {{x: number, z: number}}
 */
export function latLonTo3D(lat, lon, out = null) {
  const normX = (lon - GEO_CONFIG.minLon) / (GEO_CONFIG.maxLon - GEO_CONFIG.minLon);
  const normZ = (lat - GEO_CONFIG.minLat) / (GEO_CONFIG.maxLat - GEO_CONFIG.minLat);

  // X goes from West (-mapWidth/2) to East (+mapWidth/2)
  const x = (normX - 0.5) * GEO_CONFIG.mapWidth;
  // Z goes from North (-mapDepth/2) to South (+mapDepth/2)
  const z = (0.5 - normZ) * GEO_CONFIG.mapDepth;

  if (out) {
    out.x = x;
    out.z = z;
    return out;
  }
  return { x, z };
}

/**
 * Converts 3D Scene coordinates (X, Z) back to Latitude and Longitude
 * @param {number} x - 3D X coordinate
 * @param {number} z - 3D Z coordinate
 * @param {object} [out] - Optional output object to write to
 * @returns {{lat: number, lon: number}}
 */
export function threeDToLatLon(x, z, out = null) {
  const normX = (x / GEO_CONFIG.mapWidth) + 0.5;
  const normZ = 0.5 - (z / GEO_CONFIG.mapDepth);

  const lon = GEO_CONFIG.minLon + normX * (GEO_CONFIG.maxLon - GEO_CONFIG.minLon);
  const lat = GEO_CONFIG.minLat + normZ * (GEO_CONFIG.maxLat - GEO_CONFIG.minLat);

  if (out) {
    out.lat = lat;
    out.lon = lon;
    return out;
  }
  return { lat, lon };
}
