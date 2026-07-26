/**
 * Distance in kilometers between two lat/lng points (Haversine formula).
 * Used as a fallback / for readability; the primary nearby-radius query
 * uses MongoDB's native $geoNear / $nearSphere on the 2dsphere index.
 */
function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Blur exact coordinates down to a rough area string, so residents never
 * see a reporter's exact location. Prefers the named estate; falls back to
 * coordinates rounded to ~2 decimal places (~1.1km of precision).
 */
function toRoughArea(lat, lng, estate) {
  if (estate) return estate;
  const roundedLat = Math.round(lat * 100) / 100;
  const roundedLng = Math.round(lng * 100) / 100;
  return `Near ${roundedLat.toFixed(2)}, ${roundedLng.toFixed(2)}`;
}

module.exports = { distanceKm, toRoughArea };
