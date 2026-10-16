// A building link is not a surveyed room-to-city transform.
export function validateIndoorPortal(config) {
  if (config?.version !== 1 || config.scene_id !== 'south_ken')
    throw new Error('Unsupported indoor portal');
  if (
    config.registration?.status !== 'building_verified_room_unregistered' ||
    config.registration.room_to_city !== null
  )
    throw new Error('This portal supports unregistered room-local views only');
  const bounds = config.building?.bounds_gltf_m;
  if (
    !Array.isArray(bounds) ||
    bounds.length !== 2 ||
    bounds.some((v) => !Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) ||
    bounds[0].some((v, i) => v >= bounds[1][i])
  )
    throw new Error('Invalid building bounds');
  if (!/^way-\d+$/.test(config.building.id)) throw new Error('Missing building identity');
  const path = config.manifest;
  if (
    typeof path !== 'string' ||
    !/^project\/south_ken\/previews\/[a-z0-9_]+\/manifest\.json$/.test(path)
  )
    throw new Error('Invalid indoor manifest path');
  if (!/^[a-f0-9]{64}$/.test(config.asset_sha256)) throw new Error('Missing asset hash');
  return config;
}

export function isTap(start, end) {
  return start && end.time - start.time < 500 && Math.hypot(end.x - start.x, end.y - start.y) <= 6;
}
