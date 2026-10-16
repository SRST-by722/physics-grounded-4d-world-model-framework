import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateIndoorPortal, isTap } from '../src/visualization/shared/indoor-contract.mjs';

const config = JSON.parse(
  fs.readFileSync(new URL('../project/south_ken/configs/atrium_indoor.json', import.meta.url)),
);
test('a building link must not silently become a surveyed room transform', () => {
  assert.equal(validateIndoorPortal(config).building.id, 'way-110085215');
  for (const registration of [
    { status: 'surveyed', room_to_city: null },
    { status: 'building_verified_room_unregistered', room_to_city: [1, 0, 0, 0] },
  ])
    assert.throws(() => validateIndoorPortal({ ...config, registration }), /unregistered/);
});
test('malformed coordinates, remote paths and missing hashes are rejected', () => {
  assert.throws(() =>
    validateIndoorPortal({
      ...config,
      building: {
        ...config.building,
        bounds_gltf_m: [
          [0, 0, 0],
          [1, NaN, 1],
        ],
      },
    }),
  );
  for (const manifest of ['https://example.com/manifest.json', '../manifest.json'])
    assert.throws(() => validateIndoorPortal({ ...config, manifest }));
  assert.throws(() => validateIndoorPortal({ ...config, asset_sha256: '' }));
});
test('orbit dragging and long presses do not open a drawer', () => {
  const start = { x: 10, y: 20, time: 100 };
  assert.ok(isTap(start, { x: 11, y: 21, time: 200 }));
  assert.ok(!isTap(start, { x: 35, y: 21, time: 200 }));
  assert.ok(!isTap(start, { x: 10, y: 20, time: 700 }));
});
