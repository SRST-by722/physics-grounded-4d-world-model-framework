import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Resolve the same vendored Three.js used by the browser, without another copy.
registerHooks({
  resolve(specifier, context, next) {
    return next(
      specifier === 'three'
        ? new URL('../src/visualization/vendor/three/build/three.module.js', import.meta.url).href
        : specifier,
      context,
    );
  },
});
const THREE = await import('three');
const { createArticulation } = await import('../src/visualization/shared/indoor-articulation.mjs');

test('an opening interval holds a round-trip clip open and reverses to its closed pose', () => {
  const root = new THREE.Group(),
    drawer = new THREE.Group(),
    face = new THREE.Group();
  drawer.name = 'Drawer';
  root.add(drawer);
  drawer.add(face);
  const clip = new THREE.AnimationClip('drawer_slide', 3, [
    new THREE.VectorKeyframeTrack(
      'Drawer.position',
      [0, 1, 2, 3],
      [0, 0, 0, 0.4, 0, 0, 0.4, 0, 0, 0, 0, 0],
    ),
  ]);
  const art = createArticulation(root, [clip], { drawer_slide: [0, 1] });
  const entry = art.find(face);
  assert.ok(entry);
  art.toggle(entry);
  for (let i = 0; i < 40; i++) art.tick(0.05);
  assert.ok(Math.abs(drawer.position.x - 0.4) < 1e-6);
  assert.equal(art.tick(0.05), false);
  art.toggle(entry);
  for (let i = 0; i < 40; i++) art.tick(0.05);
  assert.equal(drawer.position.x, 0);
  art.dispose();
  assert.equal(art.find(face), null);
});
